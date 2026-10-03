import { z } from 'zod';
import { classifyUpload } from '@/lib/cloudinary';
import { isAllowedForMediaScope, type MediaScope } from '@/lib/property-media-upload';
import { propertyMediaDeliveryType } from '@/lib/property-media-security';

export const attachMediaSchema = z.object({
  ticket: z.string().min(1),
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().max(120),
  size: z.number().int().positive(),
  secureUrl: z.url().startsWith('https://'),
  publicId: z.string().min(1).max(500),
  resourceType: z.enum(['image', 'video', 'raw']),
  mediaScope: z.enum(['creation', 'visual']),
});

type Upload = z.infer<typeof attachMediaSchema>;

export type AttachMediaDeps = {
  getUser: () => Promise<{ id: string } | null>;
  findProperty: (id: string) => Promise<{ id: string; ownerId: string; agentId: string | null } | null>;
  verifyTicket: (token: string, expected: { userId: string; purpose: { kind: 'property'; propertyId: string; mediaScope: MediaScope } }) => {
    publicId: string;
    mimeType: string;
    resourceType: string;
    deliveryType: string;
  } | null;
  verifyUpload: (input: Pick<Upload, 'publicId' | 'resourceType' | 'secureUrl' | 'mimeType' | 'size'> & { deliveryType: 'upload' | 'authenticated' }) => Promise<boolean>;
  countMedia: (propertyId: string) => Promise<number>;
  createMedia: (data: {
    propertyId: string;
    url: string;
    type: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    fileName: string;
    mimeType: string;
    size: number;
    publicId: string;
    resourceType: string;
    order: number;
  }) => Promise<unknown>;
};

export async function attachPropertyMedia(deps: AttachMediaDeps, propertyId: string, rawBody: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const user = await deps.getUser();
  if (!user) return { status: 401, body: { error: 'Authentication required.' } };
  const parsed = attachMediaSchema.safeParse(rawBody);
  if (!parsed.success) return { status: 400, body: { error: parsed.error.flatten() } };

  const property = await deps.findProperty(propertyId);
  if (!property || ![property.ownerId, property.agentId].includes(user.id)) return { status: 403, body: { error: 'Forbidden.' } };

  const ticket = deps.verifyTicket(parsed.data.ticket, { userId: user.id, purpose: { kind: 'property', propertyId, mediaScope: parsed.data.mediaScope } });
  const file = classifyUpload(parsed.data.mimeType);
  if (!file || !isAllowedForMediaScope(parsed.data.mediaScope, 'property', file.mediaType)) {
    return { status: 400, body: { error: 'This file type is not allowed here.' } };
  }
  const deliveryType = propertyMediaDeliveryType(file.mediaType);
  if (!ticket || ticket.deliveryType !== deliveryType || parsed.data.size > file.maxBytes || ticket.publicId !== parsed.data.publicId || ticket.mimeType !== parsed.data.mimeType || ticket.resourceType !== parsed.data.resourceType) {
    return { status: 400, body: { error: 'The upload authorization is invalid or expired.' } };
  }
  if (!await deps.verifyUpload({ ...parsed.data, deliveryType })) {
    return { status: 400, body: { error: 'The uploaded file could not be verified against the configured media account.' } };
  }

  const media = await deps.createMedia({
    propertyId,
    url: parsed.data.secureUrl,
    type: file.mediaType,
    fileName: parsed.data.fileName.replace(/[\\/\r\n\u0000-\u001f]/g, '_'),
    mimeType: parsed.data.mimeType,
    size: parsed.data.size,
    publicId: parsed.data.publicId,
    resourceType: parsed.data.resourceType,
    order: await deps.countMedia(propertyId),
  });
  return { status: 201, body: { data: media } };
}
