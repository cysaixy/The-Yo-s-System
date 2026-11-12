// src/middlewares/csrf.middleware.js
import crypto from 'crypto';

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function csrfMiddleware(req, res, next) {
  // Only apply CSRF protection to state-changing admin routes
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  // Logout is exempt so any page (including the customer site, when a
  // customer signs in) can end a staff session. Login is NOT exempt:
  // login.html bootstraps a token from /staff/csrf-token first, which blocks
  // login-CSRF (forcing a victim's browser into an attacker's account).
  const path = req.originalUrl || req.path || '';
  if (path.startsWith('/api/admin/staff/logout')) {
    return next();
  }

  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies?.['csrf_token'];

  if (!headerToken || !cookieToken) {
    return res.status(403).json({ error: 'CSRF token missing.' });
  }

  if (!safeEqual(headerToken, cookieToken)) {
    return res.status(403).json({ error: 'CSRF token mismatch.' });
  }

  next();
}
