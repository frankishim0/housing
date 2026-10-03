import { UserRole } from '@prisma/client';

export function canAccessPropertyDocument(
  user: { id: string; role: UserRole } | null | undefined,
  property: { ownerId: string; agentId: string | null },
) {
  if (!user) return false;
  return user.role === UserRole.ADMIN || property.ownerId === user.id || property.agentId === user.id;
}

export function publicPropertyMedia<T extends { type: string }>(media: T[]): T[] {
  return media.filter((item) => item.type !== 'DOCUMENT');
}

export function propertyMediaDeliveryType(mediaType: string): 'upload' | 'authenticated' {
  return mediaType === 'DOCUMENT' ? 'authenticated' : 'upload';
}

export function excludePrivateDocumentUrls<T extends { media?: { type: string }[] }>(property: T) {
  return {
    ...property,
    ...(property.media ? { media: publicPropertyMedia(property.media) } : {}),
  };
}
