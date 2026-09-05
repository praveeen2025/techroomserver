import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { AuthRequest, setAuthCookie, clearAuthCookie } from '../middleware/auth';
import { loginSchema } from '../../validations/schemas';
import { recordFailedLogin, resetFailedLogin } from '../middleware/rateLimiter';
import { auditLog } from '../middleware/security';
import { verifyCaptchaToken } from '../middleware/captcha';
import { CaptchaStore } from '../services/captchaStore';

const JWT_SECRET = process.env.JWT_SECRET || 'techroom_secret_key_2026';
const SESSION_EXPIRY_SECONDS = parseInt(process.env.SESSION_EXPIRY_DAYS || '7', 10) * 24 * 60 * 60;

// ─── Helper: Sanitize user object (NEVER expose sensitive fields) ──────────
const sanitizeUser = (user: any) => {
  if (!user) return null;
  const {
    passwordHash,
    verificationToken,
    verificationTokenExpires,
    failedLoginAttempts,
    lockoutUntil,
    ...safe
  } = user;
  return safe;
};

// ─── Helper: Sanitize team object ──────────────────────────────────────────
const sanitizeTeam = (team: any) => {
  if (!team) return null;
  const { passwordHash, ...safe } = team;
  return safe;
};

// Helper to generate unique Team Code
const generateTeamCode = async (): Promise<string> => {
  const count = await prisma.team.count();
  const num = (count + 1 + Math.floor(Math.random() * 100)).toString().padStart(4, '0');
  return `TR-TEAM-${num}`;
};

// ─── GET /api/auth/captcha ──────────────────────────────────────────────────
export const getCustomCaptcha = async (req: AuthRequest, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const type = req.query.type === 'math' ? 'math' : 'image';
    const challenge = CaptchaStore.createChallenge(type);
    return res.json({
      success: true,
      data: challenge,
    });
  } catch (error: any) {
    console.error('getCustomCaptcha error:', error);
    return res.status(500).json({ success: false, error: 'Failed to generate CAPTCHA challenge.' });
  }
};

// ─── Login ─────────────────────────────────────────────────────────────────
export const login = async (req: AuthRequest, res: Response) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error.errors[0].message,
      });
    }

    const { identifier, password } = parseResult.data;
    const captchaId = req.body.captchaId;
    const captchaAnswer = req.body.captchaAnswer;
    const trimmedId = identifier.trim();

    // Verify CAPTCHA if provided
    if (captchaId && captchaAnswer) {
      const captchaRes = verifyCaptchaToken(captchaId, captchaAnswer);
      if (!captchaRes.success) {
        return res.status(400).json({
          success: false,
          error: captchaRes.error || 'CAPTCHA verification failed. Please complete the security check.',
        });
      }
    }

    // 1. Check if identifier is User (Admin, Root Admin, or Participant)
    const user = await (prisma as any).user.findFirst({
      where: {
        email: trimmedId.toLowerCase(),
      },
    });

    if (user) {
      // Check account lockout
      if (user.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
        const remainingMs = new Date(user.lockoutUntil).getTime() - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        auditLog('LOGIN_LOCKED', { email: user.email, remainingMin });
        return res.status(429).json({
          success: false,
          error: `Account temporarily locked. Try again in ${remainingMin} minute(s).`,
        });
      }

      if (user.status !== 'ACTIVE') {
        auditLog('LOGIN_INACTIVE', { email: user.email });
        return res.status(403).json({ success: false, error: 'Your account has been deactivated.' });
      }

      // Check email verification for USER role participants
      if (user.role === 'USER' && !user.isVerified) {
        return res.status(403).json({
          success: false,
          error: 'Please verify your Gmail address before logging in. Check your inbox for the verification link.',
        });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        // Increment failed login attempts
        const newAttempts = (user.failedLoginAttempts || 0) + 1;
        const updateData: any = { failedLoginAttempts: newAttempts };

        // Lock account after 5 failed attempts for 15 minutes
        if (newAttempts >= 5) {
          updateData.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
          auditLog('ACCOUNT_LOCKED', { email: user.email, attempts: newAttempts });
        }

        await (prisma as any).user.update({
          where: { id: user.id },
          data: updateData,
        });

        recordFailedLogin(req);
        auditLog('LOGIN_FAILED', { email: user.email, attempts: newAttempts });
        return res.status(401).json({ success: false, error: 'Invalid email or password.' });
      }

      // Reset failed attempts on successful login
      if (user.failedLoginAttempts > 0 || user.lockoutUntil) {
        await (prisma as any).user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockoutUntil: null },
        });
      }

      resetFailedLogin(req);

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: SESSION_EXPIRY_SECONDS }
      );

      // Set HttpOnly cookie
      setAuthCookie(res, token);

      auditLog('LOGIN_SUCCESS', { email: user.email, role: user.role });

      return res.json({
        success: true,
        message: 'Login successful',
        token,
        role: user.role,
        user: sanitizeUser(user),
      });
    }

    // 2. Check if identifier is Team Code
    const team = await prisma.team.findFirst({
      where: {
        teamCode: trimmedId.toUpperCase(),
      },
      include: {
        room: true,
        members: true,
      },
    });

    if (team) {
      if (team.status !== 'ACTIVE') {
        return res.status(403).json({ success: false, error: 'Your team account is inactive.' });
      }

      const isPasswordValid = await bcrypt.compare(password, team.passwordHash);
      if (!isPasswordValid) {
        recordFailedLogin(req);
        auditLog('LOGIN_FAILED', { teamCode: team.teamCode });
        return res.status(401).json({ success: false, error: 'Invalid email or password.' });
      }

      resetFailedLogin(req);

      const token = jwt.sign(
        { id: team.id, teamCode: team.teamCode, role: 'USER', roomId: team.roomId },
        JWT_SECRET,
        { expiresIn: SESSION_EXPIRY_SECONDS }
      );

      // Set HttpOnly cookie
      setAuthCookie(res, token);

      auditLog('LOGIN_SUCCESS', { teamCode: team.teamCode });

      return res.json({
        success: true,
        message: 'Team Login successful',
        token,
        role: 'USER',
        team: sanitizeTeam(team),
      });
    }

    // Generic error message — don't reveal whether email/team code exists
    recordFailedLogin(req);
    return res.status(401).json({ success: false, error: 'Invalid email or password.' });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
  }
};

// ─── Register Event Admin / Organizer Account ─────────────────────────────
export const registerAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, Email, and Password are required.' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return res.status(400).json({ success: false, error: 'An admin account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = await (prisma as any).user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        isVerified: true, // Admin accounts are pre-verified
      },
    });

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: 'ADMIN' },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY_SECONDS }
    );

    setAuthCookie(res, token);
    auditLog('REGISTER_ADMIN', { email: newUser.email });

    return res.status(201).json({
      success: true,
      message: 'Organizer account registered successfully',
      token,
      role: 'ADMIN',
      user: sanitizeUser(newUser),
    });
  } catch (error: any) {
    console.error('registerAdmin error:', error);
    return res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
  }
};

// ─── Register Participant Account ──────────────────────────────────────────
export const registerParticipant = async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      academicYear,
      department,
      degree,
      dob,
      phone,
      email,
      password,
      confirmPassword,
      acceptedTerms,
      captchaId,
      captchaAnswer,
    } = req.body;

    if (!acceptedTerms) {
      return res.status(400).json({
        success: false,
        error: 'You must agree to the Terms & Conditions and Privacy Policy to create an account.',
      });
    }

    // Server-side CAPTCHA verification (if provided)
    if (captchaId && captchaAnswer) {
      const captchaRes = verifyCaptchaToken(captchaId, captchaAnswer);
      if (!captchaRes.success) {
        return res.status(400).json({
          success: false,
          error: captchaRes.error || 'CAPTCHA verification failed. Please complete the security check.',
        });
      }
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Full Name is required.' });
    }
    if (!academicYear || !academicYear.trim()) {
      return res.status(400).json({ success: false, error: 'Academic Year is required.' });
    }
    if (!department || !department.trim()) {
      return res.status(400).json({ success: false, error: 'Department is required.' });
    }
    if (!degree || !degree.trim()) {
      return res.status(400).json({ success: false, error: 'Degree / Course is required.' });
    }
    if (!dob || !dob.trim()) {
      return res.status(400).json({ success: false, error: 'Date of Birth is required.' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, error: 'Phone Number is required.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Email Address is required.' });
    }
    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required.' });
    }
    if (!confirmPassword) {
      return res.status(400).json({ success: false, error: 'Confirm Password is required.' });
    }

    // Strict Gmail validation
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!gmailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Only @gmail.com email addresses are allowed for participant registration.',
      });
    }

    const cleanPhone = phone.trim().replace(/[^\d+]/g, '');
    if (cleanPhone.length < 7) {
      return res.status(400).json({ success: false, error: 'Please enter a valid phone number.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Password and Confirm Password do not match.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(400).json({ success: false, error: 'An account with this email address already exists.' });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = await (prisma as any).user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: 'USER',
        status: 'ACTIVE',
        isVerified: false,
        verificationToken,
        verificationTokenExpires,
        academicYear: academicYear.trim(),
        department: department.trim(),
        degree: degree.trim(),
        dob: dob.trim(),
        phone: phone.trim(),
        acceptedTerms: true,
        acceptedTermsAt: new Date(),
      },
    });

    auditLog('REGISTER_PARTICIPANT', { email: normalizedEmail });

    // In production, send verification email here.
    // For development, auto-verify the account.
    if (process.env.NODE_ENV === 'development') {
      await (prisma as any).user.update({
        where: { id: newUser.id },
        data: {
          isVerified: true,
          verificationToken: null,
          verificationTokenExpires: null,
        },
      });

      const token = jwt.sign(
        { id: newUser.id, email: newUser.email, role: 'USER' },
        JWT_SECRET,
        { expiresIn: SESSION_EXPIRY_SECONDS }
      );

      setAuthCookie(res, token);

      return res.status(201).json({
        success: true,
        message: 'TechRoom Participant account registered successfully. (Auto-verified in development mode)',
        token,
        role: 'USER',
        user: sanitizeUser({ ...newUser, isVerified: true, verificationToken: null, verificationTokenExpires: null }),
      });
    }

    // Production: require email verification
    return res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your Gmail inbox for a verification link before logging in.',
      requiresVerification: true,
    });
  } catch (error: any) {
    console.error('registerParticipant error:', error);
    return res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
  }
};

// ─── Email Verification ────────────────────────────────────────────────────
export const verifyEmail = async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'Verification token is required.' });
    }

    const user = await (prisma as any).user.findFirst({
      where: {
        verificationToken: token,
        verificationTokenExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification token. Please register again.',
      });
    }

    await (prisma as any).user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationTokenExpires: null,
      },
    });

    auditLog('EMAIL_VERIFIED', { email: user.email });

    return res.json({
      success: true,
      message: 'Email verified successfully! You can now log in.',
    });
  } catch (error: any) {
    console.error('verifyEmail error:', error);
    return res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
  }
};

// ─── Google OAuth ──────────────────────────────────────────────────────────
export const googleAuth = async (req: AuthRequest, res: Response) => {
  try {
    const { googleId, email, name } = req.body;

    if (!googleId || !email || !name) {
      return res.status(400).json({ success: false, error: 'Google authentication data is incomplete.' });
    }

    // Enforce Gmail restriction
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!gmailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Only @gmail.com email addresses are allowed.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists by googleId or email
    let user = await (prisma as any).user.findFirst({
      where: {
        OR: [
          { googleId },
          { email: normalizedEmail },
        ],
      },
    });

    if (user) {
      // Link Google ID if not already set
      if (!user.googleId) {
        user = await (prisma as any).user.update({
          where: { id: user.id },
          data: { googleId, isVerified: true },
        });
      }

      if (user.status !== 'ACTIVE') {
        return res.status(403).json({ success: false, error: 'Your account has been deactivated.' });
      }
    } else {
      // Create new user with Google OAuth
      user = await (prisma as any).user.create({
        data: {
          name,
          email: normalizedEmail,
          passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
          role: 'USER',
          status: 'ACTIVE',
          isVerified: true,
          googleId,
        },
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY_SECONDS }
    );

    setAuthCookie(res, token);
    auditLog('GOOGLE_AUTH', { email: user.email });

    return res.json({
      success: true,
      message: 'Google authentication successful',
      token,
      role: user.role,
      user: sanitizeUser(user),
    });
  } catch (error: any) {
    console.error('googleAuth error:', error);
    return res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
  }
};

// ─── GitHub OAuth ──────────────────────────────────────────────────────────
export const githubAuth = async (req: AuthRequest, res: Response) => {
  try {
    const { githubId, email, name } = req.body;

    if (!githubId || !email || !name) {
      return res.status(400).json({ success: false, error: 'GitHub authentication data is incomplete.' });
    }

    // Enforce Gmail restriction
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!gmailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Only @gmail.com email addresses are allowed.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists by githubId or email
    let user = await (prisma as any).user.findFirst({
      where: {
        OR: [
          { githubId },
          { email: normalizedEmail },
        ],
      },
    });

    if (user) {
      if (!user.githubId) {
        user = await (prisma as any).user.update({
          where: { id: user.id },
          data: { githubId, isVerified: true },
        });
      }

      if (user.status !== 'ACTIVE') {
        return res.status(403).json({ success: false, error: 'Your account has been deactivated.' });
      }
    } else {
      user = await (prisma as any).user.create({
        data: {
          name,
          email: normalizedEmail,
          passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
          role: 'USER',
          status: 'ACTIVE',
          isVerified: true,
          githubId,
        },
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY_SECONDS }
    );

    setAuthCookie(res, token);
    auditLog('GITHUB_AUTH', { email: user.email });

    return res.json({
      success: true,
      message: 'GitHub authentication successful',
      token,
      role: user.role,
      user: sanitizeUser(user),
    });
  } catch (error: any) {
    console.error('githubAuth error:', error);
    return res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
  }
};

// ─── Logout ────────────────────────────────────────────────────────────────
export const logout = async (req: AuthRequest, res: Response) => {
  try {
    clearAuthCookie(res);
    auditLog('LOGOUT', { userId: req.user?.id });
    return res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error: any) {
    console.error('Logout error:', error);
    return res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
  }
};

// ─── Register Participant Team Account for a Hackathon Room ────────────────
export const registerTeam = async (req: AuthRequest, res: Response) => {
  try {
    const { roomCode, teamName, leaderName, leaderEmail, college, password } = req.body;

    if (!roomCode || !teamName || !leaderName || !leaderEmail || !college || !password) {
      return res.status(400).json({ success: false, error: 'All registration fields are required.' });
    }

    const room = await prisma.room.findUnique({
      where: { roomCode: roomCode.trim().toUpperCase() },
    });

    if (!room) {
      return res.status(404).json({ success: false, error: `Hackathon Room "${roomCode}" not found. Please check room code.` });
    }

    if (room.status === 'CLOSED') {
      return res.status(400).json({ success: false, error: `Hackathon Room ${room.roomCode} is closed for registration.` });
    }

    let teamCode = await generateTeamCode();
    let attempts = 0;
    while (await prisma.team.findUnique({ where: { teamCode } })) {
      teamCode = await generateTeamCode();
      attempts++;
      if (attempts > 10) break;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const team = await prisma.team.create({
      data: {
        roomId: room.id,
        teamCode,
        teamName,
        leaderName,
        leaderEmail: leaderEmail.toLowerCase().trim(),
        college,
        passwordHash,
        status: 'ACTIVE',
        members: {
          create: [{ name: leaderName, email: leaderEmail.toLowerCase().trim() }],
        },
      },
      include: {
        room: true,
        members: true,
      },
    });

    const token = jwt.sign(
      { id: team.id, teamCode: team.teamCode, role: 'USER', roomId: team.roomId },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY_SECONDS }
    );

    setAuthCookie(res, token);
    auditLog('REGISTER_TEAM', { teamCode: team.teamCode, roomCode: room.roomCode });

    return res.status(201).json({
      success: true,
      message: `Team ${teamCode} registered successfully for Room ${room.roomCode}`,
      token,
      role: 'USER',
      team: sanitizeTeam(team),
    });
  } catch (error: any) {
    console.error('registerTeam error:', error);
    return res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
  }
};

// ─── Get Me (Current Profile) ──────────────────────────────────────────────
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthenticated' });
    }

    // 1. Check if ID belongs to a User
    const user = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
      include: {
        participantRooms: { include: { room: true } },
      },
    });

    if (user) {
      const userEmail = user.email.toLowerCase();
      const teams = await prisma.team.findMany({
        where: { leaderEmail: userEmail },
        include: { room: true },
      });

      const hasJoinedHackathon =
        (user.participantRooms && user.participantRooms.length > 0) || teams.length > 0;

      return res.json({
        success: true,
        role: user.role,
        user: sanitizeUser(user),
        hasJoinedHackathon,
        teams: teams.map(sanitizeTeam),
      });
    }

    // 2. Check if ID belongs to a Team
    const team = await prisma.team.findUnique({
      where: { id: req.user.id },
      include: {
        room: true,
        members: true,
      },
    });

    if (team) {
      return res.json({
        success: true,
        role: 'USER',
        team: sanitizeTeam(team),
        hasJoinedHackathon: true,
      });
    }

    return res.status(404).json({ success: false, error: 'Account not found' });
  } catch (error: any) {
    console.error('getMe error:', error);
    return res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
  }
};

// ─── Update User Profile ───────────────────────────────────────────────────
export const updateUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthenticated' });
    }

    const {
      name,
      phone,
      dob,
      college,
      department,
      academicYear,
      degree,
      github,
      linkedin,
      portfolio,
    } = req.body;

    const existingUser = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
    });

    if (!existingUser) {
      return res.status(404).json({ success: false, error: 'User profile not found.' });
    }

    // Verify the user can only update their own profile
    if (existingUser.id !== req.user.id) {
      auditLog('UNAUTHORIZED_PROFILE_UPDATE', { userId: req.user.id, targetId: existingUser.id });
      return res.status(403).json({ success: false, error: 'Access forbidden.' });
    }

    const updatedUser = await (prisma as any).user.update({
      where: { id: req.user.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(phone !== undefined && { phone: phone.trim() }),
        ...(dob !== undefined && { dob: dob.trim() }),
        ...(college !== undefined && { college: college.trim() }),
        ...(department !== undefined && { department: department.trim() }),
        ...(academicYear !== undefined && { academicYear: academicYear.trim() }),
        ...(degree !== undefined && { degree: degree.trim() }),
        ...(github !== undefined && { github: github.trim() }),
        ...(linkedin !== undefined && { linkedin: linkedin.trim() }),
        ...(portfolio !== undefined && { portfolio: portfolio.trim() }),
      },
    });

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: sanitizeUser(updatedUser),
    });
  } catch (error: any) {
    console.error('updateUserProfile error:', error);
    return res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
  }
};
