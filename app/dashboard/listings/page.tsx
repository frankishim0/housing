import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PropertyStatus } from '@prisma/client';
import { ShieldCheck } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import { formatCurrency } from '@/lib/international';
import { authorizeListingInventory, getListingActions, LISTING_SORTS, LISTING_STATUS_FILTERS, ownerListingQuerySchema } from '@/lib/owner-listings';
import { getOwnerListings } from '@/lib/owner-listings-data';
import { ListingActions } from '@/components/listing-actions';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<PropertyStatus, string> = {
  DRAFT: 'Draft', PENDING_REVIEW: 'Pending Review', PUBLISHED: 'Published', PAUSED: 'Paused', RENTED: 'Rented',   SOLD: 'Sold', REJECTED: 'Rejected', SUSPENDED: 'Suspended', ARCHIVED: 'Archived',
};
const STATUS_TONES: Record<PropertyStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700', PENDING_REVIEW: 'bg-amber-100 text-amber-800', PUBLISHED: 'bg-emerald-100 text-emerald-800', PAUSED: 'bg-sky-100 text-sky-800',
  RENTED: 'bg-violet-100 text-violet-800', SOLD: 'bg-violet-100 text-violet-800', REJECTED: 'bg-red-100 text-red-800', SUSPENDED: 'bg-red-100 text-red-800', ARCHIVED: 'bg-slate-200 text-slate-600',
};
const SORT_LABELS: Record<(typeof LISTING_SORTS)[number], string> = { updated: 'Recently updated', created: 'Recently created', price_asc: 'Price: low to high', price_desc: 'Price: high to low' };
const FILTER_ORDER: PropertyStatus[] = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'PAUSED', 'RENTED', 'SOLD', 'REJECTED', 'SUSPENDED', 'ARCHIVED'];

type SearchParams = Record<string, string | string[] | undefined>;

export default async function MyListingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getSessionUser();
  const access = authorizeListingInventory(user);
  if (!user || access === 'unauthenticated') redirect('/auth');
  if (access === 'forbidden') redirect('/dashboard');

  const raw = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const parsed = ownerListingQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : ownerListingQuerySchema.parse({});
  const { listings, total, pages, statusCounts } = await getOwnerListings(user.id, query);
  const allCount = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

  const href = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status: query.status, q: query.q, sort: query.sort, page: undefined, ...overrides };
    for (const [key, value] of Object.entries(merged)) if (value !== undefined && value !== '' && !(key === 'sort' && value === 'updated')) params.set(key, String(value));
    const qs = params.toString();
    return `/dashboard/listings${qs ? `?${qs}` : ''}`;
  };
  const filters = FILTER_ORDER.filter((status) => LISTING_STATUS_FILTERS.includes(status));

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm font-semibold text-emerald-700">← Dashboard</Link>
          <h1 className="mt-2 text-4xl font-bold text-slate-900">My Listings</h1>
          <p className="mt-1 text-sm text-slate-500">{allCount} {allCount === 1 ? 'listing' : 'listings'} you own or manage.</p>
        </div>
        <Link href="/listings/new" className="rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white">Create New Listing</Link>
      </div>

      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
        <Link href={href({ status: undefined })} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${!query.status ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>All ({allCount})</Link>
        {filters.map((status) => (
          <Link key={status} href={href({ status })} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${query.status === status ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{STATUS_LABELS[status]} ({statusCounts[status] ?? 0})</Link>
        ))}
      </nav>

      <form action="/dashboard/listings" className="mb-6 flex flex-wrap gap-3">
        {query.status && <input type="hidden" name="status" value={query.status} />}
        <input name="q" defaultValue={query.q ?? ''} maxLength={100} placeholder="Search by title or location" aria-label="Search listings" className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
        <select name="sort" defaultValue={query.sort} aria-label="Sort listings" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
          {LISTING_SORTS.map((sort) => <option key={sort} value={sort}>{SORT_LABELS[sort]}</option>)}
        </select>
        <button type="submit" className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white">Apply</button>
      </form>

      {!parsed.success && <p role="alert" className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Some filters were invalid and have been reset.</p>}

      {listings.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-xl font-semibold text-slate-900">{allCount === 0 ? 'You have no listings yet' : 'No listings match these filters'}</h2>
          <p className="mt-2 text-sm text-slate-500">{allCount === 0 ? 'Create your first listing to start receiving enquiries.' : 'Try a different status, search term, or sort order.'}</p>
          <Link href={allCount === 0 ? '/listings/new' : '/dashboard/listings'} className="mt-5 inline-block rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white">{allCount === 0 ? 'Create New Listing' : 'Clear filters'}</Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {listings.map((listing) => {
            const location = [listing.location.area, listing.location.city, listing.location.state, listing.location.country].filter(Boolean).join(', ');
            const actions = getListingActions(listing.status);
            return (
              <li key={listing.id} className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
                {listing.coverUrl
                  ? <Image src={listing.coverUrl} alt="" width={240} height={160} className="h-40 w-full rounded-2xl object-cover sm:w-60" />
                  : <div className="flex h-40 w-full items-center justify-center rounded-2xl bg-slate-100 text-sm text-slate-500 sm:w-60">No photo yet</div>}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONES[listing.status]}`}>{STATUS_LABELS[listing.status]}</span>
                    {listing.verified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white"><ShieldCheck size={12} /> Verified listing</span>}
                  </div>
                  <h2 className="mt-2 truncate text-xl font-bold text-slate-900">{listing.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{location}</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(listing.price, listing.currencyCode)} <span className="text-sm font-normal text-slate-500">{listing.currencyCode}</span></p>
                  <p className="mt-1 text-sm text-slate-500">{listing.listingType.replace(/_/g, ' ').toLowerCase()} · {listing.type} · Updated {new Intl.DateTimeFormat(user.preferredLanguage, { dateStyle: 'medium', timeZone: user.timeZone ?? undefined }).format(new Date(listing.updatedAt))}</p>
                  {listing.status === 'REJECTED' && listing.rejectionReason && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <p className="font-semibold">Rejected</p>
                      <p className="mt-1">{listing.rejectionReason}</p>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Link href={`/listings/${listing.id}/edit`} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-700 hover:text-emerald-800">Edit</Link>
                    <Link href={`/properties/${listing.slug}`} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">View listing</Link>
                    <ListingActions propertyId={listing.id} actions={actions} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-sm">
          {query.page > 1 ? <Link href={href({ page: query.page - 1 })} className="font-semibold text-emerald-800">← Previous</Link> : <span />}
          <span className="text-slate-500">Page {query.page} of {pages} · {total} results</span>
          {query.page < pages ? <Link href={href({ page: query.page + 1 })} className="font-semibold text-emerald-800">Next →</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
