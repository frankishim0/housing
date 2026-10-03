import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createSession } from '@/lib/auth';
import { registerSchema } from '@/lib/validation';
import { getCurrencyName, getCountryCurrency } from '@/lib/international';
import { getName } from 'country-list';
import { toSlug } from '@/lib/location';
import { enforceRateLimits, getClientIp, readJsonBody } from '@/lib/http';

export async function POST(request: NextRequest) {
  const limited = enforceRateLimits([{ key: `register:ip:${getClientIp(request)}`, limit: 10, windowMs: 60 * 60 * 1000 }]);
  if (limited) return limited;
  const parsed = registerSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
  }

  const countryCode = parsed.data.countryCode;
  const countryName = countryCode ? getName(countryCode) : null;
  const nativeCurrency = countryCode ? getCountryCurrency(countryCode) : 'USD';
  const preferredCurrency = parsed.data.preferredCurrency ?? nativeCurrency;
  const user = await prisma.$transaction(async (transaction) => {
    await transaction.currency.upsert({
      where: { code: nativeCurrency },
      create: { code: nativeCurrency, name: getCurrencyName(nativeCurrency) },
      update: {},
    });
    if (preferredCurrency !== nativeCurrency) {
      await transaction.currency.upsert({
        where: { code: preferredCurrency },
        create: { code: preferredCurrency, name: getCurrencyName(preferredCurrency) },
        update: {},
      });
    }
    if (countryCode && countryName) {
      await transaction.country.upsert({
        where: { code: countryCode },
        create: { code: countryCode, name: countryName, nativeCurrencyCode: nativeCurrency },
        update: { name: countryName, nativeCurrencyCode: nativeCurrency },
      });
    }
    let regionId: string | undefined;
    let cityId: string | undefined;
    const regionName = parsed.data.region?.trim();
    const cityName = parsed.data.city?.trim();
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
    return transaction.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
        role: parsed.data.role,
        preferredLanguage: parsed.data.preferredLanguage,
        preferredCurrencyData: { connect: { code: preferredCurrency } },
        country: countryCode ? { connect: { code: countryCode } } : undefined,
        region: regionId ? { connect: { id: regionId } } : undefined,
        city: cityId ? { connect: { id: cityId } } : undefined,
      },
      select: { id: true, name: true, email: true, role: true, preferredCurrency: true },
    });
  });

  await createSession(user.id);
  return NextResponse.json({ user }, { status: 201 });
}
