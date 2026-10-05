// src/middlewares/csrf.middleware.js

export function csrfMiddleware(req, res, next) {
  // Only apply CSRF protection to state-changing admin routes
  if (req.method === 'GET' || req.method === 'HEAD') {
    return next();
  }

  // Exempt authentication endpoints from CSRF check (pre-session login & logout)
  const path = req.originalUrl || req.path || '';
  if (path.includes('/staff/login') || path.includes('/staff/logout')) {
    return next();
  }

  // Check for CSRF token in header
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies?.['csrf_token'];

  if (!headerToken || !cookieToken) {
    return res.status(403).json({ error: 'CSRF token missing.' });
  }

  if (headerToken !== cookieToken) {
    return res.status(403).json({ error: 'CSRF token mismatch.' });
  }

  next();
}