import { BillingInterval, CommissionPayer, FinancialAuditAction, MonetizationProductType, PaymentType, Prisma, UserRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getCurrencyName, isCurrencyCode } from '@/lib/international';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const ruleDataSchema = z.object({
  name: z.string().trim().min(2).max(100),
  transactionType: z.nativeEnum(PaymentType).nullable(),
  countryCode: z.string().trim().length(2).toUpperCase().nullable(),
  propertyTypeCode: z.string().trim().max(80).nullable(),
  currencyCode: z.string().trim().length(3).toUpperCase().nullable(),
  percentageRate: z.number().min(0).max(100),
  fixedFee: z.number().min(0).max(1_000_000_000),
  processingFeeRate: z.number().min(0).max(100),
  processingFeeFixed: z.number().min(0).max(1_000_000_000),
  payer: z.nativeEnum(CommissionPayer),
  active: z.boolean(),
});

const productDataSchema = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[A-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(2).max(1000),
  type: z.nativeEnum(MonetizationProductType),
  billingInterval: z.nativeEnum(BillingInterval),
  price: z.number().min(0).max(1_000_000_000),
  currencyCode: z.string().trim().length(3).toUpperCase(),
  durationDays: z.number().int().positive().max(3650).nullable(),
  listingLimit: z.number().int().positive().max(1_000_000).nullable(),
  features: z.array(z.string().trim().min(1).max(100)).max(30),
  active: z.boolean(),
});

const schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('commissionRule'), id: z.string().optional(), reason: z.string().trim().min(10).max(500), data: ruleDataSchema }),
  z.object({ kind: z.literal('product'), id: z.string().optional(), reason: z.string().trim().min(10).max(500), data: productDataSchema }),
]);

function decimal4(value: number) {
  return value.toFixed(4);
}

function auditSnapshot(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function authError(error: unknown) {
  const unauthenticated = error instanceof Error && error.message === 'UNAUTHENTICATED';
  return NextResponse.json(
    { error: unauthenticated ? 'Authentication required.' : 'Admin role required.' },
    { status: unauthenticated ? 401 : 403 },
  );
}

export async function GET() {
  let admin;
  try {
    admin = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    return authError(error);
  }

  const since = new Date();
  since.setMonth(since.getMonth() - 11, 1);
  since.setHours(0, 0, 0, 0);
  const [commissionRules, products, transactionsByCountryCurrency, payouts, refunds, subscriptionRevenue, featuredRevenue, leadRevenue, transactionTrends, recentTransactions, auditLogs] = await Promise.all([
    prisma.commissionRule.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.monetizationProduct.findMany({ orderBy: [{ active: 'desc' }, { type: 'asc' }, { name: 'asc' }] }),
    prisma.financialTransaction.groupBy({
      by: ['countryCode', 'currencyCode'],
      where: { paidAt: { not: null } },
      orderBy: [{ countryCode: 'asc' }, { currencyCode: 'asc' }],
      _sum: { amount: true, platformCommission: true, totalBuyerDue: true, paymentProcessingFee: true, finalPayout: true },
    }),
    prisma.payout.groupBy({ by: ['currencyCode', 'status'], orderBy: [{ currencyCode: 'asc' }, { status: 'asc' }], _sum: { amount: true }, _count: { _all: true } }),
    prisma.transactionRefund.groupBy({ by: ['currencyCode'], where: { status: 'PAID' }, orderBy: { currencyCode: 'asc' }, _sum: { amount: true } }),
    prisma.userSubscription.groupBy({ by: ['currencyCode'], where: { status: { in: ['ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'] }, startedAt: { not: null } }, orderBy: { currencyCode: 'asc' }, _sum: { priceAtPurchase: true } }),
    prisma.featuredListing.groupBy({ by: ['currencyCode'], where: { status: 'PAID' }, orderBy: { currencyCode: 'asc' }, _sum: { priceAtPurchase: true } }),
    prisma.leadPurchase.groupBy({ by: ['currencyCode'], where: { status: 'PAID' }, orderBy: { currencyCode: 'asc' }, _sum: { priceAtPurchase: true } }),
    prisma.$queryRaw<Array<{ month: Date; currencyCode: string; gross: string; commission: string }>>(Prisma.sql`
      SELECT DATE_TRUNC('month', "paidAt") AS month, "currencyCode",
        COALESCE(SUM("amount"), 0)::text AS gross,
        COALESCE(SUM("platformCommission"), 0)::text AS commission
      FROM "FinancialTransaction"
      WHERE "paidAt" IS NOT NULL AND "paidAt" >= ${since}
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC
    `),
    prisma.financialTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
        property: { select: { id: true, title: true, slug: true } },
        refunds: true,
        disputes: true,
      },
    }),
    prisma.financialAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: { name: true, email: true } } },
    }),
  ]);

  return NextResponse.json({
    data: {
      commissionRules,
      products,
      transactionsByCountryCurrency,
      payouts,
      refunds,
      revenue: { subscriptions: subscriptionRevenue, featuredListings: featuredRevenue, leads: leadRevenue },
      transactionTrends,
      recentTransactions,
      auditLogs,
      generatedAt: new Date().toISOString(),
      adminId: admin.id,
    },
  });
}

export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    return authError(error);
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { kind, id, reason, data } = parsed.data;

  if (kind === 'commissionRule' && data.currencyCode && !isCurrencyCode(data.currencyCode)) {
    return NextResponse.json({ error: 'Use a valid ISO 4217 currency code.' }, { status: 400 });
  }
  if (kind === 'product' && !isCurrencyCode(data.currencyCode)) {
    return NextResponse.json({ error: 'Use a valid ISO 4217 currency code.' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (kind === 'commissionRule') {
        if (data.currencyCode) {
          await tx.currency.upsert({
            where: { code: data.currencyCode },
            create: { code: data.currencyCode, name: getCurrencyName(data.currencyCode) },
            update: {},
          });
        }
        const before = id ? await tx.commissionRule.findUniqueOrThrow({ where: { id } }) : null;
        const values = {
          ...data,
          percentageRate: decimal4(data.percentageRate),
          fixedFee: decimal4(data.fixedFee),
          processingFeeRate: decimal4(data.processingFeeRate),
          processingFeeFixed: decimal4(data.processingFeeFixed),
        };
        const saved = before
          ? await tx.commissionRule.update({ where: { id }, data: values })
          : await tx.commissionRule.create({ data: values });
        await tx.financialAuditLog.create({
          data: {
            actorId: admin.id,
            action: before ? FinancialAuditAction.COMMISSION_RULE_UPDATED : FinancialAuditAction.COMMISSION_RULE_CREATED,
            entityType: 'CommissionRule',
            entityId: saved.id,
            before: before ? auditSnapshot(before) : undefined,
            after: auditSnapshot(saved),
            reason,
          },
        });
        return saved;
      }

      await tx.currency.upsert({
        where: { code: data.currencyCode },
        create: { code: data.currencyCode, name: getCurrencyName(data.currencyCode) },
        update: {},
      });
      const before = id ? await tx.monetizationProduct.findUniqueOrThrow({ where: { id } }) : null;
      const saved = before
        ? await tx.monetizationProduct.update({ where: { id }, data: { ...data, price: decimal4(data.price) } })
        : await tx.monetizationProduct.create({ data: { ...data, price: decimal4(data.price) } });
      await tx.financialAuditLog.create({
        data: {
          actorId: admin.id,
          action: before ? FinancialAuditAction.PRODUCT_UPDATED : FinancialAuditAction.PRODUCT_CREATED,
          entityType: 'MonetizationProduct',
          entityId: saved.id,
          before: before ? auditSnapshot(before) : undefined,
          after: auditSnapshot(saved),
          reason,
        },
      });
      return saved;
    });

    return NextResponse.json({ data: result }, { status: id ? 200 : 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'A product with this code already exists.' }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'The financial configuration no longer exists.' }, { status: 404 });
    }
    throw error;
  }
}
