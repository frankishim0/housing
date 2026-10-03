import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ModerationAuditAction, UserRole } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ListingActions } from '@/components/listing-actions';
import { ListingForm, type ListingFormInitial } from '@/components/listing-form';
import { PropertyMediaManager } from '@/components/property-media-manager';
import { getListingActions, LISTING_MANAGER_ROLES } from '@/lib/owner-listings';
import { canEditListing } from '@/lib/listing-edit';

export const dynamic = 'force-dynamic';

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/auth');
  if (user.role !== UserRole.ADMIN && !LISTING_MANAGER_ROLES.includes(user.role)) redirect('/dashboard');

  const property = await prisma.property.findUnique({
    where: { id: (await params).id },
    include: {
      location: true,
      amenities: { orderBy: { name: 'asc' } },
      media: { orderBy: [{ order: 'asc' }, { id: 'asc' }], select: { id: true, url: true, type: true, fileName: true, isCover: true, order: true } },
    },
  });
  if (!property) notFound();
  const isAdmin = user.role === UserRole.ADMIN;
  if (!canEditListing(user, property)) notFound();
  const latestRejection = property.status === 'REJECTED' ? await prisma.moderationAuditLog.findFirst({
    where: {
      entityType: 'Property',
      entityId: property.id,
      action: ModerationAuditAction.PROPERTY_REVIEW_REJECTED,
    },
    orderBy: { createdAt: 'desc' },
    select: { reason: true, createdAt: true },
  }) : null;

  const initial: ListingFormInitial = {
    id: property.id,
    title: property.title,
    description: property.description,
    type: property.type,
    listingType: property.listingType,
    price: Number(property.price),
    currencyCode: property.currencyCode,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    size: Number(property.size),
    sizeUnit: property.sizeUnit,
    countryCode: property.location.countryCode ?? '',
    region: property.location.state ?? '',
    city: property.location.city,
    neighborhood: property.location.area ?? '',
    postalCode: property.location.postalCode ?? '',
    address: property.location.address,
    latitude: property.location.latitude,
    longitude: property.location.longitude,
    hideExactAddress: property.location.hideExactAddress,
    amenities: property.amenities.map(({ name }) => name),
    parkingSpaces: property.parkingSpaces,
    yearBuilt: property.yearBuilt,
    furnished: property.furnished,
    hasPool: property.hasPool,
    hasSecurity: property.hasSecurity,
    luxury: property.luxury,
    media: property.media.map(({ id, url, type, fileName, isCover }) => ({
      id,
      url: type === 'DOCUMENT' ? '' : url,
      type,
      fileName,
      isCover,
    })),
  };
  const actions = isAdmin ? [] : getListingActions(property.status);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 lg:px-8">
      <div className="mb-8">
        <Link href="/dashboard/listings" className="text-sm font-semibold text-emerald-700">← My Listings</Link>
        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Listing management</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-900">Edit listing</h1>
        <p className="mt-2 text-sm text-slate-600">Current status: <span className="font-semibold">{property.status.replace(/_/g, ' ').toLowerCase()}</span>. Saving details does not change its status or publish it.</p>
        {property.status === 'REJECTED' && latestRejection?.reason && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">Rejected</p>
            <p className="mt-1">{latestRejection.reason}</p>
            {latestRejection.createdAt && <p className="mt-1 text-xs">Reviewed {new Intl.DateTimeFormat(user.preferredLanguage, { dateStyle: 'medium', timeStyle: 'short', timeZone: user.timeZone ?? undefined }).format(latestRejection.createdAt)}</p>}
          </div>
        )}
      </div>
      <ListingForm initial={initial} />
      {(property.ownerId === user.id || property.agentId === user.id) && (
        <PropertyMediaManager
          propertyId={property.id}
          canUpload
          media={property.media.map(({ id, url, type, fileName, isCover, order }) => ({ id, type, fileName, isCover, order, url: type === 'DOCUMENT' ? undefined : url }))}
        />
      )}
      {!isAdmin && actions.length > 0 && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Listing status actions</h2>
          <p className="mt-1 text-sm text-slate-500">Status changes use the existing review workflow.</p>
          <div className="mt-4 flex flex-wrap gap-2"><ListingActions propertyId={property.id} actions={actions} /></div>
        </section>
      )}
    </main>
  );
}
