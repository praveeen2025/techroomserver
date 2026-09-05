import crypto from 'crypto';

// Unambiguous character set (excluding 0, O, 1, I, l for clarity)
const CAPTCHA_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates a cryptographically secure random string of specified length
 */
export function generateRandomCaptchaCode(length: number = 5): string {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = bytes[i] % CAPTCHA_CHARS.length;
    code += CAPTCHA_CHARS[randomIndex];
  }
  return code;
}

/**
 * Generates a random integer between min and max (inclusive) using crypto
 */
function randomInt(min: number, max: number): number {
  const range = max - min + 1;
  const bytes = crypto.randomBytes(4);
  const randomValue = bytes.readUInt32BE(0);
  return min + (randomValue % range);
}

/**
 * Generates a high-quality, readable distorted SVG vector image for the CAPTCHA string
 */
export function generateCaptchaSvg(code: string): string {
  const width = 240;
  const height = 70;

  // High-contrast, clean color palette matching TechRoom slate/orange theme
  const darkColors = ['#0F172A', '#1E293B', '#334155', '#0369A1', '#C2410C', '#EC7211', '#047857'];
  const noiseColors = ['#64748B', '#94A3B8', '#CBD5E1', '#EC7211', '#0284C7'];

  // 1. Background noise dots
  let dotsSvg = '';
  for (let i = 0; i < 30; i++) {
    const cx = randomInt(5, width - 5);
    const cy = randomInt(5, height - 5);
    const r = (randomInt(10, 25) / 10).toFixed(1);
    const opacity = (randomInt(15, 35) / 100).toFixed(2);
    const color = noiseColors[randomInt(0, noiseColors.length - 1)];
    dotsSvg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}" />`;
  }

  // 2. Background wavy noise lines (curved paths)
  let linesSvg = '';
  for (let i = 0; i < 3; i++) {
    const x1 = randomInt(5, 25);
    const y1 = randomInt(10, height - 10);
    const cx1 = randomInt(40, 100);
    const cy1 = randomInt(5, height - 5);
    const cx2 = randomInt(110, 190);
    const cy2 = randomInt(5, height - 5);
    const x2 = randomInt(200, width - 5);
    const y2 = randomInt(10, height - 10);
    const color = noiseColors[randomInt(0, noiseColors.length - 1)];
    const strokeWidth = (randomInt(14, 22) / 10).toFixed(1);
    const opacity = (randomInt(25, 45) / 100).toFixed(2);

    linesSvg += `<path d="M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" opacity="${opacity}" stroke-linecap="round" />`;
  }

  // 3. Rendered text characters - centered layout with rotate transform around glyph center
  let textSvg = '';
  const margin = 20;
  const usableWidth = width - margin * 2;
  const numChars = code.length;

  for (let i = 0; i < numChars; i++) {
    const char = code[i];
    // Center point of character cell
    const cellWidth = usableWidth / numChars;
    const cx = Math.round(margin + (i + 0.5) * cellWidth + randomInt(-3, 3));
    const cy = Math.round(35 + randomInt(-4, 4));
    const rotate = randomInt(-18, 18);
    const fontSize = randomInt(30, 34);
    const color = darkColors[randomInt(0, darkColors.length - 1)];

    textSvg += `<text x="${cx}" y="${cy}" font-size="${fontSize}px" font-weight="900" font-family="monospace, Arial, sans-serif" fill="${color}" text-anchor="middle" dominant-baseline="central" transform="rotate(${rotate}, ${cx}, ${cy})">${char}</text>`;
  }

  // 4. Foreground subtle dash lines over text for bot distortion
  let fgLinesSvg = '';
  for (let i = 0; i < 2; i++) {
    const fx1 = randomInt(10, 30);
    const fy1 = randomInt(15, height - 15);
    const fx2 = randomInt(width - 30, width - 10);
    const fy2 = randomInt(15, height - 15);
    fgLinesSvg += `<line x1="${fx1}" y1="${fy1}" x2="${fx2}" y2="${fy2}" stroke="#EC7211" stroke-width="1.6" opacity="0.5" stroke-dasharray="6 3" />`;
  }

  // Pure clean valid XML string
  const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#F8FAFC" rx="4" /><rect width="100%" height="100%" fill="none" stroke="#CBD5E1" stroke-width="1" rx="4" />${dotsSvg}${linesSvg}${textSvg}${fgLinesSvg}</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(rawSvg, 'utf8').toString('base64')}`;
}

/**
 * Generates an accessible math puzzle alternative
 */
export function generateMathCaptcha(): { question: string; answer: string } {
  const num1 = randomInt(3, 15);
  const num2 = randomInt(2, 9);
  const isAddition = randomInt(0, 1) === 1;

  if (isAddition) {
    return {
      question: `What is ${num1} + ${num2}?`,
      answer: (num1 + num2).toString(),
    };
  } else {
    return {
      question: `What is ${num1} × ${num2}?`,
      answer: (num1 * num2).toString(),
    };
  }
}
