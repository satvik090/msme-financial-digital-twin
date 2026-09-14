import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http'; // FIXED: Named import
import { errorHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/auth';
import { msmeRoutes } from './routes/msme';
import { transactionRoutes } from './routes/transactions';
import { eventRoutes } from './routes/events';
import { analyticsRoutes } from './routes/analytics';
import { riskRoutes } from './routes/risk';
import { forecastRoutes } from './routes/forecast';
import { scenarioRoutes } from './routes/scenarios';
import { mlService } from './services/mlService';
import { env } from './config/env';
import { logger } from './utils/logger';

// Initialize ML service connection
mlService.initialize();

export const app = express();

// Middleware
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// CORS
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));

// Logging - FIXED: Call as function
app.use(pinoHttp({
  logger: logger,
  customLogLevel: function (_req, res, err) {
    if (res.statusCode >= 400 && res.statusCode < 500) return 'warn';
    if (res.statusCode >= 500 || err) return 'error';
    return 'info';
  },
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/msmes', msmeRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/risk', riskRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/api/scenarios', scenarioRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);