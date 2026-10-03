export type ListingType = 'Rent' | 'Sale' | 'Short-term rental' | 'Long-term rental' | 'Lease';
export type PropertyType = string;
export type MeasurementUnit = 'SQUARE_METERS' | 'SQUARE_FEET' | 'ACRES' | 'HECTARES';

export interface LocationSummary {
  country: string;
  state: string;
  city: string;
  area: string;
  address: string;
  countryCode?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  hideExactAddress?: boolean;
}

export interface PropertyOwner {
  name: string;
  company: string;
  avatar: string;
  rating: number;
  verified?: boolean;
  verifiedAt?: string | null;
  professionalVerified?: boolean;
  professionalVerifiedAt?: string | null;
}

export interface Property {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: PropertyType;
  listingType: ListingType;
  price: number;
  currency: string;
  location: LocationSummary;
  bedrooms: number;
  bathrooms: number;
  size: number;
  sizeUnit: MeasurementUnit;
  furnished: boolean | null;
  parkingSpaces: number | null;
  hasPool: boolean;
  hasSecurity: boolean;
  luxury: boolean;
  yearBuilt: number | null;
  status: 'Available' | 'Occupied' | 'Negotiation' | 'Sold' | 'Rented';
  verified: boolean;
  verifiedAt?: string | null;
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
