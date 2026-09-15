import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'msme-financial-digital-twin-api' },
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});

// Helper to enrich logs with correlation ID when available
export function withCorrelationId(req: unknown) {
  const expressReq = req as { headers?: Record<string, string>; correlationId?: string };
  const correlationId = expressReq?.headers?.['x-correlation-id'] || expressReq?.correlationId;
  return correlationId ? { correlationId } : {};
}
