import { ValidationError } from '@voltwise/engine';

export function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  if (err instanceof ValidationError || err.name === 'ValidationError') {
    const details = err.errors ? Object.values(err.errors).map((e) => e.message) : undefined;
    return res.status(400).json({
      error: err.message,
      ...(details ? { details } : {}),
    });
  }

  if (status >= 500) {
    console.error('[error]', err);
    return res.status(500).json({ error: 'Something went wrong on our side' });
  }
  return res.status(status).json({ error: err.message });
}

/** Wrap async route handlers so rejected promises reach the error handler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
