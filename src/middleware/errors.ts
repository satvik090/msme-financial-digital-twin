import { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, _res, next) =>
  next(new HttpError(404, 'Route not found'));

export const errorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  _next,
) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      type: 'validation_error',
      message: 'Request validation failed',
      details: error.flatten(),
    });
  }

  const status = error instanceof HttpError ? error.status : 500;

  logger.error(
    {
      err: error,
      method: req.method,
      path: req.path,
    },
    'Request error',
  );

  return res.status(status).json({
    type: status === 500 ? 'internal_error' : 'request_error',
    message:
      error instanceof Error
        ? error.message
        : 'Internal server error',
    ...(error instanceof HttpError && error.details
      ? { details: error.details }
      : {}),
  });
};
