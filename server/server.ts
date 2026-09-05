import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import dotenv from 'dotenv';

import {
  securityHeaders,
  corsConfig,
  csrfProtection,
  additionalHeaders,
  globalErrorHandler,
} from './middleware/security';
import { generalApiRateLimiter } from './middleware/rateLimiter';

import authRoutes from './routes/authRoutes';
import rootAdminRoutes from './routes/rootAdminRoutes';
import roomRoutes from './routes/roomRoutes';
import problemRoutes from './routes/problemRoutes';
import teamRoutes from './routes/teamRoutes';
import assignmentRoutes from './routes/assignmentRoutes';
import submissionRoutes from './routes/submissionRoutes';

import { prisma } from './db/prisma';

dotenv.config();

// Pre-warm database connection pool
prisma.$connect().catch(err => console.error('Prisma connection pool pre-warm error:', err));

const app = express();
const PORT = process.env.PORT || 5000;
const uploadDir = process.env.UPLOAD_DIR || 'uploads';

// ─── Security Middleware (applied early) ───────────────────────────────────
app.use(securityHeaders);
app.use(additionalHeaders);
app.use(corsConfig);
app.use(cookieParser(process.env.COOKIE_SECRET));

// ─── Body Parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ─── CSRF Protection (after body parsing) ──────────────────────────────────
app.use('/api', csrfProtection);

// ─── General API Rate Limiting ─────────────────────────────────────────────
app.use('/api', generalApiRateLimiter);

// ─── Static uploads serving ────────────────────────────────────────────────
const absoluteUploadPath = path.isAbsolute(uploadDir)
  ? uploadDir
  : path.join(process.cwd(), uploadDir);
app.use('/uploads', express.static(absoluteUploadPath));

// Health check (unauthenticated)
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'TechRoom API Server running smoothly', timestamp: new Date() });
});

// API Routes Registration
app.use('/api/auth', authRoutes);
app.use('/api/root-admin', rootAdminRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api', problemRoutes);
app.use('/api', teamRoutes);
app.use('/api', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);

// Production Static Serving
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Global Error Handler (MUST be last middleware) ────────────────────────
app.use(globalErrorHandler);

app.listen(PORT, () => {
  console.log(`🚀 TechRoom Server listening on http://localhost:${PORT}`);
});
