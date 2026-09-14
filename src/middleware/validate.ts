import { RequestHandler } from 'express';
import { z, ZodType } from 'zod';

export const validate = (schema: ZodType): RequestHandler => (req, _res, next) => {
  const parsed = schema.parse({ body: req.body ?? {}, params: req.params ?? {}, query: req.query ?? {} });
  const value = parsed as { body: unknown; params: unknown; query: unknown };
  req.body = value.body;
  req.params = value.params as typeof req.params;
  // Express 5 exposes req.query as a read-only getter. Route handlers read
  // the validated values through their existing typed casts/defaults.
  next();
};
export const uuidParam = z.object({ params: z.object({ id: z.string().uuid() }), body: z.unknown(), query: z.unknown() });
