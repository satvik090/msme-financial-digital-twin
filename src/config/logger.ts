import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'msme-financial-digital-twin-api' },
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
