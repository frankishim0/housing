import assert from 'node:assert/strict';
import { PropertyStatus, UserRole } from '@prisma/client';
import {
  authorizeListingInventory,
  buildOwnerListingOrderBy,
  buildOwnerListingWhere,
  getListingActions,
  LISTING_STATUS_FILTERS,
  ownerListingQuerySchema,
} from '../lib/owner-listings';

const parse = (input: Record<string, string>) => ownerListingQuerySchema.parse(input);

// Unauthorized access
assert.equal(authorizeListingInventory(null), 'unauthenticated');
assert.equal(authorizeListingInventory({ role: UserRole.USER }), 'forbidden');
assert.equal(authorizeListingInventory({ role: UserRole.TENANT }), 'forbidden');
assert.equal(authorizeListingInventory({ role: UserRole.AGENT }), 'ok');
assert.equal(authorizeListingInventory({ role: UserRole.OWNER }), 'ok');

// Ownership scoping: always the session user's id (owner or agent), combined with AND
const where = buildOwnerListingWhere('user-1', parse({}));
assert.deepEqual(where.AND, [{ OR: [{ ownerId: 'user-1' }, { agentId: 'user-1' }] }]);
assert.ok(!JSON.stringify(where).includes('user-2'));

// Client-supplied owner/agent ids are not part of the schema and cannot widen scope
const tampered = ownerListingQuerySchema.parse({ ownerId: 'user-2', agentId: 'user-2' });
assert.ok(!('ownerId' in tampered) && !('agentId' in tampered));
const tamperedWhere = buildOwnerListingWhere('user-1', tampered);
assert.ok(!JSON.stringify(tamperedWhere).includes('user-2'));

// Status filtering: every enum status is supported, ALL/blank means no filter, unknown is rejected
assert.deepEqual(LISTING_STATUS_FILTERS.slice().sort(), Object.values(PropertyStatus).slice().sort());
for (const status of Object.values(PropertyStatus)) {
  const filtered = buildOwnerListingWhere('user-1', parse({ status }));
  assert.deepEqual(filtered.AND, [{ OR: [{ ownerId: 'user-1' }, { agentId: 'user-1' }] }, { status }]);
}
assert.equal(parse({ status: 'ALL' }).status, undefined);
assert.equal(parse({ status: '' }).status, undefined);
assert.equal(ownerListingQuerySchema.safeParse({ status: 'ARCHIVED' }).success, false);

// Search: matches title or location, and stays inside the ownership scope
const searched = buildOwnerListingWhere('user-1', parse({ q: '  Lagos ' }));
assert.equal((searched.AND as unknown[]).length, 2);
const searchClause = JSON.stringify((searched.AND as unknown[])[1]);
assert.ok(searchClause.includes('"title"') && searchClause.includes('"city"') && searchClause.includes('Lagos'));
assert.deepEqual((searched.AND as unknown[])[0], { OR: [{ ownerId: 'user-1' }, { agentId: 'user-1' }] });
assert.equal((buildOwnerListingWhere('user-1', parse({ q: '   ' })).AND as unknown[]).length, 1);
assert.equal(ownerListingQuerySchema.safeParse({ q: 'x'.repeat(101) }).success, false);

// Sorting
assert.deepEqual(buildOwnerListingOrderBy(parse({}).sort)[0], { updatedAt: 'desc' });
assert.deepEqual(buildOwnerListingOrderBy('created')[0], { createdAt: 'desc' });
assert.deepEqual(buildOwnerListingOrderBy('price_asc')[0], { price: 'asc' });
assert.deepEqual(buildOwnerListingOrderBy('price_desc')[0], { price: 'desc' });
assert.equal(ownerListingQuerySchema.safeParse({ sort: 'views' }).success, false);

// Actions mirror the existing lifecycle rules only
assert.deepEqual(getListingActions(PropertyStatus.DRAFT), ['submit']);
assert.deepEqual(getListingActions(PropertyStatus.PUBLISHED), ['pause', 'rented', 'sold']);
assert.deepEqual(getListingActions(PropertyStatus.PAUSED), ['resubmit']);
assert.deepEqual(getListingActions(PropertyStatus.RENTED), ['resubmit']);
assert.deepEqual(getListingActions(PropertyStatus.SOLD), ['resubmit']);
assert.deepEqual(getListingActions(PropertyStatus.PENDING_REVIEW), ['return_to_draft']);
assert.deepEqual(getListingActions(PropertyStatus.REJECTED), ['return_to_draft']);
assert.deepEqual(getListingActions(PropertyStatus.SUSPENDED), []);

console.log('Owner listing inventory tests passed.');
