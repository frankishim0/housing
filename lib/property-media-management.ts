export type VisualMediaType = 'IMAGE' | 'VIDEO';

export type OrderedVisualMedia = {
  id: string;
  type: VisualMediaType | 'DOCUMENT';
  order: number;
};

export function canManagePropertyMedia(userId: string, property: { ownerId: string; agentId: string | null }) {
  return property.ownerId === userId || property.agentId === userId;
}

export function canSelectMediaAsCover(mediaType: string) {
  return mediaType === 'IMAGE';
}

export function validateVisualMediaOrder(currentMedia: OrderedVisualMedia[], requestedIds: unknown) {
  if (!Array.isArray(requestedIds) || requestedIds.some((id) => typeof id !== 'string' || id.length === 0)) {
    return { valid: false as const, error: 'Provide a valid media ID sequence.' };
  }
  if (new Set(requestedIds).size !== requestedIds.length) {
    return { valid: false as const, error: 'A media item cannot appear more than once.' };
  }

  const visualMedia = currentMedia.filter((media) => media.type === 'IMAGE' || media.type === 'VIDEO');
  if (requestedIds.length !== visualMedia.length) {
    return { valid: false as const, error: 'The sequence must include every image and video exactly once.' };
  }
  const visualIds = new Set(visualMedia.map(({ id }) => id));
  if (requestedIds.some((id) => !visualIds.has(id as string))) {
    return { valid: false as const, error: 'The sequence contains media that cannot be reordered.' };
  }
  return { valid: true as const, mediaIds: requestedIds as string[] };
}

export function getNextVisualMediaOrder(media: OrderedVisualMedia[]) {
  const visual = media.filter((item) => item.type === 'IMAGE' || item.type === 'VIDEO');
  return visual.reduce((next, item) => Math.max(next, item.order + 1), 0);
}

export function normalizeVisualMediaOrder(mediaIds: string[]) {
  return mediaIds.map((id, order) => ({ id, order }));
}

export function sortPublicMedia<T extends { id: string; type: string; order: number }>(media: T[]) {
  return media
    .filter((item) => item.type === 'IMAGE' || item.type === 'VIDEO')
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

export function getExistingCoverId<T extends { id: string; type: string; order: number; isCover: boolean }>(media: T[]) {
  const images = media
    .filter((item) => item.type === 'IMAGE')
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  return images.find((item) => item.isCover)?.id ?? images[0]?.id ?? null;
}

export function getCoverAfterMediaDeletion<T extends { id: string; type: string; order: number; isCover: boolean }>(
  media: T[],
  deletingId: string,
) {
  const remainingImages = media
    .filter((item) => item.id !== deletingId && item.type === 'IMAGE')
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  if (remainingImages.length === 0 || media.find((item) => item.id === deletingId)?.isCover) return remainingImages[0]?.id ?? null;
  return getExistingCoverId(remainingImages);
}

export function getCoverAfterMediaAddition<T extends { id: string; type: string; order: number; isCover: boolean }>(
  media: T[],
  newMedia: { id: string; type: string },
) {
  return getExistingCoverId(media) ?? (newMedia.type === 'IMAGE' ? newMedia.id : null);
}
