import { randomUUID } from 'node:crypto';
import { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { HttpError } from './errors.js';

declare global { namespace Express { interface Request { user?: { id: string; role: 'viewer'|'analyst'|'admin' }; correlationId?: string } } }

export const correlationId: RequestHandler = (req, res, next) => {
  const id = req.header('x-correlation-id') || randomUUID(); req.correlationId = id; res.setHeader('x-correlation-id', id); next();
};

export const authenticate: RequestHandler = (req, _res, next) => {
  const value = req.header('authorization');
  if (!value) {
    if (env.NODE_ENV === 'development' || env.DEMO_MODE) { req.user = { id: 'local-demo', role: 'admin' }; return next(); }
    return next(new HttpError(401, 'Authentication required'));
  }
  const token = value.replace(/^Bearer\s+/i, '');
  const [role, id] = token.split(':');
  if (!id || !['viewer','analyst','admin'].includes(role)) return next(new HttpError(401, 'Invalid access token'));
  req.user = { id, role: role as 'viewer'|'analyst'|'admin' }; next();
};

export const requireRole = (...roles: Array<'viewer'|'analyst'|'admin'>): RequestHandler => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, 'Insufficient permissions'));
  next();
};

const buckets = new Map<string, { started: number; count: number }>();
export const apiRateLimit: RequestHandler = (req, res, next) => { const key = req.ip || 'unknown'; const now = Date.now(); const bucket = buckets.get(key); const current = !bucket || now - bucket.started >= 60_000 ? { started: now, count: 0 } : bucket; current.count++; buckets.set(key, current); res.setHeader('x-rate-limit-limit', '120'); if (current.count > 120) return next(new HttpError(429, 'Rate limit exceeded')); next(); };
