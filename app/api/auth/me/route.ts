import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { profileSettingsSchema } from '@/lib/validation';
import { getCurrencyName, getCountryCurrency } from '@/lib/international';
import { getName } from 'country-list';
import { toSlug } from '@/lib/location';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      profileImage: user.profileImage,
      email: user.email,
      role: user.role,
      phone: user.phone,
      countryCode: user.countryCode,
      regionId: user.regionId,
      cityId: user.cityId,
      preferredCurrency: user.preferredCurrency,
      preferredLanguage: user.preferredLanguage,
      timeZone: user.timeZone,
      measurementUnit: user.measurementUnit,
      verificationStatus: user.verificationStatus,
    },
  });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = profileSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const values = parsed.data;

  const countryCode = values.countryCode ?? user.countryCode;
  const countryName = countryCode ? getName(countryCode) : undefined;
  const currencyCode = values.preferredCurrency;
  const nativeCurrency = values.countryCode ? getCountryCurrency(values.countryCode) : undefined;

  const updated = await prisma.$transaction(async (transaction) => {
    if (nativeCurrency) {
      await transaction.currency.upsert({
        where: { code: nativeCurrency },
        create: { code: nativeCurrency, name: getCurrencyName(nativeCurrency) },
        update: {},
      });
    }
    if (currencyCode) {
      await transaction.currency.upsert({
        where: { code: currencyCode },
        create: { code: currencyCode, name: getCurrencyName(currencyCode) },
        update: {},
      });
    }
    if (values.countryCode && countryName) {
      await transaction.country.upsert({
        where: { code: values.countryCode },
        create: { code: values.countryCode, name: countryName, nativeCurrencyCode: nativeCurrency },
        update: { name: countryName, nativeCurrencyCode: nativeCurrency },
      });
    }

    let regionId: string | undefined;
    let cityId: string | undefined;
    const regionName = values.region?.trim();
    const cityName = values.city?.trim();
    if (countryCode && regionName && cityName) {
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
      regionId = region.id;
      cityId = city.id;
    }

    return transaction.user.update({
      where: { id: user.id },
      data: {
        name: values.name,
        profileImage: values.profileImage === '' ? null : values.profileImage,
        phone: values.phone,
        preferredLanguage: values.preferredLanguage,
        timeZone: values.timeZone || null,
        measurementUnit: values.measurementUnit,
        ...(currencyCode ? { preferredCurrencyData: { connect: { code: currencyCode } } } : {}),
        ...(values.countryCode ? { country: { connect: { code: values.countryCode } } } : {}),
        ...(regionId ? { region: { connect: { id: regionId } }, city: { connect: { id: cityId } } } : {}),
      },
      select: { id: true, preferredCurrency: true, preferredLanguage: true, timeZone: true, measurementUnit: true, countryCode: true, regionId: true, cityId: true, phone: true },
    });
  });
  return NextResponse.json({ user: updated });
}
