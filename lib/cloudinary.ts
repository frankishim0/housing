import crypto from 'node:crypto';

export type UploadPurpose =
  | { kind: 'property'; propertyId: string }
  | { kind: 'message'; conversationId: string };

type UploadTicket = {
  userId: string;
  purpose: UploadPurpose;
  publicId: string;
  resourceType: 'image' | 'video' | 'raw';
  mimeType: string;
  expiresAt: number;
};

export function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary upload service is not configured.');
  }
  return { cloudName, apiKey, apiSecret };
}

export function signCloudinaryParams(params: Record<string, string>, apiSecret: string) {
  const canonical = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return crypto.createHash('sha1').update(`${canonical}${apiSecret}`).digest('hex');
}

export function createUploadTicket(ticket: UploadTicket) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not configured.');
  const payload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyUploadTicket(token: string, expected: { userId: string; purpose: UploadPurpose }) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not configured.');
  const [payload, suppliedSignature] = token.split('.');
  if (!payload || !suppliedSignature) return null;

  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(suppliedSignature, 'base64url');
  } catch {
    return null;
  }
  if (actualSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(actualSignature, expectedSignature)) return null;

  let ticket: UploadTicket;
  try {
    ticket = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UploadTicket;
  } catch {
    return null;
  }
  if (ticket.userId !== expected.userId || ticket.expiresAt <= Date.now()) return null;
  if (JSON.stringify(ticket.purpose) !== JSON.stringify(expected.purpose)) return null;
  return ticket;
}

export function isCloudinaryUrl(url: string, cloudName: string, resourceType: string, publicId?: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com' || !parsed.pathname.startsWith(`/${cloudName}/${resourceType}/upload/`)) return false;
    if (!publicId) return true;
    let uploadedAssetPath = parsed.pathname.split('/upload/')[1] ?? '';
    uploadedAssetPath = uploadedAssetPath.replace(/^v\d+\//, '');
    uploadedAssetPath = decodeURIComponent(uploadedAssetPath).replace(/\.[^/.]+$/, '');
    return uploadedAssetPath === publicId;
  } catch {
    return false;
  }
}

export async function getCloudinaryUploadDetails(publicId: string, resourceType: string) {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const publicIdPath = publicId.split('/').map(encodeURIComponent).join('/');
  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/${encodeURIComponent(resourceType)}/upload/${publicIdPath}`;
  const authorization = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const response = await fetch(endpoint, { headers: { Authorization: `Basic ${authorization}` }, cache: 'no-store' });
  if (!response.ok) {
    console.error(`Cloudinary upload verification failed with HTTP ${response.status}.`);
    return null;
  }
  return await response.json() as {
    public_id?: string;
    secure_url?: string;
    resource_type?: string;
    bytes?: number;
    format?: string;
  };
}

export async function verifyCloudinaryUpload(input: {
  publicId: string;
  resourceType: 'image' | 'video' | 'raw';
  secureUrl: string;
  mimeType: string;
  size: number;
}) {
  const { cloudName } = getCloudinaryConfig();
  const details = await getCloudinaryUploadDetails(input.publicId, input.resourceType);
  const formatsByMimeType: Record<string, string[]> = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'image/avif': ['avif'],
    'video/mp4': ['mp4'],
    'video/webm': ['webm'],
    'video/quicktime': ['mov'],
    'application/pdf': ['pdf'],
    'application/msword': ['doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  };
  const allowedFormats = formatsByMimeType[input.mimeType];
  return Boolean(
    details
    && allowedFormats?.includes(details.format?.toLowerCase() ?? '')
    && details.public_id === input.publicId
    && details.resource_type === input.resourceType
    && details.bytes === input.size
    && details.secure_url === input.secureUrl
    && isCloudinaryUrl(input.secureUrl, cloudName, input.resourceType, input.publicId),
  );
}

export function classifyUpload(mimeType: string) {
  if (/^image\/(jpeg|png|webp|avif)$/.test(mimeType)) return { resourceType: 'image' as const, mediaType: 'IMAGE' as const, maxBytes: 20 * 1024 * 1024 };
  if (/^video\/(mp4|webm|quicktime)$/.test(mimeType)) return { resourceType: 'video' as const, mediaType: 'VIDEO' as const, maxBytes: 200 * 1024 * 1024 };
  if (['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mimeType)) {
    return { resourceType: 'raw' as const, mediaType: 'DOCUMENT' as const, maxBytes: 25 * 1024 * 1024 };
  }
  return null;
}
