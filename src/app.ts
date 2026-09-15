import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { errorHandler } from './middleware/errors.js';
import { businessRouter } from './routes/business.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

export const app = express();

app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(
  pinoHttp({
    logger,
    customLogLevel: function (_req, res, err) {
      if (res.statusCode >= 400 && res.statusCode < 500) return 'warn';
      if (res.statusCode >= 500 || err) return 'error';
      return 'info';
    },
  })
);

app.use('/api/v1/businesses', businessRouter);
app.use('/api/v1/health', healthRouter);

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
  });
});

app.use(errorHandler);
