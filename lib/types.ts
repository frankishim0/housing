export type ListingType = 'Rent' | 'Sale';
export type PropertyType =
  | 'Apartment'
  | 'House'
  | 'Duplex'
  | 'Detached House'
  | 'Semi-detached House'
  | 'Terrace'
  | 'Penthouse'
  | 'Studio'
  | 'Office'
  | 'Land'
  | 'Commercial property';

export interface LocationSummary {
  country: string;
  state: string;
  city: string;
  area: string;
  address: string;
}

export interface PropertyOwner {
  name: string;
  company: string;
  avatar: string;
  rating: number;
}

export interface Property {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: PropertyType;
  listingType: ListingType;
  price: number;
  currency: 'NGN';
  location: LocationSummary;
  bedrooms: number;
  bathrooms: number;
  size: number;
  status: 'Available' | 'Occupied' | 'Negotiation' | 'Sold' | 'Rented';
  verified: boolean;
  featured: boolean;
  favorite: boolean;
  image: string;
  images: string[];
  amenities: string[];
  tag: string;
  owner: PropertyOwner;
  createdAt: string;
}

export interface PopularLocation {
  name: string;
  state: string;
  listings: number;
  image: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  params: string;
}
