type Entry = { expiresAt: number; value: unknown };
const cache = new Map<string, Entry>();
const TTL_MS = 15_000;
export const dashboardCache = {
  get<T>(key: string): T | undefined { const item = cache.get(key); if (!item || item.expiresAt < Date.now()) { cache.delete(key); return undefined; } return item.value as T; },
  set(key: string, value: unknown): void { cache.set(key, { value, expiresAt: Date.now() + TTL_MS }); },
  invalidateBusiness(id: string): void { for (const key of cache.keys()) if (key.startsWith(`${id}:`)) cache.delete(key); },
};
