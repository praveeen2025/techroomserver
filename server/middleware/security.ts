import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';

// ─── Security Headers via Helmet ───────────────────────────────────────────
export const securityHeaders = helmet({
  contentSecurityPolicy: false, // Managed separately for SPA compatibility
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// ─── CORS Configuration ────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',');

export const corsConfig = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, mobile apps, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy: Origin not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'X-Room-Id'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400,
});

// ─── CSRF Protection ───────────────────────────────────────────────────────
// Validates that state-changing requests come from legitimate frontend clients
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  const stateMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (stateMethods.includes(req.method)) {
    const xRequestedWith = req.headers['x-requested-with'];
    const contentType = req.headers['content-type'] || '';

    // Allow requests that have X-Requested-With header (set by our frontend)
    // or are multipart/form-data (file uploads from our frontend)
    if (xRequestedWith === 'XMLHttpRequest' || contentType.includes('multipart/form-data')) {
      return next();
    }

    // Allow JSON API calls from authenticated sessions
    if (contentType.includes('application/json') && (req.headers.authorization || req.cookies?.techroom_token)) {
      return next();
    }

    // Block unverified state-changing requests
    return res.status(403).json({
      success: false,
      error: 'Invalid request origin.',
    });
  }

  next();
};

// ─── Global Error Handler ──────────────────────────────────────────────────
// Catches unhandled errors and returns generic messages (no stack traces)
export const globalErrorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Log the full error server-side for debugging
  console.error('[TechRoom Security] Unhandled Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    timestamp: new Date().toISOString(),
  });

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: 'File size exceeds the maximum allowed limit.',
    });
  }

  // CORS error
  if (err.message?.includes('CORS')) {
    return res.status(403).json({
      success: false,
      error: 'Cross-origin request blocked.',
    });
  }

  // Generic error response — never expose internals
  const statusCode = err.statusCode || err.status || 500;
  return res.status(statusCode).json({
    success: false,
    error: 'An unexpected server error occurred.',
  });
};

// ─── Audit Logger ──────────────────────────────────────────────────────────
// Logs security-relevant events with sanitized metadata
export const auditLog = (event: string, metadata: Record<string, any> = {}) => {
  // Sanitize metadata: strip passwords, tokens, hashes
  const sanitized = { ...metadata };
  const sensitiveKeys = ['password', 'passwordHash', 'token', 'secret', 'verificationToken', 'jwt'];
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  console.log(`[TechRoom Audit] ${event}`, {
    ...sanitized,
    timestamp: new Date().toISOString(),
  });
};

// ─── Additional Security Headers (manual) ──────────────────────────────────
export const additionalHeaders = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
};
