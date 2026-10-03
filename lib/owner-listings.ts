import { Prisma, PropertyStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { isOwnerStatusTransitionAllowed } from '@/lib/property-lifecycle';

export const LISTING_MANAGER_ROLES: UserRole[] = [UserRole.OWNER, UserRole.LANDLORD, UserRole.AGENT, UserRole.PROPERTY_MANAGER, UserRole.DEVELOPER];

export const LISTING_STATUS_FILTERS = Object.values(PropertyStatus);
export const LISTING_SORTS = ['updated', 'created', 'price_asc', 'price_desc'] as const;
export const LISTING_PAGE_SIZE = 20;

export const ownerListingQuerySchema = z.object({
  status: z.preprocess((value) => (value === '' || value === 'ALL' ? undefined : value), z.enum(LISTING_STATUS_FILTERS as [PropertyStatus, ...PropertyStatus[]]).optional()),
  q: z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.string().trim().max(100).optional()),
  sort: z.preprocess((value) => (value === '' ? undefined : value), z.enum(LISTING_SORTS).default('updated')),
  page: z.preprocess((value) => (value === '' ? undefined : value), z.coerce.number().int().min(1).max(1000).default(1)),
});

export type OwnerListingQuery = z.infer<typeof ownerListingQuerySchema>;

/** Only professional roles that can create listings may use the inventory. */
export function authorizeListingInventory(user: { role: UserRole } | null | undefined): 'ok' | 'unauthenticated' | 'forbidden' {
  if (!user) return 'unauthenticated';
  return LISTING_MANAGER_ROLES.includes(user.role) ? 'ok' : 'forbidden';
}

/**
 * The ownership scope always derives from the session user id and is combined
 * with AND, so no filter or search term can widen it.
 */
export function buildOwnerListingWhere(userId: string, query: Pick<OwnerListingQuery, 'status' | 'q'>): Prisma.PropertyWhereInput {
  const and: Prisma.PropertyWhereInput[] = [{ OR: [{ ownerId: userId }, { agentId: userId }] }];
  if (query.status) and.push({ status: query.status });
  if (query.q) {
    const contains = { contains: query.q, mode: 'insensitive' as const };
    and.push({
      OR: [
        { title: contains },
        { location: { OR: [{ city: contains }, { state: contains }, { country: contains }, { area: contains }, { address: contains }] } },
      ],
    });
  }
  return { AND: and };
}

export function buildOwnerListingOrderBy(sort: OwnerListingQuery['sort']): Prisma.PropertyOrderByWithRelationInput[] {
  switch (sort) {
    case 'created': return [{ createdAt: 'desc' }, { id: 'asc' }];
    case 'price_asc': return [{ price: 'asc' }, { id: 'asc' }];
    case 'price_desc': return [{ price: 'desc' }, { id: 'asc' }];
    default: return [{ updatedAt: 'desc' }, { id: 'asc' }];
  }
}

export type ListingActionId = 'submit' | 'resubmit' | 'pause' | 'rented' | 'sold';

/** Derives the available actions from the existing lifecycle rules; no new transitions are defined here. */
export function getListingActions(status: PropertyStatus): ListingActionId[] {
  const actions: ListingActionId[] = [];
  const can = (next: PropertyStatus) => isOwnerStatusTransitionAllowed(status, next);
  if (can(PropertyStatus.PENDING_REVIEW)) actions.push(status === PropertyStatus.DRAFT ? 'submit' : 'resubmit');
  if (can(PropertyStatus.PAUSED)) actions.push('pause');
  if (can(PropertyStatus.RENTED)) actions.push('rented');
  if (can(PropertyStatus.SOLD)) actions.push('sold');
  return actions;
}
