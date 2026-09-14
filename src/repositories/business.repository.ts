import { pool } from '../db/pool.js';
import { Business, CreateBusinessInput } from '../domain/business.js';

function map(row: Record<string, unknown>): Business {
  return { id: String(row.id), externalId: row.external_id ? String(row.external_id) : undefined,
    legalName: String(row.legal_name), displayName: row.display_name ? String(row.display_name) : undefined,
    currency: String(row.currency), timezone: String(row.timezone), createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)) };
}

export const businessRepository = {
  async findById(id: string): Promise<Business | null> {
    const result = await pool.query('SELECT * FROM businesses WHERE id = $1', [id]);
    return result.rows[0] ? map(result.rows[0]) : null;
  },
  async list(limit: number, offset: number): Promise<Business[]> {
    const result = await pool.query('SELECT * FROM businesses ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return result.rows.map(map);
  },
  async create(input: CreateBusinessInput): Promise<Business> {
    const result = await pool.query(
      `INSERT INTO businesses (external_id, legal_name, display_name, currency, timezone)
       VALUES ($1, $2, $3, COALESCE($4, 'INR'), COALESCE($5, 'Asia/Kolkata')) RETURNING *`,
      [input.externalId ?? null, input.legalName, input.displayName ?? null, input.currency ?? null, input.timezone ?? null]);
    return map(result.rows[0]);
  },
};
