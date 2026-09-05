import { Request, Response, NextFunction } from 'express';
import { CaptchaStore } from '../services/captchaStore';

/**
 * Verifies custom self-hosted TechRoom CAPTCHA
 */
export function verifyCaptchaToken(
  captchaId: string | undefined,
  captchaAnswer: string | undefined
): { success: boolean; error?: string } {
  return CaptchaStore.verifyChallenge(captchaId, captchaAnswer);
}

/**
 * Express middleware to enforce custom CAPTCHA verification on sensitive routes
 */
export const requireCaptcha = async (req: Request, res: Response, next: NextFunction) => {
  const captchaId = req.body?.captchaId || (req.headers['x-captcha-id'] as string);
  const captchaAnswer = req.body?.captchaAnswer || (req.headers['x-captcha-answer'] as string);

  const result = verifyCaptchaToken(captchaId, captchaAnswer);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.error || 'CAPTCHA validation failed. Please complete the security check.',
    });
  }

  next();
};
