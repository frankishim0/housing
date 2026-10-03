import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPasswordResetToken, getPasswordResetUrl, PASSWORD_RESET_TTL_MS, sendPasswordResetEmail } from '@/lib/password-reset';
import { forgotPasswordSchema } from '@/lib/validation';
import { enforceRateLimits, getClientIp, readJsonBody } from '@/lib/http';

const WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const limited = enforceRateLimits([{ key: `forgot:ip:${getClientIp(request)}`, limit: 10, windowMs: WINDOW_MS }]);
  if (limited) return limited;
  const parsed = forgotPasswordSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  const emailLimited = enforceRateLimits([{ key: `forgot:email:${parsed.data.email}`, limit: 3, windowMs: WINDOW_MS }]);
  if (emailLimited) return emailLimited;

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    return NextResponse.json({ message: 'If an account exists for that email, a reset link has been sent.' });
  }

  const { token, tokenHash } = createPasswordResetToken();
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    },
  });

  try {
    await sendPasswordResetEmail(user.email, getPasswordResetUrl(token));
  } catch (error) {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
    console.error('Password reset email failed:', error);
    return NextResponse.json({ error: 'Password reset email could not be sent.' }, { status: 503 });
  }

  return NextResponse.json({ message: 'If an account exists for that email, a reset link has been sent.' });
}
