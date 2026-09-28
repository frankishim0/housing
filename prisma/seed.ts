import { PrismaClient, ListingType, PropertyStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { toSlug } from '@/lib/location';

const prisma = new PrismaClient();

const locationData = [
  { country: 'Nigeria', state: 'FCT', city: 'Abuja', area: 'Maitama', address: 'Ibrahim Babangida Way' },
  { country: 'Nigeria', state: 'FCT', city: 'Abuja', area: 'Asokoro', address: 'Lake Chad Crescent' },
  { country: 'Nigeria', state: 'FCT', city: 'Abuja', area: 'Wuse', address: 'Wuse 2' },
  { country: 'Nigeria', state: 'Lagos', city: 'Lagos', area: 'Lekki', address: 'Lekki Phase 1' },
  { country: 'Nigeria', state: 'Lagos', city: 'Lagos', area: 'Victoria Island', address: 'Ahmadu Bello Way' },
  { country: 'Nigeria', state: 'Lagos', city: 'Lagos', area: 'Ikoyi', address: 'Kingsway Road' },
  { country: 'Nigeria', state: 'Rivers', city: 'Port Harcourt', area: 'GRA', address: 'GRA Phase 2' },
  { country: 'Nigeria', state: 'Oyo', city: 'Ibadan', area: 'Bodija', address: 'Bodija Estate' },
];

const propertyData = [
  { slug: 'modern-duplex-maitama', title: 'Modern 4 Bedroom Duplex in Maitama', location: 'Maitama', type: 'Duplex', listingType: ListingType.SALE, price: 93000000, bedrooms: 4, bathrooms: 4, size: 420 },
  { slug: 'garden-home-asokoro', title: 'Garden Home in Asokoro', location: 'Asokoro', type: 'House', listingType: ListingType.SALE, price: 74000000, bedrooms: 4, bathrooms: 3, size: 350 },
  { slug: 'sunset-apartment-wuse', title: 'Sunset Apartment in Wuse 2', location: 'Wuse', type: 'Apartment', listingType: ListingType.RENT, price: 4200000, bedrooms: 3, bathrooms: 3, size: 260 },
  { slug: 'lekki-serviced-apartment', title: 'Serviced Apartment in Lekki', location: 'Lekki', type: 'Apartment', listingType: ListingType.RENT, price: 6500000, bedrooms: 4, bathrooms: 4, size: 290 },
  { slug: 'victoria-island-penthouse', title: 'Victoria Island Penthouse', location: 'Victoria Island', type: 'Penthouse', listingType: ListingType.SALE, price: 180000000, bedrooms: 4, bathrooms: 5, size: 510 },
  { slug: 'ikoyi-family-home', title: 'Ikoyi Family Home', location: 'Ikoyi', type: 'House', listingType: ListingType.RENT, price: 12000000, bedrooms: 4, bathrooms: 4, size: 390 },
  { slug: 'gra-terrace-port-harcourt', title: 'GRA Terrace House', location: 'GRA', type: 'Terrace', listingType: ListingType.SALE, price: 71000000, bedrooms: 4, bathrooms: 4, size: 360 },
  { slug: 'bodija-starter-home', title: 'Bodija Starter Home', location: 'Bodija', type: 'House', listingType: ListingType.RENT, price: 2500000, bedrooms: 3, bathrooms: 2, size: 210 },
];

async function main() {
  await prisma.currency.upsert({ where: { code: 'NGN' }, create: { code: 'NGN', name: 'Nigerian naira' }, update: {} });
  await prisma.country.upsert({ where: { code: 'NG' }, create: { code: 'NG', name: 'Nigeria', nativeCurrencyCode: 'NGN' }, update: { nativeCurrencyCode: 'NGN' } });
  const passwordHash = await bcrypt.hash('Password123!', 12);
  const owner = await prisma.user.upsert({
    where: { email: 'owner@example.com' },
    update: { role: UserRole.OWNER, passwordHash, countryCode: 'NG', preferredCurrency: 'NGN' },
    create: { name: 'Demo Owner', email: 'owner@example.com', passwordHash, role: UserRole.OWNER, countryCode: 'NG', preferredCurrency: 'NGN' },
  });

  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { role: UserRole.ADMIN, passwordHash },
    create: { name: 'Demo Admin', email: 'admin@example.com', passwordHash, role: UserRole.ADMIN },
  });

  const locations = new Map<string, string>();
  for (const data of locationData) {
    const region = await prisma.region.upsert({
      where: { countryCode_name: { countryCode: 'NG', name: data.state } },
      create: { id: `region-ng-${toSlug(data.state)}`, countryCode: 'NG', name: data.state },
      update: {},
    });
    const city = await prisma.city.upsert({
      where: { regionId_name: { regionId: region.id, name: data.city } },
      create: { id: `city-ng-${toSlug(data.state)}-${toSlug(data.city)}`, countryCode: 'NG', regionId: region.id, name: data.city },
      update: {},
    });
    const location = await prisma.location.upsert({
      where: {
        id: `${data.city}-${data.area}`.toLowerCase().replaceAll(' ', '-'),
      },
      update: { ...data, countryCode: 'NG', regionId: region.id, cityId: city.id },
      create: { ...data, id: `${data.city}-${data.area}`.toLowerCase().replaceAll(' ', '-'), countryCode: 'NG', regionId: region.id, cityId: city.id },
    });
    locations.set(data.area, location.id);
  }

  for (const data of propertyData) {
    const { location, ...property } = data;
    await prisma.property.upsert({
      where: { slug: property.slug },
      update: { ...property, currencyCode: 'NGN', status: PropertyStatus.PUBLISHED, publishedAt: new Date(), ownerId: owner.id, locationId: locations.get(location)! },
      create: {
        ...property,
        currencyCode: 'NGN',
        description: `${property.title} with reliable power, water, security, and accessible amenities.`,
        status: PropertyStatus.PUBLISHED,
        publishedAt: new Date(),
        ownerId: owner.id,
        locationId: locations.get(location)!,
      },
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
