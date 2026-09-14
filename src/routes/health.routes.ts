import { Router } from 'express';
import { checkDatabase } from '../db/pool.js';
import { mlServiceClient } from '../clients/ml-service.client.js';

export const healthRouter = Router();
healthRouter.get('/', (_req, res) => res.json({ status: 'ok' }));
healthRouter.get('/live', (_req, res) => res.json({ status: 'ok' }));
healthRouter.get('/ready', async (_req, res) => {
  try { await checkDatabase(); return res.json({ status: 'ready', dependencies: { database: 'ok' } }); }
  catch { return res.status(503).json({ status: 'not_ready', dependencies: { database: 'unavailable' } }); }
});
healthRouter.get('/ml', async (_req, res) => {
  try {
    const ml = await mlServiceClient.health();
    return res.json({ status: 'ready', dependencies: { ml } });
  } catch {
    return res.status(503).json({ status: 'not_ready', dependencies: { ml: 'unavailable' } });
  }
});
