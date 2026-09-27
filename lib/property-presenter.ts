import type { Prisma } from '@prisma/client';
import type { Property as UiProperty } from '@/lib/types';

export type PropertyWithRelations = Prisma.PropertyGetPayload<{
  include: {
    location: true;
    media: true;
    amenities: true;
    owner: true;
    agent: true;
  };
}>;

export function presentProperty(property: PropertyWithRelations, favorite = false): UiProperty {
  const media = [...property.media].sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.order - b.order);
  const owner = property.agent ?? property.owner;
  const status =
    property.status === 'RENTED' ? 'Rented' :
      property.status === 'SOLD' ? 'Sold' :
        property.status === 'PAUSED' ? 'Negotiation' :
          'Available';

  return {
    id: property.id,
    slug: property.slug,
    title: property.title,
    description: property.description,
    type: property.type as UiProperty['type'],
    listingType: property.listingType === 'SALE' ? 'Sale' : 'Rent',
    price: Number(property.price),
    currency: 'NGN',
    location: property.location,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    size: property.size,
    status,
    verified: property.verified,
    featured: property.featured,
    favorite,
    image: media.find((item) => item.isCover && item.type === 'IMAGE')?.url ?? media.find((item) => item.type === 'IMAGE')?.url ?? 'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&w=1200&q=80',
    images: media.filter((item) => item.type === 'IMAGE').map((item) => item.url),
    amenities: property.amenities.map((item) => item.name),
    tag: property.verified ? 'Verified' : 'New',
    owner: {
      name: owner.name,
      company: 'Independent property professional',
      avatar: owner.profileImage ?? 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
      rating: 0,
    },
    createdAt: property.createdAt.toISOString(),
  };
}
