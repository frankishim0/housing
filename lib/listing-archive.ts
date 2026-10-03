import { PropertyStatus } from '@prisma/client';
import { isOwnerStatusTransitionAllowed } from '@/lib/property-lifecycle';

/** Counts of records that give a listing historical significance. */
export type ListingDependencyCounts = {
  payments: number;
  transactions: number;
  viewings: number;
  conversations: number;
  enquiries: number;
  callSessions: number;
  featuredListings: number;
  tenants: number;
  verifications: number;
  reports: number;
  reviews: number;
  auditLogs: number;
};

const DEPENDENCY_LABELS: Record<keyof ListingDependencyCounts, string> = {
  payments: 'payments',
  transactions: 'transactions',
  viewings: 'viewings',
  conversations: 'messages',
  enquiries: 'enquiries',
  callSessions: 'call sessions',
  featuredListings: 'featured placements',
  tenants: 'tenancy records',
  verifications: 'verification records',
  reports: 'reports',
  reviews: 'reviews',
  auditLogs: 'moderation or audit history',
};

export function canArchiveListing(status: PropertyStatus) {
  return isOwnerStatusTransitionAllowed(status, PropertyStatus.ARCHIVED);
}

/** Restoring always returns the listing to DRAFT so it must pass review again. */
export function canRestoreListing(status: PropertyStatus) {
  return status === PropertyStatus.ARCHIVED && isOwnerStatusTransitionAllowed(status, PropertyStatus.DRAFT);
}

/** Returns the reasons permanent deletion is unsafe; an empty list means it is safe. */
export function getDeletionBlockers(status: PropertyStatus, counts: ListingDependencyCounts): string[] {
  const blockers: string[] = [];
  if (status !== PropertyStatus.DRAFT) {
    blockers.push('Only draft listings can be permanently deleted. Archive this listing instead.');
  }
  const history = (Object.keys(DEPENDENCY_LABELS) as (keyof ListingDependencyCounts)[])
    .filter((key) => counts[key] > 0)
    .map((key) => DEPENDENCY_LABELS[key]);
  if (history.length > 0) {
    blockers.push(`This listing has historical records (${history.join(', ')}) that must be preserved. Archive it instead.`);
  }
  return blockers;
}
