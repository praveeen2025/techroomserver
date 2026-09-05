import { Router } from 'express';
import {
  login,
  registerAdmin,
  registerTeam,
  registerParticipant,
  getMe,
  updateUserProfile,
  verifyEmail,
  googleAuth,
  githubAuth,
  logout,
  getCustomCaptcha,
} from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import {
  loginRateLimiter,
  loginCooldown,
  registrationRateLimiter,
} from '../middleware/rateLimiter';

const router = Router();

// CAPTCHA endpoint
router.get('/captcha', getCustomCaptcha);

// Public auth routes (with rate limiting)
router.post('/login', loginRateLimiter, loginCooldown, login);
router.post('/register', registrationRateLimiter, registerParticipant);
router.post('/register-participant', registrationRateLimiter, registerParticipant);
router.post('/register-admin', registrationRateLimiter, registerAdmin);
router.post('/register-team', registrationRateLimiter, registerTeam);

// Email verification
router.get('/verify-email', verifyEmail);

// OAuth endpoints
router.post('/google', googleAuth);
router.post('/github', githubAuth);

// Authenticated routes
router.get('/me', authenticateToken, getMe);
router.put('/profile', authenticateToken, updateUserProfile);
router.post('/logout', authenticateToken, logout);

export default router;
