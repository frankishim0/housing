import crypto from 'node:crypto';

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

export function hashPasswordResetToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function getPasswordResetUrl(token: string) {
  const appUrl = process.env.APP_URL?.replace(/\/$/, '');
  if (!appUrl) {
    throw new Error('APP_URL is not configured.');
  }
  return `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY must be configured.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: [email],
      subject: 'Reset your Nigerian Homes password',
      text: `Use this link to reset your password: ${resetUrl}\n\nThis link expires in one hour and can only be used once.`,
      html: `<p>Use the link below to reset your Nigerian Homes password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in one hour and can only be used once.</p>`,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Password reset email provider returned HTTP ${response.status}.`);
  }
}
