// src/middlewares/error.middleware.js
// Mounted last in app.js so any next(err) call from a controller lands here
// instead of crashing the server or leaking a stack trace to the client.

function errorHandler(err, req, res, next) {
  console.error(err);

  // Postgres NOT NULL constraint violation — surface as clean 400
  if (err.code === '23502') {
    return res.status(400).json({ error: `Missing required field: ${err.column || 'invalid input'}.` });
  }

  // Postgres unique constraint violation (e.g. payments.order_id,
  // categories.name, staff.email, customers.email) — surface as a clean 409
  // instead of a generic 500.
  if (err.code === '23505') {
    return res.status(409).json({ error: 'That record already exists (duplicate value).' });
  }

  // Postgres foreign key violation — referenced row doesn't exist, or a
  // RESTRICT delete was blocked because something still references it.
  if (err.code === '23503') {
    return res.status(409).json({ error: 'This action conflicts with related data (foreign key constraint).' });
  }

  // Postgres CHECK constraint violation (e.g. invalid order_type, role, status)
  if (err.code === '23514') {
    return res.status(400).json({ error: 'Invalid value for one of the fields (violates a database constraint).' });
  }

  // Postgres connection timeout or terminated connection — surface as clean 503
  if (
    err.code === '08006' ||
    err.code === '08001' ||
    err.code === '57P01' ||
    (err.message && (
      err.message.includes('timeout exceeded') ||
      err.message.includes('Connection terminated') ||
      err.message.includes('ECONNREFUSED')
    ))
  ) {
    return res.status(503).json({ error: 'Database service is temporarily unavailable. Please try again in a few seconds.' });
  }

  const status = err.status || 500;
  const message =
    process.env.NODE_ENV === 'production' && status === 500
      ? 'Something went wrong on our end.'
      : err.message;

  res.status(status).json({ error: message || 'An unexpected error occurred.' });
}

export default errorHandler;
