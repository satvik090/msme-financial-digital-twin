import { describe, expect, it } from 'vitest';
import { aggregateTrends, applyFinancialEvent, emptyFinancialMetrics } from '../src/services/financial-state.calculator.js';
import { FinancialEvent } from '../src/domain/financial-event.js';

const event = (overrides: Partial<FinancialEvent> = {}): FinancialEvent => ({
  id: 'event-1',
  businessId: 'business-1',
  type: 'revenue',
  source: 'test',
  sourceEventId: 'source-1',
  occurredAt: new Date('2026-01-01T00:00:00.000Z'),
  amount: 1000,
  direction: 'inflow',
  currency: 'INR',
  schemaVersion: 1,
  receivedAt: new Date('2026-01-01T00:00:01.000Z'),
  status: 'processing',
  attempts: 1,
  nextAttemptAt: new Date('2026-01-01T00:00:01.000Z'),
  processedAt: null,
  lastError: null,
  ...overrides,
});

describe('financial event state projection', () => {
  it('applies cash and revenue metrics for an inflow', () => {
    expect(applyFinancialEvent(emptyFinancialMetrics(), event())).toMatchObject({
      cashBalance: 1000,
      netCashFlow: 1000,
      totalRevenue: 1000,
      eventCount: 1,
      lastEventOccurredAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('applies an outflow without changing revenue', () => {
    expect(applyFinancialEvent(emptyFinancialMetrics(), event({ type: 'expense', direction: 'outflow', amount: 250 }))).toMatchObject({
      cashBalance: -250,
      netCashFlow: -250,
      totalExpenses: 250,
      totalRevenue: 0,
    });
  });

  it('aggregates deterministic weekly trend points', () => {
    const points = aggregateTrends([
      event({ occurredAt: new Date('2026-01-05T10:00:00.000Z'), amount: 1000 }),
      event({ id: 'event-2', sourceEventId: 'source-2', type: 'expense', direction: 'outflow', occurredAt: new Date('2026-01-06T10:00:00.000Z'), amount: 250 }),
    ], 'week');
    expect(points).toEqual([expect.objectContaining({ periodStart: '2026-01-05T00:00:00.000Z', inflows: 1000, outflows: 250, revenue: 1000, expenses: 250, netCashFlow: 750, eventCount: 2 })]);
  });
});
