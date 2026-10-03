import assert from 'node:assert/strict';
import {
  canManagePropertyMedia,
  canSelectMediaAsCover,
  getCoverAfterMediaAddition,
  getCoverAfterMediaDeletion,
  getExistingCoverId,
  getNextVisualMediaOrder,
  normalizeVisualMediaOrder,
  sortPublicMedia,
  validateVisualMediaOrder,
} from '../lib/property-media-management';

const media = [
  { id: 'image-b', type: 'IMAGE' as const, order: 4, isCover: false },
  { id: 'video-a', type: 'VIDEO' as const, order: 2, isCover: false },
  { id: 'image-a', type: 'IMAGE' as const, order: 0, isCover: true },
  { id: 'document', type: 'DOCUMENT' as const, order: 1, isCover: false },
];

function main() {
  assert.equal(canManagePropertyMedia('owner', { ownerId: 'owner', agentId: 'agent' }), true);
  assert.equal(canManagePropertyMedia('agent', { ownerId: 'owner', agentId: 'agent' }), true);
  assert.equal(canManagePropertyMedia('other', { ownerId: 'owner', agentId: 'agent' }), false);
  assert.equal(canManagePropertyMedia('other', { ownerId: 'owner', agentId: null }), false);

  assert.deepEqual(validateVisualMediaOrder(media, ['image-b', 'video-a', 'image-a']), {
    valid: true,
    mediaIds: ['image-b', 'video-a', 'image-a'],
  });
  assert.equal(validateVisualMediaOrder(media, ['image-a', 'image-a', 'video-a']).valid, false);
  assert.equal(validateVisualMediaOrder(media, ['image-a', 'video-a', 'foreign-id']).valid, false);
  assert.equal(validateVisualMediaOrder(media, ['image-a', 'video-a', 'document']).valid, false);
  assert.equal(validateVisualMediaOrder(media, []).valid, false);
  assert.equal(validateVisualMediaOrder(media, null).valid, false);
  assert.equal(validateVisualMediaOrder([], []).valid, true);

  const validOrder = validateVisualMediaOrder(media, ['video-a', 'image-a', 'image-b']);
  assert.equal(validOrder.valid, true);
  if (validOrder.valid) {
    assert.deepEqual(normalizeVisualMediaOrder(validOrder.mediaIds), [
      { id: 'video-a', order: 0 },
      { id: 'image-a', order: 1 },
      { id: 'image-b', order: 2 },
    ]);
  }

  assert.equal(getNextVisualMediaOrder(media), 5);
  const afterGap = media.filter(({ id }) => id !== 'image-b');
  assert.equal(getNextVisualMediaOrder(afterGap), 3);
  const afterRepeatedUploads = [...afterGap, { id: 'new-1', type: 'IMAGE' as const, order: 3 }];
  assert.equal(getNextVisualMediaOrder(afterRepeatedUploads), 4);
  assert.equal(getNextVisualMediaOrder([{ id: 'doc', type: 'DOCUMENT', order: 900 }]), 0);

  assert.equal(canSelectMediaAsCover('IMAGE'), true);
  assert.equal(canSelectMediaAsCover('VIDEO'), false);
  assert.equal(canSelectMediaAsCover('DOCUMENT'), false);
  assert.equal(getExistingCoverId(media), 'image-a');
  assert.equal(getExistingCoverId([{ id: 'no-image', type: 'VIDEO', order: 0, isCover: true }]), null);

  const publicSorted = sortPublicMedia(media);
  assert.deepEqual(publicSorted.map(({ id }) => id), ['image-a', 'video-a', 'image-b']);
  assert.equal(publicSorted.some(({ type }) => type === 'DOCUMENT'), false);
  assert.deepEqual(sortPublicMedia([
    { id: 'tie-b', type: 'VIDEO', order: 1 },
    { id: 'tie-a', type: 'IMAGE', order: 1 },
  ]).map(({ id }) => id), ['tie-a', 'tie-b']);

  assert.equal(getCoverAfterMediaDeletion(media, 'image-a'), 'image-b');
  assert.equal(getCoverAfterMediaDeletion(media, 'image-b'), 'image-a');
  assert.equal(getCoverAfterMediaDeletion([
    { id: 'only', type: 'IMAGE', order: 0, isCover: true },
  ], 'only'), null);
  assert.equal(getCoverAfterMediaDeletion([
    { id: 'cover', type: 'IMAGE', order: 0, isCover: true },
    { id: 'video', type: 'VIDEO', order: 1, isCover: false },
    { id: 'doc', type: 'DOCUMENT', order: 2, isCover: false },
  ], 'cover'), null);
  assert.equal(getCoverAfterMediaAddition([], { id: 'first-image', type: 'IMAGE' }), 'first-image');
  assert.equal(getCoverAfterMediaAddition([], { id: 'first-video', type: 'VIDEO' }), null);
  assert.equal(getCoverAfterMediaAddition(media, { id: 'new-image', type: 'IMAGE' }), 'image-a');
  assert.equal(getCoverAfterMediaAddition([
    { id: 'stale-video-cover', type: 'VIDEO', order: 0, isCover: true },
  ], { id: 'first-image', type: 'IMAGE' }), 'first-image');
  console.log('Property media ordering and cover tests passed.');
}

main();
