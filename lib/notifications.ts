import { prisma } from '@/lib/prisma';
import { publishRealtimeEvent } from '@/lib/realtime';
import { NotificationType } from '@prisma/client';

type NotificationDelivery = {
  userIds: string[];
  type: NotificationType;
  message: string;
  eventName?: string;
  eventData?: unknown;
};

export async function deliverNotifications(
  input: NotificationDelivery,
  dependencies: {
    persist: (userId: string, type: NotificationType, message: string) => Promise<void>;
    publish: (userId: string, type: NotificationType, eventName: string, data: unknown) => Promise<unknown>;
  },
) {
  const userIds = [...new Set(input.userIds.filter(Boolean))];
  if (userIds.length === 0) return;

  await Promise.all(userIds.map(async (userId) => {
    try {
      await dependencies.persist(userId, input.type, input.message);
    } catch (error) {
      console.error('Could not persist notification:', error);
    }
    if (input.eventName) {
      try {
        await dependencies.publish(userId, input.type, input.eventName, input.eventData);
      } catch (error) {
        console.error('Could not deliver realtime notification:', error);
      }
    }
  }));
}

export async function notifyUsersSafely(input: NotificationDelivery) {
  await deliverNotifications(input, {
    persist: async (userId, type, message) => {
      await prisma.notification.create({ data: { userId, type, message } });
    },
    publish: async (userId, type, eventName, data) => (
      publishRealtimeEvent(`user:${userId}`, eventName, { type, message: input.message, ...(
        typeof data === 'object' && data !== null ? data : {}
      ) })
    ),
  });
}

export async function notifySavedPropertyUsers(propertyId: string, message: string, excludeUserId?: string) {
  let favorites: { userId: string }[];
  try {
    favorites = await prisma.favorite.findMany({
      where: { propertyId, ...(excludeUserId ? { userId: { not: excludeUserId } } : {}) },
      select: { userId: true },
      distinct: ['userId'],
      take: 1000,
    });
  } catch (error) {
    console.error('Could not find saved-property notification recipients:', error);
    return;
  }
  if (favorites.length === 0) return;

  await notifyUsersSafely({
    userIds: favorites.map(({ userId }) => userId),
    type: 'PROPERTY',
    message,
    eventName: 'notification',
    eventData: { propertyId },
  });
}
