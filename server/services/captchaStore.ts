import crypto from 'crypto';
import {
  generateRandomCaptchaCode,
  generateCaptchaSvg,
  generateMathCaptcha,
} from '../utils/customCaptchaEngine';

interface CaptchaChallenge {
  id: string;
  answerHash: string;
  expiresAt: number;
  type: 'image' | 'math';
}

const CAPTCHA_SALT = process.env.COOKIE_SECRET || 'techroom_captcha_secret_salt_2026';
const CAPTCHA_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

// In-memory single-use challenge store
const captchaMap = new Map<string, CaptchaChallenge>();

// Hash answer helper
function hashAnswer(answer: string): string {
  return crypto
    .createHash('sha256')
    .update(`${CAPTCHA_SALT}:${answer.trim().toLowerCase()}`)
    .digest('hex');
}

// Periodic TTL cleanup to purge expired challenges
setInterval(() => {
  const now = Date.now();
  for (const [id, challenge] of captchaMap.entries()) {
    if (now > challenge.expiresAt) {
      captchaMap.delete(id);
    }
  }
}, 60 * 1000);

export class CaptchaStore {
  /**
   * Generates a new CAPTCHA challenge (image or math)
   */
  static createChallenge(type: 'image' | 'math' = 'image'): {
    captchaId: string;
    captchaImage: string;
    type: 'image' | 'math';
    mathQuestion?: string;
  } {
    const captchaId = crypto.randomUUID();
    const expiresAt = Date.now() + CAPTCHA_TTL_MS;

    if (type === 'math') {
      const { question, answer } = generateMathCaptcha();
      const answerHash = hashAnswer(answer);

      captchaMap.set(captchaId, {
        id: captchaId,
        answerHash,
        expiresAt,
        type: 'math',
      });

      return {
        captchaId,
        captchaImage: '',
        type: 'math',
        mathQuestion: question,
      };
    } else {
      const code = generateRandomCaptchaCode(5);
      const answerHash = hashAnswer(code);
      const captchaImage = generateCaptchaSvg(code);

      captchaMap.set(captchaId, {
        id: captchaId,
        answerHash,
        expiresAt,
        type: 'image',
      });

      return {
        captchaId,
        captchaImage,
        type: 'image',
      };
    }
  }

  /**
   * Verifies a CAPTCHA response. Enforces SINGLE-USE by deleting the challenge immediately upon check.
   */
  static verifyChallenge(
    captchaId: string | undefined,
    userAnswer: string | undefined
  ): { success: boolean; error?: string } {
    if (!captchaId || !captchaId.trim()) {
      return { success: false, error: 'CAPTCHA challenge ID is required.' };
    }

    if (!userAnswer || !userAnswer.trim()) {
      return { success: false, error: 'Please enter the CAPTCHA code.' };
    }

    const challenge = captchaMap.get(captchaId);

    // Single-use enforcement: Delete challenge immediately regardless of pass/fail
    if (challenge) {
      captchaMap.delete(captchaId);
    } else {
      return {
        success: false,
        error: 'CAPTCHA challenge has expired or already been used. Please click refresh for a new CAPTCHA.',
      };
    }

    // Expiry check
    if (Date.now() > challenge.expiresAt) {
      return {
        success: false,
        error: 'CAPTCHA challenge has expired. Please refresh for a new CAPTCHA.',
      };
    }

    // Verify hash
    const inputHash = hashAnswer(userAnswer);
    if (crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(challenge.answerHash))) {
      return { success: true };
    }

    return {
      success: false,
      error: 'Incorrect CAPTCHA answer. Please try again with the new CAPTCHA.',
    };
  }
}
