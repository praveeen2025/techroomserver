import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// ─── In-Memory Store for Failed Login Tracking ─────────────────────────────
const failedLoginAttempts = new Map<string, { count: number; lastAttempt: number }>();

// Clean up stale entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of failedLoginAttempts.entries()) {
    if (now - value.lastAttempt > 15 * 60 * 1000) {
      failedLoginAttempts.delete(key);
    }
  }
}, 30 * 60 * 1000);

// ─── Login Rate Limiter ────────────────────────────────────────────────────
// Max 10 requests per minute per IP
export const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again after 1 minute.',
  },
});

// ─── Login Cooldown Middleware ──────────────────────────────────────────────
// After 5 consecutive failed login attempts, enforce a 15-minute cooldown per IP
export const loginCooldown = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const record = failedLoginAttempts.get(ip);

  if (record && record.count >= 5) {
    const cooldownMs = 15 * 60 * 1000; // 15 minutes
    const elapsed = Date.now() - record.lastAttempt;

    if (elapsed < cooldownMs) {
      const remainingMinutes = Math.ceil((cooldownMs - elapsed) / 60000);
      return res.status(429).json({
        success: false,
        error: `Account temporarily locked due to repeated failed attempts. Try again in ${remainingMinutes} minute(s).`,
      });
    } else {
      // Cooldown expired, reset
      failedLoginAttempts.delete(ip);
    }
  }

  next();
};

// Record failed login attempt
export const recordFailedLogin = (req: Request) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const record = failedLoginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
  record.count += 1;
  record.lastAttempt = Date.now();
  failedLoginAttempts.set(ip, record);
};

// Reset failed login attempts on successful login
export const resetFailedLogin = (req: Request) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  failedLoginAttempts.delete(ip);
};

// ─── Registration Rate Limiter ─────────────────────────────────────────────
// Max 5 requests per hour per IP
export const registrationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Increased max limit for smooth development and testing
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many registration attempts. Please try again later.',
  },
});

// ─── Joining Code Rate Limiter ─────────────────────────────────────────────
// Max 10 attempts per minute per IP to prevent brute-forcing
export const joiningCodeRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many joining code attempts. Please try again after 1 minute.',
  },
});

// ─── General API Rate Limiter ──────────────────────────────────────────────
// Max 100 requests per minute per IP for general API endpoints
export const generalApiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please slow down.',
  },
});
