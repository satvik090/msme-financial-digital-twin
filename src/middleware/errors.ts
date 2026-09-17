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
