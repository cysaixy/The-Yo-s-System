// src/middlewares/rateLimit.middleware.js
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import rateLimit from 'express-rate-limit';

// Upstash Redis connection (works on Vercel, local, etc.)
// Falls back gracefully if not configured
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
  : null;

// Helper: create a Ratelimit instance or fall back to express-rate-limit (in-memory)
function createLimiter({ windowMs, max, prefix, keyGenerator, skip, handler }) {
  if (redis) {
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowMs}ms`),
      prefix: `ratelimit:${prefix}`,
      analytics: true,
    });

    return async (req, res, next) => {
      if (skip && skip(req)) return next();

      const key = keyGenerator ? keyGenerator(req) : req.ip;
      const { success, limit, remaining, reset } = await ratelimit.limit(key);

      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', new Date(reset).toISOString());

      if (!success) {
        if (handler) return handler(req, res);
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
      next();
    };
  }

  // Fallback: in-memory express-rate-limit (local dev without Redis)
  // Don't pass custom keyGenerator to let express-rate-limit use its default IP-based one
  // which handles IPv6 properly. Staff-based keyGenerator only works with Redis in production.
  return rateLimit({
    windowMs,
    max,
    skip,
    standardHeaders: true,
    legacyHeaders: false,
    handler: handler || ((req, res) => res.status(429).json({ error: 'Too many requests. Please try again later.' })),
  });
}

// Global limiter for standard API routes
export const globalLimiter = createLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100,
  prefix: 'global',
  skip: req => req.originalUrl.startsWith('/api/admin/sales/live-state'),
  handler: (req, res) => res.status(429).json({ error: 'Too many requests. Please try again after 15 minutes.' }),
});

// Stricter limiter for sensitive routes (e.g., login, password resets)
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  prefix: 'auth',
  handler: (req, res) => res.status(429).json({ error: 'Too many login attempts. Please try again after 15 minutes.' }),
});

// OTP send/verify endpoints
export const otpLimiter = createLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,
  prefix: 'otp',
  handler: (req, res) => res.status(429).json({ error: 'Too many verification requests. Please try again in a few minutes.' }),
});

// Transactional endpoints (e.g., POS order creation)
export const posLimiter = createLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  prefix: 'pos',
  handler: (req, res) => res.status(429).json({ error: 'Order rate limit reached. Please wait a moment before trying again.' }),
});

// Live dashboard polling (keyed per staff account)
export const liveStateLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 240,
  prefix: 'live-state',
  keyGenerator: req => `staff:${req.staff?.id || req.ip}`,
  handler: (req, res) => res.status(429).json({ error: 'Live updates are temporarily rate limited. They will resume automatically.' }),
});