import { z } from 'zod';

/** Request body accepted by `POST /api/conversations` to start (or resume) a property conversation. */
export const startConversationSchema = z.object({
  propertyId: z.string().min(1),
  recipientId: z.string().min(1),
  content: z.string().trim().max(5000).optional(),
});

export type StartConversationInput = z.infer<typeof startConversationSchema>;

/** Request body accepted by `POST /api/conversations/[id]/messages`. */
export const sendMessageSchema = z.object({
  content: z.string().trim().max(5000).default(''),
  replyToId: z.string().min(1).optional(),
  attachment: z.object({
    ticket: z.string().min(1),
    fileName: z.string().min(1).max(180),
    mimeType: z.string().max(120),
    size: z.number().int().positive(),
    secureUrl: z.url().startsWith('https://'),
    publicId: z.string().min(1).max(500),
    resourceType: z.enum(['image', 'video', 'raw']),
  }).optional(),
}).refine((value) => value.content.length > 0 || Boolean(value.attachment), 'A message or attachment is required.');

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/**
 * Builds the canonical key used to deduplicate a single-buyer/single-contact conversation for a
 * property, independent of who initiated it. Sorting the participant ids keeps the key stable
 * whichever side starts (or retries starting) the conversation, which is what allows the unique
 * database constraint on this value to prevent duplicate conversations from concurrent requests.
 */
export function buildConversationPairKey(propertyId: string, userIdA: string, userIdB: string) {
  return `${propertyId}:${[userIdA, userIdB].sort().join(':')}`;
}

export type ConversationAuthorizationInput = {
  requesterId: string;
  recipientId: string;
  ownerId: string;
  agentId: string | null;
  recipientRole: string;
  hasEnquiry: boolean;
  hasViewing: boolean;
};

/**
 * Determines whether `requesterId` may open a conversation with `recipientId` about a property.
 * Either the recipient must be the property's owner/agent (a buyer contacting the listing), or
 * the requester must be the owner/agent replying to a buyer/tenant who already has an enquiry or
 * viewing request on record for the property. This prevents arbitrary users from messaging
 * strangers through the property-conversation endpoint.
 */
export function canStartPropertyConversation(input: ConversationAuthorizationInput): boolean {
  if (input.requesterId === input.recipientId) return false;
  const isPropertyContact = [input.ownerId, input.agentId].includes(input.recipientId);
  const mayContactBuyer = [input.ownerId, input.agentId].includes(input.requesterId)
    && ['USER', 'TENANT'].includes(input.recipientRole)
    && (input.hasEnquiry || input.hasViewing);
  return isPropertyContact || mayContactBuyer;
}

/** Counts messages that are unread by `userId` (sent by someone else and not yet marked read). */
export function countUnreadMessages(messages: { senderId: string; readAt: string | Date | null }[], userId: string) {
  return messages.filter((message) => message.senderId !== userId && message.readAt === null).length;
}
