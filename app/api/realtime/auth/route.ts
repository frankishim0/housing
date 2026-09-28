import { Rest } from 'ably';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Real-time messaging is not configured.' }, { status: 503 });

  const capability: Record<string, string[]> = { [`user:${user.id}`]: ['subscribe'] };
  const conversationId = request.nextUrl.searchParams.get('conversationId');
  if (conversationId) {
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      select: { userId: true },
    });
    if (!participant) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    capability[`conversation:${conversationId}`] = ['subscribe'];
  }

  const callId = request.nextUrl.searchParams.get('callId');
  if (callId) {
    const call = await prisma.callSession.findFirst({
      where: {
        id: callId,
        OR: [
          { participants: { some: { userId: user.id } } },
          { type: 'LIVE_TOUR', property: { status: 'PUBLISHED' } },
        ],
      },
      select: { id: true },
    });
    if (!call) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    capability[`call:${callId}`] = ['subscribe'];
  }

  const tokenRequest = await new Rest(apiKey).auth.createTokenRequest({
    clientId: user.id,
    capability: JSON.stringify(capability),
    ttl: 60 * 60 * 1000,
  });
  return NextResponse.json(tokenRequest, { headers: { 'Cache-Control': 'no-store' } });
}
