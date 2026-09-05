import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    teamCode?: string;
    role: 'ROOT_ADMIN' | 'ADMIN' | 'USER';
    roomId?: string;
  };
}

const JWT_SECRET = process.env.JWT_SECRET || 'techroom_secret_key_2026';

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  // 1. Try HttpOnly cookie first
  let token = req.cookies?.techroom_token;

  // 2. Fallback to Authorization header
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthRequest['user'];
    req.user = decoded;
    next();
  } catch (err) {
    // Clear invalid cookie if present
    res.clearCookie('techroom_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
    return res.status(403).json({ success: false, error: 'Invalid or expired token' });
  }
};

// Enhanced role check: verifies the user's role from the database, not just the JWT claim
export const requireRole = (allowedRoles: Array<'ROOT_ADMIN' | 'ADMIN' | 'USER'>) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
    }

    // Quick JWT claim check first
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Access forbidden. Insufficient permissions.',
      });
    }

    // Server-side DB verification for elevated roles
    if (req.user.role === 'ROOT_ADMIN' || req.user.role === 'ADMIN') {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { role: true, status: true },
        });

        if (!dbUser) {
          return res.status(403).json({
            success: false,
            error: 'Access forbidden. Account not found.',
          });
        }

        if (dbUser.status !== 'ACTIVE') {
          return res.status(403).json({
            success: false,
            error: 'Access forbidden. Account has been deactivated.',
          });
        }

        if (!allowedRoles.includes(dbUser.role as any)) {
          return res.status(403).json({
            success: false,
            error: 'Access forbidden. Insufficient permissions.',
          });
        }
      } catch (error) {
        console.error('[Auth] Role verification DB error:', error);
        return res.status(500).json({
          success: false,
          error: 'Authentication verification failed.',
        });
      }
    }

    next();
  };
};

// Helper: Set secure authentication cookie
export const setAuthCookie = (res: Response, token: string) => {
  const expiryDays = parseInt(process.env.SESSION_EXPIRY_DAYS || '7', 10);
  res.cookie('techroom_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: expiryDays * 24 * 60 * 60 * 1000, // days to ms
  });
};

// Helper: Clear authentication cookie
export const clearAuthCookie = (res: Response) => {
  res.clearCookie('techroom_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
};
