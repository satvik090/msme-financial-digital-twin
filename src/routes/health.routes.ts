import { Router } from 'express';
import { checkDatabase } from '../db/pool.js';
import { mlServiceClient } from '../clients/ml-service.client.js';
import { env } from '../config/env.js';

export const healthRouter = Router();

// Basic liveness - process is running
healthRouter.get('/', (_req, res) => res.json({ status: 'ok', service: 'msme-financial-digital-twin-api', version: '1.0.0' }));

// Liveness probe - same as root
healthRouter.get('/live', (_req, res) => res.json({ status: 'ok', service: 'msme-financial-digital-twin-api' }));

// Readiness probe - all critical dependencies healthy
healthRouter.get('/ready', async (req, res) => {
  const checks: Record<string, string> = {};
  let allHealthy = true;

  try {
    await checkDatabase();
    checks.database = 'ok';
  } catch (error) {
    checks.database = 'unavailable';
    allHealthy = false;
  }

  // ML service is optional for readiness (graceful degradation)
  try {
    await mlServiceClient.health();
    checks.mlService = 'ok';
  } catch {
    checks.mlService = 'degraded';
    // ML unavailability doesn't fail readiness - system can operate in degraded mode
  }

  checks.workerEnabled = String(env.EVENT_WORKER_ENABLED);

  const status = allHealthy ? 'ready' : 'degraded';
  const statusCode = allHealthy ? 200 : 503;

  return res.status(statusCode).json({
    status,
    service: 'msme-financial-digital-twin-api',
    timestamp: new Date().toISOString(),
    dependencies: checks,
  });
});

// ML-specific health endpoint
healthRouter.get('/ml', async (_req, res) => {
  try {
    const ml = await mlServiceClient.health();
    return res.json({ status: 'ok', ml });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ML service unavailable';
    return res.status(503).json({ status: 'unavailable', error: message });
  }
});
