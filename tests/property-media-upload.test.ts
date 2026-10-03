import assert from 'node:assert/strict';
import { attachPropertyMedia, type AttachMediaDeps } from '../lib/property-media-attach';
import { classifyVisualUpload, isAllowedForMediaScope, validateVisualUpload } from '../lib/property-media-upload';

type Created = Parameters<AttachMediaDeps['createMedia']>[0];

function setup(opts: { user?: { id: string } | null; ticketMime?: string; ticketResource?: string; delivery?: 'upload' | 'authenticated'; ticketScope?: 'creation' | 'visual'; verified?: boolean } = {}) {
  const created: Created[] = [];
  const deps: AttachMediaDeps = {
    getUser: async () => (opts.user === undefined ? { id: 'owner' } : opts.user),
    findProperty: async (id) => (id === 'p1' ? { id, ownerId: 'owner', agentId: 'agent' } : null),
    verifyTicket: (_t, expected) => expected.purpose.mediaScope === (opts.ticketScope ?? 'visual') ? ({
      publicId: 'housing/properties/p1/x',
      mimeType: opts.ticketMime ?? 'image/jpeg',
      resourceType: opts.ticketResource ?? 'image',
      deliveryType: opts.delivery ?? 'upload',
    }) : null,
    verifyUpload: async () => opts.verified ?? true,
    createMedia: async (data) => { created.push(data); return { id: 'm', ...data, isCover: false }; },
  };
  return { deps, created };
}

const body = (over: Record<string, unknown> = {}) => ({
  ticket: 't', fileName: 'a.jpg', mimeType: 'image/jpeg', size: 1000,
  secureUrl: 'https://res.cloudinary.com/c/image/upload/housing/properties/p1/x', publicId: 'housing/properties/p1/x', resourceType: 'image', mediaScope: 'visual', ...over,
});

async function main() {
  // unauthenticated
  let s = setup({ user: null });
  assert.equal((await attachPropertyMedia(s.deps, 'p1', body())).status, 401);
  assert.equal(s.created.length, 0);

  // unrelated user
  s = setup({ user: { id: 'stranger' } });
  assert.equal((await attachPropertyMedia(s.deps, 'p1', body())).status, 403);
  assert.equal(s.created.length, 0);
  // missing property
  assert.equal((await attachPropertyMedia(setup().deps, 'nope', body())).status, 403);

  // owner photo attaches without changing listing or verification state
  s = setup();
  let r = await attachPropertyMedia(s.deps, 'p1', body());
  assert.equal(r.status, 201);
  assert.equal(s.created.length, 1);
  assert.equal(s.created[0].type, 'IMAGE');
  assert.equal(s.created[0].propertyId, 'p1');
  assert.ok(!('isCover' in s.created[0]) && !('status' in s.created[0]) && !('verificationStatus' in s.created[0]));
  assert.equal((await attachPropertyMedia(s.deps, 'p1', body({ mediaScope: 'visual' }))).status, 201);

  // assigned agent video success, works with zero media
  s = setup({ user: { id: 'agent' }, ticketMime: 'video/mp4', ticketResource: 'video' });
  r = await attachPropertyMedia(s.deps, 'p1', body({ fileName: 'v.mp4', mimeType: 'video/mp4', resourceType: 'video' }));
  assert.equal(r.status, 201);
  assert.equal(s.created[0].type, 'VIDEO');
  assert.equal((await attachPropertyMedia(s.deps, 'p1', body({ fileName: 'v.mp4', mimeType: 'video/mp4', resourceType: 'video', mediaScope: 'visual' }))).status, 201);

  // documents rejected in the visual flow
  s = setup({ ticketMime: 'application/pdf', ticketResource: 'raw', delivery: 'authenticated' });
  r = await attachPropertyMedia(s.deps, 'p1', body({ fileName: 'd.pdf', mimeType: 'application/pdf', resourceType: 'raw' }));
  assert.equal(r.status, 400);
  assert.equal(s.created.length, 0);
  // Documents remain valid only under the explicit creation scope.
  s = setup({ ticketMime: 'application/pdf', ticketResource: 'raw', delivery: 'authenticated', ticketScope: 'creation' });
  r = await attachPropertyMedia(s.deps, 'p1', body({ fileName: 'd.pdf', mimeType: 'application/pdf', resourceType: 'raw', mediaScope: 'creation' }));
  assert.equal(r.status, 201);
  assert.equal(s.created[0].type, 'DOCUMENT');
  assert.equal((await attachPropertyMedia(s.deps, 'p1', body({ fileName: 'd.pdf', mimeType: 'application/pdf', resourceType: 'raw', mediaScope: 'visual' }))).status, 400);
  assert.equal((await attachPropertyMedia(s.deps, 'p1', body({ mediaScope: undefined }))).status, 400);
  assert.equal((await attachPropertyMedia(s.deps, 'p1', body({ mediaScope: 'other' }))).status, 400);
  assert.equal((await attachPropertyMedia(s.deps, 'p1', body({ fileName: 'd.pdf', mimeType: 'application/pdf', resourceType: 'raw', mediaScope: 'creation' }))).status, 201);

  // invalid MIME
  s = setup({ ticketMime: 'application/x-msdownload' });
  assert.equal((await attachPropertyMedia(s.deps, 'p1', body({ mimeType: 'application/x-msdownload' }))).status, 400);
  // oversize
  assert.equal((await attachPropertyMedia(setup().deps, 'p1', body({ size: 20 * 1024 * 1024 + 1 }))).status, 400);
  assert.equal((await attachPropertyMedia(setup({ ticketMime: 'video/mp4', ticketResource: 'video' }).deps, 'p1', body({ mimeType: 'video/mp4', resourceType: 'video', size: 200 * 1024 * 1024 + 1 }))).status, 400);
  // unverified Cloudinary asset
  s = setup({ verified: false });
  assert.equal((await attachPropertyMedia(s.deps, 'p1', body())).status, 400);
  assert.equal(s.created.length, 0);
  // ticket mismatch
  assert.equal((await attachPropertyMedia(setup({ ticketResource: 'video' }).deps, 'p1', body())).status, 400);
  // client-supplied owner/agent ids are ignored by the schema (never reach createMedia)
  s = setup();
  await attachPropertyMedia(s.deps, 'p1', body({ ownerId: 'evil', agentId: 'evil', isCover: true }));
  assert.ok(!('ownerId' in s.created[0]) && !('agentId' in s.created[0]) && !('isCover' in s.created[0]));

  // pure helpers
  assert.equal(classifyVisualUpload('image/png')?.kind, 'image');
  assert.equal(classifyVisualUpload('video/quicktime')?.kind, 'video');
  assert.equal(classifyVisualUpload('application/pdf'), null);
  assert.ok(validateVisualUpload({ type: 'application/pdf', size: 10 }));
  assert.ok(validateVisualUpload({ type: 'image/jpeg', size: 21 * 1024 * 1024 }));
  assert.equal(validateVisualUpload({ type: 'video/mp4', size: 100 * 1024 * 1024 }), null);
  assert.equal(isAllowedForMediaScope('visual', 'property', 'DOCUMENT'), false);
  assert.equal(isAllowedForMediaScope('visual', 'property', 'IMAGE'), true);
  assert.equal(isAllowedForMediaScope('visual', 'property', 'VIDEO'), true);
  assert.equal(isAllowedForMediaScope('creation', 'property', 'DOCUMENT'), true);
  assert.equal(isAllowedForMediaScope('visual', 'message', 'IMAGE'), false);
  console.log('property media upload tests passed');
}

main().catch((error) => { console.error(error); process.exit(1); });
