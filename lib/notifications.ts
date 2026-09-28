import { prisma } from '@/lib/prisma';
import { publishRealtimeEvent } from '@/lib/realtime';

export async function notifySavedPropertyUsers(propertyId: string, message: string, excludeUserId?: string) {
  const favorites = await prisma.favorite.findMany({
    where: { propertyId, ...(excludeUserId ? { userId: { not: excludeUserId } } : {}) },
    select: { userId: true },
    distinct: ['userId'],
    take: 1000,
  });
  if (favorites.length === 0) return;

  await prisma.notification.createMany({
    data: favorites.map(({ userId }) => ({ userId, type: 'PROPERTY', message })),
  });
  await Promise.all(favorites.map(({ userId }) => publishRealtimeEvent(`user:${userId}`, 'notification', { type: 'PROPERTY', message, propertyId })));
}
