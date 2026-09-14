import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  DEMO_MODE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  EVENT_WORKER_ENABLED: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  EVENT_WORKER_POLL_MS: z.coerce.number().int().positive().default(1000),
  EVENT_WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  EVENT_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  EVENT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  EVENT_RETRY_BASE_MS: z.coerce.number().int().positive().default(1000),
  ML_SERVICE_URL: z.string().min(1).default('http://127.0.0.1:8000'),
  ML_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

export const env = schema.parse(process.env);
export type Environment = z.infer<typeof schema>;
