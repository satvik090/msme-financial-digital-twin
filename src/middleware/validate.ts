import { RequestHandler } from 'express';
import { z, ZodType } from 'zod';

export const validate = (schema: ZodType): RequestHandler => (req, res, next) => {
  const parsed = schema.parse({ body: req.body ?? {}, params: req.params ?? {}, query: req.query ?? {} });
  const value = parsed as { body: unknown; params: unknown; query: unknown };
  req.body = value.body;
  req.params = value.params as typeof req.params;
  res.locals.validated = { query: value.query, params: value.params, body: value.body };
  next();
};
export const uuidParam = z.object({ params: z.object({ id: z.string().uuid() }), body: z.unknown(), query: z.unknown() });