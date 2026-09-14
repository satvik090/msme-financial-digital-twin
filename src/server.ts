import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { pool } from './db/pool.js';
import { startFinancialEventWorker } from './workers/financial-event.worker.js';
import { attachDashboardGateway } from './realtime/dashboard.gateway.js';

const server = app.listen(env.PORT, () => logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'API server started'));
attachDashboardGateway(server);
const eventWorker = env.EVENT_WORKER_ENABLED ? startFinancialEventWorker() : undefined;

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutting down API server');
  server.close(async () => { if (eventWorker) await eventWorker.stop(); await pool.end(); process.exit(0); });
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
