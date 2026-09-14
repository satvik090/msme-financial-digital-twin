import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { healthRouter } from './routes/health.routes.js';
import { businessRouter } from './routes/business.routes.js';
import { notFound, errorHandler } from './middleware/errors.js';
import { apiRateLimit, correlationId } from './middleware/security.js';

export const app = express();
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Local-network access is useful for product demos. Production remains
    // restricted to the explicit CORS_ORIGIN environment variable.
    if (!origin || env.NODE_ENV === 'development') return callback(null, true);
    if (origin === env.CORS_ORIGIN) return callback(null, true);
    return callback(new Error('CORS origin not allowed'));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));
app.use(correlationId);
app.use(apiRateLimit);
app.use('/health', healthRouter);
app.use('/api/v1/businesses', businessRouter);
app.use(express.static(join(dirname(fileURLToPath(import.meta.url)), 'public')));
app.use(notFound);
app.use(errorHandler);
