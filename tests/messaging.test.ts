import assert from 'node:assert/strict';
import {
  buildConversationPairKey,
  canStartPropertyConversation,
  countUnreadMessages,
  sendMessageSchema,
  startConversationSchema,
} from '../lib/messaging';
import { checkRateLimit, resetRateLimitBuckets } from '../lib/rate-limit';

// 1. Creating a conversation: the request body shape is validated and a stable pair key is derived.
const started = startConversationSchema.safeParse({ propertyId: 'prop-1', recipientId: 'owner-1', content: 'Hi there' });
assert.equal(started.success, true);
assert.equal(buildConversationPairKey('prop-1', 'buyer-1', 'owner-1'), buildConversationPairKey('prop-1', 'owner-1', 'buyer-1'));
assert.notEqual(buildConversationPairKey('prop-1', 'buyer-1', 'owner-1'), buildConversationPairKey('prop-2', 'buyer-1', 'owner-1'));

// 2. Participant authorization: a buyer may message the property's owner/agent.
assert.equal(
  canStartPropertyConversation({
    requesterId: 'buyer-1',
    recipientId: 'owner-1',
    ownerId: 'owner-1',
    agentId: null,
    recipientRole: 'OWNER',
    hasEnquiry: false,
    hasViewing: false,
  }),
  true,
  'buyer contacting the owner is allowed',
);
assert.equal(
  canStartPropertyConversation({
    requesterId: 'buyer-1',
    recipientId: 'agent-1',
    ownerId: 'owner-1',
    agentId: 'agent-1',
    recipientRole: 'AGENT',
    hasEnquiry: false,
    hasViewing: false,
  }),
  true,
  'buyer contacting the assigned agent is allowed',
);
assert.equal(
  canStartPropertyConversation({
    requesterId: 'owner-1',
    recipientId: 'buyer-1',
    ownerId: 'owner-1',
    agentId: null,
    recipientRole: 'USER',
    hasEnquiry: true,
    hasViewing: false,
  }),
  true,
  'owner replying to a buyer who has enquired is allowed',
);

// 3. Unauthorized conversation access: an unrelated user cannot start a conversation about a property
// they have no enquiry/viewing on, nor can anyone message themselves.
assert.equal(
  canStartPropertyConversation({
    requesterId: 'owner-1',
    recipientId: 'stranger-1',
    ownerId: 'owner-1',
    agentId: null,
    recipientRole: 'USER',
    hasEnquiry: false,
    hasViewing: false,
  }),
  false,
  'owner may not message an unrelated buyer with no enquiry or viewing',
);
assert.equal(
  canStartPropertyConversation({
    requesterId: 'stranger-1',
    recipientId: 'stranger-2',
    ownerId: 'owner-1',
    agentId: 'agent-1',
    recipientRole: 'USER',
    hasEnquiry: false,
    hasViewing: false,
  }),
  false,
  'two unrelated users may not open a conversation about someone else\'s property',
);
assert.equal(
  canStartPropertyConversation({
    requesterId: 'owner-1',
    recipientId: 'owner-1',
    ownerId: 'owner-1',
    agentId: null,
    recipientRole: 'OWNER',
    hasEnquiry: false,
    hasViewing: false,
  }),
  false,
  'a user may not open a conversation with themselves',
);

// 4. Sending a message: valid text and valid attachment-only payloads are accepted.
assert.equal(sendMessageSchema.safeParse({ content: 'Is the property still available?' }).success, true);
assert.equal(sendMessageSchema.safeParse({
  content: '',
  attachment: {
    ticket: 'ticket-token',
    fileName: 'floor-plan.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    secureUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/housing/messages/conv-1/user-1/file.pdf',
    publicId: 'housing/messages/conv-1/user-1/file',
    resourceType: 'raw',
  },
}).success, true);

// 5. Preventing forged sender IDs: the schema has no senderId/recipientId field for messages, so any
// client-supplied identity fields are simply dropped by the server before it uses the session user id.
const forged = sendMessageSchema.safeParse({ content: 'hello', senderId: 'someone-else', recipientId: 'victim' });
assert.equal(forged.success, true);
assert.equal((forged.success && 'senderId' in forged.data), false, 'parsed message input must not retain a client-supplied senderId');

// 6. Read/unread behaviour: unread counts only include messages from other participants that are unread.
const thread = [
  { senderId: 'buyer-1', readAt: null },
  { senderId: 'owner-1', readAt: '2026-01-01T00:00:00.000Z' },
  { senderId: 'owner-1', readAt: null },
  { senderId: 'buyer-1', readAt: null },
];
assert.equal(countUnreadMessages(thread, 'buyer-1'), 1, 'only the unread message from the owner counts for the buyer');
assert.equal(countUnreadMessages(thread, 'owner-1'), 2, 'both unread buyer messages count for the owner');
assert.equal(countUnreadMessages([], 'buyer-1'), 0);

// 7. Property association: a conversation's pair key is always scoped to the property it was created for,
// so the same two users messaging about two different properties get two distinct conversations.
const keyForPropertyA = buildConversationPairKey('property-a', 'buyer-1', 'owner-1');
const keyForPropertyB = buildConversationPairKey('property-b', 'buyer-1', 'owner-1');
assert.notEqual(keyForPropertyA, keyForPropertyB);

// 8. Invalid message input is rejected: empty content with no attachment, and over-length content.
assert.equal(sendMessageSchema.safeParse({ content: '' }).success, false, 'a message needs text or an attachment');
assert.equal(sendMessageSchema.safeParse({ content: 'x'.repeat(5001) }).success, false, 'content over the length limit is rejected');
assert.equal(startConversationSchema.safeParse({ propertyId: '', recipientId: 'owner-1' }).success, false, 'an empty propertyId is rejected');
assert.equal(startConversationSchema.safeParse({ recipientId: 'owner-1' }).success, false, 'propertyId is required');

// 9. Duplicate/retry handling: the per-user rate limiter allows bursts up to the configured limit, blocks
// further attempts within the same window (covering rapid duplicate sends/retries), and recovers afterwards.
resetRateLimitBuckets();
const windowStart = Date.now();
for (let i = 0; i < 5; i += 1) {
  const result = checkRateLimit('message:send:user-1', 5, 1000, windowStart + i);
  assert.equal(result.allowed, true, `request ${i} within the burst limit should be allowed`);
}
const blocked = checkRateLimit('message:send:user-1', 5, 1000, windowStart + 10);
assert.equal(blocked.allowed, false, 'a 6th rapid request within the window should be rate limited');
assert.ok(blocked.retryAfterMs > 0);
const recovered = checkRateLimit('message:send:user-1', 5, 1000, windowStart + 1000);
assert.equal(recovered.allowed, true, 'requests are allowed again once the window has elapsed');
// A different key (e.g. a different user, or a different conversation) is tracked independently.
const otherUser = checkRateLimit('message:send:user-2', 5, 1000, windowStart + 10);
assert.equal(otherUser.allowed, true, 'rate limiting is scoped per key and does not cross-block other users');

console.log('Messaging conversation, authorization, validation, and rate-limit tests passed.');
