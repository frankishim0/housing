import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createSession } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { enforceRateLimits, getClientIp, readJsonBody } from '@/lib/http';

const WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  const limited = enforceRateLimits([{ key: `login:ip:${getClientIp(request)}`, limit: 30, windowMs: WINDOW_MS }]);
  if (limited) return limited;
  const parsed = loginSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 400 });
  }
  const emailLimited = enforceRateLimits([{ key: `login:email:${parsed.data.email}`, limit: 10, windowMs: WINDOW_MS }]);
  if (emailLimited) return emailLimited;

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }
  if (user.suspendedAt) {
    return NextResponse.json({ error: 'This account is unavailable. Contact support for assistance.' }, { status: 403 });
  }

  await createSession(user.id);
  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, preferredCurrency: user.preferredCurrency },
  });
}
