import rateLimit from "express-rate-limit";

// Global limiter for standard API routes
export const globalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // Limit each IP to 100 requests per window
  // The authenticated live-state stream has its own per-staff limiter below;
  // excluding it prevents several staff behind one restaurant IP from
  // exhausting the shared bucket simply by keeping the dashboard open.
  skip: req => req.originalUrl.startsWith('/api/admin/sales/live-state'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error: "Too many requests. Please try again after 15 minutes.",
    });
  },
});

// Stricter limiter for sensitive routes (e.g., login, password resets)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error: "Too many login attempts. Please try again after 15 minutes.",
    });
  },
});

// Dedicated limiter for OTP send/verify endpoints. Has its own counter
// (independent of admin login) and a higher limit so a shared cafe IP
// can't accidentally lock out customers' verification codes.
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30, // Limit each IP to 30 OTP requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error: "Too many verification requests. Please try again in a few minutes.",
    });
  },
});

// Moderate limiter for transactional endpoints (e.g., POS order creation)
export const posLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error: "Order rate limit reached. Please wait a moment before trying again.",
    });
  },
});

// Live dashboard polling is authenticated before this limiter runs and is
// keyed per staff account instead of per public IP. The allowance supports
// several open admin tabs while still bounding authenticated polling traffic.
export const liveStateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 240,
  keyGenerator: req => `staff:${req.staff.id}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error: "Live updates are temporarily rate limited. They will resume automatically.",
    });
  },
});
