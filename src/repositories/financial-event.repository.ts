import { createHash } from 'node:crypto';
import pg from 'pg';
import { pool } from '../db/pool.js';
import { FinancialEvent, FinancialEventInput, EventIngestionResult } from '../domain/financial-event.js';
import { FinancialState } from '../domain/financial-state.js';
import { HttpError } from '../middleware/errors.js';
import { applyFinancialEvent, emptyFinancialMetrics } from '../services/financial-state.calculator.js';

function eventPayload(input: FinancialEventInput): Record<string, unknown> {
  return {
    type: input.type,
    source: input.source,
    sourceEventId: input.sourceEventId,
    occurredAt: input.occurredAt.toISOString(),
    amount: input.amount,
    direction: input.direction,
    currency: input.currency,
    ...(input.description ? { description: input.description } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function payloadHash(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function mapFinancialEvent(row: Record<string, unknown>): FinancialEvent {
  const payload = row.payload as Record<string, unknown>;
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    type: String(payload.type) as FinancialEvent['type'],
    source: String(row.source),
    sourceEventId: String(row.source_event_id),
    occurredAt: new Date(String(row.occurred_at)),
    amount: Number(payload.amount),
    direction: String(payload.direction) as FinancialEvent['direction'],
    currency: String(payload.currency),
    description: payload.description ? String(payload.description) : undefined,
    metadata: payload.metadata as Record<string, unknown> | undefined,
    schemaVersion: Number(row.schema_version),
    receivedAt: new Date(String(row.received_at)),
    status: String(row.status) as FinancialEvent['status'],
    attempts: Number(row.attempts),
    nextAttemptAt: new Date(String(row.next_attempt_at)),
    processedAt: row.processed_at ? new Date(String(row.processed_at)) : null,
    lastError: row.last_error ? String(row.last_error) : null,
  };
}

export function mapFinancialState(row: Record<string, unknown>): FinancialState {
  return {
    businessId: String(row.business_id),
    version: Number(row.version),
    status: String(row.status) as FinancialState['status'],
    asOf: row.as_of ? new Date(String(row.as_of)) : null,
    health: { ...emptyFinancialMetrics(), ...(row.health as Record<string, unknown>) },
    freshness: (row.freshness as Record<string, unknown>) ?? {},
    updatedAt: new Date(String(row.updated_at)),
  };
}

async function insertTwinIfMissing(client: pg.PoolClient, businessId: string): Promise<void> {
  await client.query('INSERT INTO twin_state (business_id) VALUES ($1) ON CONFLICT (business_id) DO NOTHING', [businessId]);
}

export const financialEventRepository = {
  async ingest(businessId: string, input: FinancialEventInput): Promise<EventIngestionResult> {
    const client = await pool.connect();
    const payload = eventPayload(input);
    const hash = payloadHash(payload);
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO financial_events
          (business_id, event_type, source, source_event_id, occurred_at, payload, payload_hash)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (source, source_event_id) DO NOTHING
         RETURNING *`,
        [businessId, input.type, input.source, input.sourceEventId, input.occurredAt, JSON.stringify(payload), hash],
      );
      if (inserted.rows[0]) {
        await client.query('COMMIT');
        return { event: mapFinancialEvent(inserted.rows[0]), duplicate: false };
      }

      const existing = await client.query('SELECT * FROM financial_events WHERE source = $1 AND source_event_id = $2 FOR SHARE', [input.source, input.sourceEventId]);
      if (!existing.rows[0]) throw new Error('Event conflict could not be read after insert conflict');
      if (String(existing.rows[0].payload_hash) !== hash || String(existing.rows[0].business_id) !== businessId) {
        throw new HttpError(409, 'An event with this source and source event ID already exists with different data');
      }
      await client.query('COMMIT');
      return { event: mapFinancialEvent(existing.rows[0]), duplicate: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async claimPending(limit: number, lockTimeoutMs: number): Promise<FinancialEvent[]> {
    const result = await pool.query(
      `WITH candidates AS (
         SELECT id
         FROM financial_events
         WHERE (status = 'pending' AND next_attempt_at <= now())
            OR (status = 'processing' AND locked_at IS NOT NULL AND locked_at < now() - ($2 * interval '1 millisecond'))
         ORDER BY received_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE financial_events event
       SET status = 'processing', attempts = event.attempts + 1, locked_at = now(), last_error = NULL
       FROM candidates
       WHERE event.id = candidates.id
       RETURNING event.*`,
      [limit, lockTimeoutMs],
    );
    return result.rows.map(mapFinancialEvent);
  },

  async process(event: FinancialEvent): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM financial_events WHERE id = $1 FOR UPDATE', [event.id]);
      if (!current.rows[0] || ['processed', 'dead_letter'].includes(String(current.rows[0].status))) {
        await client.query('COMMIT');
        return;
      }
      const currentEvent = mapFinancialEvent(current.rows[0]);
      await insertTwinIfMissing(client, currentEvent.businessId);
      const stateResult = await client.query('SELECT * FROM twin_state WHERE business_id = $1 FOR UPDATE', [currentEvent.businessId]);
      const state = mapFinancialState(stateResult.rows[0]);
      const health = applyFinancialEvent(state.health, currentEvent);
      const asOf = !state.asOf || currentEvent.occurredAt > state.asOf ? currentEvent.occurredAt : state.asOf;
      const updatedState = await client.query(
        `UPDATE twin_state
         SET version = version + 1, status = 'available', as_of = $2,
             health = $3::jsonb,
             freshness = jsonb_build_object('lastProcessedAt', now(), 'lastEventReceivedAt', $4::timestamptz),
             updated_at = now()
         WHERE business_id = $1
         RETURNING *`,
        [currentEvent.businessId, asOf, JSON.stringify(health), currentEvent.receivedAt],
      );
      const snapshot = updatedState.rows[0];
      await client.query(
        `INSERT INTO twin_state_history (business_id, event_id, version, status, as_of, health, freshness)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
         ON CONFLICT (business_id, version) DO NOTHING`,
        [currentEvent.businessId, currentEvent.id, snapshot.version, snapshot.status, snapshot.as_of, JSON.stringify(snapshot.health), JSON.stringify(snapshot.freshness)],
      );
      await client.query(
        `UPDATE financial_events
         SET status = 'processed', processed_at = now(), locked_at = NULL, last_error = NULL
         WHERE id = $1`,
        [currentEvent.id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async markFailed(eventId: string, error: unknown, maxAttempts: number, retryBaseMs: number): Promise<'retrying' | 'dead_letter'> {
    const message = String(error instanceof Error ? error.message : error).slice(0, 2000);
    const result = await pool.query(
      `UPDATE financial_events
       SET status = CASE WHEN attempts >= $2 THEN 'dead_letter' ELSE 'pending' END,
           next_attempt_at = CASE WHEN attempts >= $2 THEN next_attempt_at ELSE now() + (($3 * power(2, attempts - 1)) * interval '1 millisecond') END,
           locked_at = NULL,
           dead_lettered_at = CASE WHEN attempts >= $2 THEN now() ELSE dead_lettered_at END,
           last_error = $4
       WHERE id = $1
       RETURNING status`,
      [eventId, maxAttempts, retryBaseMs, message],
    );
    return result.rows[0]?.status === 'dead_letter' ? 'dead_letter' : 'retrying';
  },

  async findState(businessId: string): Promise<FinancialState | null> {
    const result = await pool.query('SELECT * FROM twin_state WHERE business_id = $1', [businessId]);
    return result.rows[0] ? mapFinancialState(result.rows[0]) : null;
  },

  async listProcessed(businessId: string, options: { from?: Date; to?: Date; limit: number; offset: number }): Promise<FinancialEvent[]> {
    const values: unknown[] = [businessId];
    const clauses = ['business_id = $1', "status = 'processed'"];
    if (options.from) { values.push(options.from); clauses.push(`occurred_at >= $${values.length}`); }
    if (options.to) { values.push(options.to); clauses.push(`occurred_at < $${values.length}`); }
    values.push(options.limit, options.offset);
    const result = await pool.query(
      `SELECT * FROM financial_events WHERE ${clauses.join(' AND ')}
       ORDER BY occurred_at ASC, id ASC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return result.rows.map(mapFinancialEvent);
  },

  async listStateHistory(businessId: string, limit: number): Promise<FinancialState[]> {
    const result = await pool.query(
      `SELECT business_id, version, status, as_of, health, freshness, created_at AS updated_at
       FROM twin_state_history WHERE business_id = $1 ORDER BY version DESC LIMIT $2`,
      [businessId, limit],
    );
    return result.rows.map(mapFinancialState);
  },
};
