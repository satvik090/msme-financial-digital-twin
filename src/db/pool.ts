import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;
export const pool = new Pool({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX });
pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error', error));

export async function checkDatabase(): Promise<void> {
  await pool.query('SELECT 1');
}
