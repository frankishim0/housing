export type MediaScope = 'creation' | 'visual';

export const VISUAL_UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime';

const IMAGE_TYPE = /^image\/(jpeg|png|webp|avif)$/;
const VIDEO_TYPE = /^video\/(mp4|webm|quicktime)$/;

export const VISUAL_UPLOAD_LIMITS = { image: 20 * 1024 * 1024, video: 200 * 1024 * 1024 } as const;

/** Client-safe photo/video classification (no Node-only imports). */
export function classifyVisualUpload(mimeType: string) {
  if (IMAGE_TYPE.test(mimeType)) return { kind: 'image' as const, maxBytes: VISUAL_UPLOAD_LIMITS.image };
  if (VIDEO_TYPE.test(mimeType)) return { kind: 'video' as const, maxBytes: VISUAL_UPLOAD_LIMITS.video };
  return null;
}

export function validateVisualUpload(file: { type: string; size: number }) {
  const classified = classifyVisualUpload(file.type);
  if (!classified) return 'Only JPEG, PNG, WebP, AVIF photos and MP4, WebM, MOV videos can be added here.';
  if (file.size > classified.maxBytes) return `This ${classified.kind} exceeds the ${classified.maxBytes / (1024 * 1024)} MB limit.`;
  return null;
}

/** Whether a classified upload may proceed under the requested scope. */
export function isAllowedForMediaScope(scope: MediaScope, purposeKind: string, mediaType: 'IMAGE' | 'VIDEO' | 'DOCUMENT') {
  if (purposeKind !== 'property') return false;
  return scope === 'creation' || (scope === 'visual' && mediaType !== 'DOCUMENT');
}
