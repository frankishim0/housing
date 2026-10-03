import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { countries, isCurrencyCode } from '@/lib/international';

const countryCodeSchema = z.string().trim().length(2).toUpperCase().refine(
  (code) => countries.some((country) => country.code === code),
  'Choose a valid ISO country.',
);

const currencyCodeSchema = z.string().trim().length(3).toUpperCase().refine(isCurrencyCode, 'Choose a valid ISO currency.');
const blankAsUndefined = (value: unknown) => value === '' || value === null ? undefined : value;
const optionalCountryCodeSchema = z.preprocess(blankAsUndefined, countryCodeSchema.optional());
const optionalCurrencyCodeSchema = z.preprocess(blankAsUndefined, currencyCodeSchema.optional());
const optionalNonnegativeNumber = z.preprocess(blankAsUndefined, z.coerce.number().nonnegative().optional());
const optionalNonnegativeInteger = z.preprocess(blankAsUndefined, z.coerce.number().int().nonnegative().optional());
const optionalTimeZone = z.string().trim().max(80).optional().refine((value) => {
  if (!value) return true;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'Enter a valid IANA time zone.');

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  phone: z.string().trim().max(30).optional().refine((value) => !value || isValidPhoneNumber(value), 'Enter a valid international phone number including its country code.'),
  countryCode: optionalCountryCodeSchema,
  region: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  preferredCurrency: currencyCodeSchema.optional(),
  preferredLanguage: z.string().trim().min(2).max(12).default('en'),
  role: z.enum(['USER', 'TENANT', 'OWNER', 'LANDLORD', 'AGENT', 'PROPERTY_MANAGER', 'DEVELOPER']).default('USER'),
});

export const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export const profileSettingsSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  profileImage: z.string().trim().max(500).optional().refine((value) => !value || (z.url().safeParse(value).success && value.startsWith('https://')), 'Use a secure HTTPS image URL.'),
  phone: z.string().trim().max(30).optional().refine((value) => !value || isValidPhoneNumber(value), 'Enter a valid international phone number including its country code.'),
  countryCode: optionalCountryCodeSchema,
  region: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  preferredCurrency: currencyCodeSchema.optional(),
  preferredLanguage: z.string().trim().min(2).max(12).optional(),
  timeZone: optionalTimeZone,
  measurementUnit: z.enum(['SQUARE_METERS', 'SQUARE_FEET', 'ACRES', 'HECTARES']).optional(),
}).refine((values) => Object.values(values).some((value) => value !== undefined), 'Provide a profile setting to update.');

export const forgotPasswordSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export const propertySearchSchema = z.object({
  location: z.string().trim().optional(),
  countryCode: optionalCountryCodeSchema,
  currency: optionalCurrencyCodeSchema,
  state: z.string().trim().optional(),
  region: z.string().trim().optional(),
  city: z.string().trim().optional(),
  area: z.string().trim().optional(),
  postalCode: z.string().trim().max(20).optional(),
  minPrice: optionalNonnegativeNumber,
  maxPrice: optionalNonnegativeNumber,
  listingType: z.preprocess(blankAsUndefined, z.enum(['RENT', 'SALE', 'SHORT_TERM_RENT', 'LONG_TERM_RENT', 'LEASE']).optional()),
  type: z.string().trim().optional(),
  bedrooms: optionalNonnegativeInteger,
  bathrooms: optionalNonnegativeInteger,
  amenity: z.string().trim().optional(),
  furnished: z.preprocess(blankAsUndefined, z.enum(['true', 'false']).optional()),
  parkingSpaces: optionalNonnegativeInteger,
  hasPool: z.preprocess(blankAsUndefined, z.enum(['true', 'false']).optional()),
  hasSecurity: z.preprocess(blankAsUndefined, z.enum(['true', 'false']).optional()),
  minSize: optionalNonnegativeNumber,
  maxSize: optionalNonnegativeNumber,
  sizeUnit: z.preprocess(blankAsUndefined, z.enum(['SQUARE_METERS', 'SQUARE_FEET', 'ACRES', 'HECTARES']).optional()),
  yearBuiltFrom: z.preprocess(blankAsUndefined, z.coerce.number().int().min(1000).max(new Date().getFullYear()).optional()),
  latitude: z.preprocess(blankAsUndefined, z.coerce.number().min(-90).max(90).optional()),
  longitude: z.preprocess(blankAsUndefined, z.coerce.number().min(-180).max(180).optional()),
  radiusKm: z.preprocess(blankAsUndefined, z.coerce.number().positive().max(500).optional()),
  view: z.preprocess(blankAsUndefined, z.enum(['list', 'map']).default('list')),
  availability: z.enum(['PUBLISHED', 'RENTED', 'SOLD']).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
}).refine((filters) => (filters.minPrice === undefined && filters.maxPrice === undefined) || Boolean(filters.currency), {
  path: ['currency'],
  message: 'Select the original listing currency used by the price range.',
}).refine((filters) => !filters.sort.startsWith('price_') || Boolean(filters.currency), {
  path: ['currency'],
  message: 'Select a listing currency before sorting prices; original prices in different currencies are not directly comparable.',
}).refine((filters) => (filters.minSize === undefined && filters.maxSize === undefined) || Boolean(filters.sizeUnit), {
  path: ['sizeUnit'],
  message: 'Select a measurement unit when filtering by size.',
});

/**
 * Fields an owner/agent/admin may edit through the property PATCH endpoint.
 * `.strict()` rejects any other key in the request body (for example ownerId,
 * agentId, verified, or verifiedAt), so protected fields can never be
 * client-controlled even if a caller tries to smuggle them in.
 */
export const propertyUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  type: z.string().trim().min(1).max(100).optional(),
  price: z.coerce.number().positive().optional(),
  bedrooms: z.coerce.number().int().min(0).optional(),
  bathrooms: z.coerce.number().int().min(0).optional(),
  size: z.coerce.number().positive().optional(),
  parkingSpaces: z.coerce.number().int().min(0).nullable().optional(),
  yearBuilt: z.coerce.number().int().min(1000).max(new Date().getFullYear()).nullable().optional(),
  listingType: z.enum(['RENT', 'SALE', 'SHORT_TERM_RENT', 'LONG_TERM_RENT', 'LEASE']).optional(),
  sizeUnit: z.enum(['SQUARE_METERS', 'SQUARE_FEET', 'ACRES', 'HECTARES']).optional(),
  furnished: z.boolean().nullable().optional(),
  hasPool: z.boolean().optional(),
  hasSecurity: z.boolean().optional(),
  luxury: z.boolean().optional(),
  currencyCode: currencyCodeSchema.optional(),
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'REJECTED', 'PUBLISHED', 'PAUSED', 'RENTED', 'SOLD', 'SUSPENDED']).optional(),
}).strict();
