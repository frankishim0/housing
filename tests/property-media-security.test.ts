import assert from 'node:assert/strict';
import { UserRole } from '@prisma/client';
import { getCloudinaryDeliveryType } from '../lib/cloudinary';
import { canAccessPropertyDocument, excludePrivateDocumentUrls, propertyMediaDeliveryType } from '../lib/property-media-security';

const property = { ownerId: 'owner-1', agentId: 'agent-1' };
assert.equal(canAccessPropertyDocument(null, property), false);
assert.equal(canAccessPropertyDocument({ id: 'stranger', role: UserRole.USER }, property), false);
assert.equal(canAccessPropertyDocument({ id: 'owner-1', role: UserRole.OWNER }, property), true);
assert.equal(canAccessPropertyDocument({ id: 'agent-1', role: UserRole.AGENT }, property), true);
assert.equal(canAccessPropertyDocument({ id: 'admin-1', role: UserRole.ADMIN }, property), true);

const propertyPayload = {
  id: 'property-1',
  media: [
    { id: 'image-1', type: 'IMAGE', url: 'https://res.cloudinary.com/demo/image/upload/photo.jpg' },
    { id: 'video-1', type: 'VIDEO', url: 'https://res.cloudinary.com/demo/video/upload/tour.mp4' },
    { id: 'document-1', type: 'DOCUMENT', url: 'https://res.cloudinary.com/demo/raw/upload/private.pdf' },
  ],
};
const publicPayload = excludePrivateDocumentUrls(propertyPayload);
assert.deepEqual(publicPayload.media.map(({ type }) => type), ['IMAGE', 'VIDEO']);
assert.equal(JSON.stringify(publicPayload).includes('private.pdf'), false);
assert.equal(propertyMediaDeliveryType('DOCUMENT'), 'authenticated');
assert.equal(propertyMediaDeliveryType('IMAGE'), 'upload');
assert.equal(propertyMediaDeliveryType('VIDEO'), 'upload');
assert.equal(getCloudinaryDeliveryType('https://res.cloudinary.com/demo/raw/authenticated/s--sig--/a/b.pdf'), 'authenticated');
assert.equal(getCloudinaryDeliveryType('https://res.cloudinary.com/demo/raw/upload/v123/a/b.pdf'), 'upload');
assert.equal(getCloudinaryDeliveryType('https://example.com/file.pdf'), null);

console.log('Property media privacy and authorization tests passed.');
