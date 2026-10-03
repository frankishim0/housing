import { UserRole } from '@prisma/client';
import { LISTING_MANAGER_ROLES } from '@/lib/owner-listings';

export function canEditListing(
  user: { id: string; role: UserRole } | null | undefined,
  property: { ownerId: string; agentId: string | null },
) {
  if (!user) return false;
  if (user.role === UserRole.ADMIN) return true;
  return LISTING_MANAGER_ROLES.includes(user.role) && (property.ownerId === user.id || property.agentId === user.id);
}
