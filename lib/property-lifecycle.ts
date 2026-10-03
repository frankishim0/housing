import { PropertyStatus, UserRole } from '@prisma/client';

/**
 * Statuses that may be shown to the public (search, property detail pages/APIs)
 * without the viewer being the owner, assigned agent, or an admin.
 * RENTED/SOLD remain visible because they represent listings that were
 * legitimately published and later completed, not private/unreviewed states.
 */
export const PUBLIC_PROPERTY_STATUSES: PropertyStatus[] = [
  PropertyStatus.PUBLISHED,
  PropertyStatus.RENTED,
  PropertyStatus.SOLD,
];

export function isPubliclyVisibleStatus(status: PropertyStatus) {
  return PUBLIC_PROPERTY_STATUSES.includes(status);
}

/** Whether a user may view a property that is not in a publicly visible status. */
export function canViewNonPublicProperty(
  user: { id: string; role: UserRole } | null | undefined,
  property: { ownerId: string; agentId: string | null },
) {
  if (!user) return false;
  return user.role === UserRole.ADMIN || property.ownerId === user.id || property.agentId === user.id;
}

/**
 * Status transitions an owner/agent (non-admin) may perform directly. Notably,
 * PUBLISHED is never reachable here: going live always routes through
 * PENDING_REVIEW for moderation/verification approval. Admins are not limited
 * by this map.
 */
const OWNER_STATUS_TRANSITIONS: Partial<Record<PropertyStatus, PropertyStatus[]>> = {
  [PropertyStatus.DRAFT]: [PropertyStatus.PENDING_REVIEW],
  [PropertyStatus.PENDING_REVIEW]: [PropertyStatus.DRAFT],
  [PropertyStatus.REJECTED]: [PropertyStatus.DRAFT],
  [PropertyStatus.PUBLISHED]: [PropertyStatus.PAUSED, PropertyStatus.RENTED, PropertyStatus.SOLD],
  [PropertyStatus.PAUSED]: [PropertyStatus.PENDING_REVIEW],
  [PropertyStatus.RENTED]: [PropertyStatus.PENDING_REVIEW],
  [PropertyStatus.SOLD]: [PropertyStatus.PENDING_REVIEW],
  [PropertyStatus.SUSPENDED]: [],
};

export function isOwnerStatusTransitionAllowed(current: PropertyStatus, next: PropertyStatus) {
  return (OWNER_STATUS_TRANSITIONS[current] ?? []).includes(next);
}

/**
 * Listing fields whose change can make an existing verification misleading
 * (identity of the listing, description, pricing, or classification). When
 * any of these change on a previously verified property, the verification
 * must be invalidated rather than silently carried forward.
 */
export const MATERIAL_VERIFICATION_FIELDS = [
  'title',
  'description',
  'type',
  'price',
  'currencyCode',
  'listingType',
  'bedrooms',
  'bathrooms',
  'size',
  'sizeUnit',
  'location',
  'amenities',
] as const;

export function shouldInvalidateVerification(changedFields: readonly string[], wasVerified: boolean) {
  return wasVerified && changedFields.some((field) => (MATERIAL_VERIFICATION_FIELDS as readonly string[]).includes(field));
}
