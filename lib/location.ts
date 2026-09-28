import { getCode, getName } from 'country-list';
import { getCountryCurrency } from '@/lib/international';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type LocationInput = {
  countryCode?: string;
  country?: string;
  state?: string;
  region?: string;
  city: string;
  area?: string;
  neighborhood?: string;
  postalCode?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  hideExactAddress?: boolean;
};

export function toSlug(value: string) {
  return value.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function getLocationIdsWithinRadius(latitude: number, longitude: number, radiusKm: number) {
  const latitudeDelta = radiusKm / 111.32;
  const longitudeDelta = Math.min(180, radiusKm / (111.32 * Math.max(Math.abs(Math.cos(latitude * Math.PI / 180)), 0.0001)));
  const minLatitude = Math.max(-90, latitude - latitudeDelta);
  const maxLatitude = Math.min(90, latitude + latitudeDelta);
  const minLongitude = longitude - longitudeDelta;
  const maxLongitude = longitude + longitudeDelta;
  const longitudeCondition = longitudeDelta >= 180
    ? Prisma.sql`TRUE`
    : minLongitude < -180
      ? Prisma.sql`("longitude" <= ${maxLongitude} OR "longitude" >= ${minLongitude + 360})`
      : maxLongitude > 180
        ? Prisma.sql`("longitude" >= ${minLongitude} OR "longitude" <= ${maxLongitude - 360})`
        : Prisma.sql`"longitude" BETWEEN ${minLongitude} AND ${maxLongitude}`;
  return prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id"
    FROM "Location"
    WHERE "latitude" BETWEEN ${minLatitude} AND ${maxLatitude}
      AND ${longitudeCondition}
      AND 6371 * ACOS(LEAST(1.0, GREATEST(-1.0,
        SIN(RADIANS(${latitude})) * SIN(RADIANS("latitude"))
        + COS(RADIANS(${latitude})) * COS(RADIANS("latitude"))
        * COS(RADIANS("longitude" - ${longitude}))
      ))) <= ${radiusKm}
  `).then((locations) => locations.map(({ id }) => id));
}

export async function upsertLocationHierarchy(transaction: Prisma.TransactionClient, input: LocationInput) {
  const countryCode = (input.countryCode || getCode(input.country ?? '') || '').toUpperCase();
  const country = getName(countryCode);
  if (!country || countryCode.length !== 2) throw new Error('Select a valid country.');
  const regionName = (input.region || input.state || '').trim();
  const cityName = input.city.trim();
  if (!regionName || !cityName) throw new Error('Region and city are required.');

  const currencyCode = getCountryCurrency(countryCode);
  const currencyName = new Intl.DisplayNames(['en'], { type: 'currency' }).of(currencyCode) ?? currencyCode;
  await transaction.currency.upsert({
    where: { code: currencyCode },
    create: { code: currencyCode, name: currencyName },
    update: {},
  });
  await transaction.country.upsert({
    where: { code: countryCode },
    create: { code: countryCode, name: country, nativeCurrencyCode: currencyCode },
    update: { name: country, nativeCurrencyCode: currencyCode },
  });
  const region = await transaction.region.upsert({
    where: { countryCode_name: { countryCode, name: regionName } },
    create: { id: `region-${countryCode.toLowerCase()}-${toSlug(regionName)}`, countryCode, name: regionName },
    update: {},
  });
  const city = await transaction.city.upsert({
    where: { regionId_name: { regionId: region.id, name: cityName } },
    create: { id: `city-${countryCode.toLowerCase()}-${toSlug(regionName)}-${toSlug(cityName)}`, countryCode, regionId: region.id, name: cityName },
    update: {},
  });

  return {
    country,
    countryCode,
    state: regionName,
    city: cityName,
    area: (input.neighborhood || input.area || '').trim(),
    address: input.address.trim(),
    postalCode: input.postalCode?.trim() || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    hideExactAddress: input.hideExactAddress ?? false,
    regionId: region.id,
    cityId: city.id,
  };
}
