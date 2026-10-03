import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { hashPasswordResetToken } from '@/lib/password-reset';
import { resetPasswordSchema } from '@/lib/validation';
import { enforceRateLimits, getClientIp, readJsonBody } from '@/lib/http';

export async function POST(request: NextRequest) {
  const limited = enforceRateLimits([{ key: `reset:ip:${getClientIp(request)}`, limit: 20, windowMs: 60 * 60 * 1000 }]);
  if (limited) return limited;
  const parsed = resetPasswordSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: 'The reset link or password is invalid.' }, { status: 400 });
  }

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashPasswordResetToken(parsed.data.token) },
  });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: resetToken.userId } }),
  ]);

  return NextResponse.json({ message: 'Your password has been reset. You can now sign in.' });
}
