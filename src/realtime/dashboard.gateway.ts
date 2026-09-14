import { Server } from 'node:http';
import { logger } from '../config/logger.js';
const listeners = new Map<string, Set<(payload: unknown) => void>>();
/** Optional realtime seam: a WebSocket adapter can be attached without changing domain code. */
export function attachDashboardGateway(_server: Server): void { logger.info('Realtime gateway seam initialized; REST remains the source of truth'); }
export function publishDashboardUpdate(businessId: string, payload: unknown): void { for (const listener of listeners.get(businessId) || []) listener(payload); }
export function subscribeDashboardUpdates(businessId: string, listener: (payload: unknown) => void): () => void { const set = listeners.get(businessId) || new Set(); set.add(listener); listeners.set(businessId, set); return () => set.delete(listener); }
