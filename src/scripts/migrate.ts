import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../db/pool.js';

async function main() {
  const schemaPath = join(process.cwd(), 'dist', 'db', 'schema.sql');
  const sql = await readFile(schemaPath, 'utf8');

  await pool.query(sql);
  console.log('Database schema applied');
}

main()
  .catch((error) => {
    console.error('Database migration failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
