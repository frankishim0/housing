import { NextRequest, NextResponse } from 'next/server';
import { PayoutAccountStatus, Prisma } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { getCurrencyName, isCurrencyCode } from '@/lib/international';
import {
  assertPayoutsTestConfiguration,
  createTransferRecipient,
  decryptAccountNumber,
  encryptAccountNumber,
  isPayoutsEnabled,
  isSupportedPaystackPayoutRoute,
  resolveBankAccount,
} from '@/lib/payouts';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({
  countryCode: z.string().trim().length(2).toUpperCase(),
  currencyCode: z.string().trim().length(3).toUpperCase(),
  bankCode: z.string().trim().min(1).max(20),
  bankName: z.string().trim().min(2).max(120),
  accountNumber: z.string().trim().regex(/^\d{6,20}$/, 'Account number must be 6-20 digits.'),
}).strict();

function maskAccount(last4: string) {
  return `••••${last4}`;
}

function serializeAccount(account: {
  id: string;
  bankName: string;
  accountNumberLast4: string;
  accountName: string;
  currencyCode: string;
  countryCode: string;
  status: PayoutAccountStatus;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: account.id,
    bankName: account.bankName,
    maskedAccountNumber: maskAccount(account.accountNumberLast4),
    accountName: account.accountName,
    currencyCode: account.currencyCode,
    countryCode: account.countryCode,
    status: account.status,
    verifiedAt: account.verifiedAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const account = await prisma.payoutAccount.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ data: account ? serializeAccount(account) : null, payoutsEnabled: isPayoutsEnabled() });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    assertPayoutsTestConfiguration();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Seller payouts are disabled.' }, { status: 503 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { countryCode, currencyCode, bankCode, bankName, accountNumber } = parsed.data;
  if (!isCurrencyCode(currencyCode)) {
    return NextResponse.json({ error: 'Unsupported payout currency.' }, { status: 422 });
  }
  if (!isSupportedPaystackPayoutRoute(countryCode, currencyCode)) {
    return NextResponse.json({ error: 'Paystack bank transfers are currently supported only for verified Nigerian NGN accounts.' }, { status: 422 });
  }

  try {
    const existingAccount = await prisma.payoutAccount.findUnique({ where: { userId: user.id } });
    if (existingAccount) {
      const processingPayouts = await prisma.payout.count({
        where: { payoutAccountId: existingAccount.id, status: 'PROCESSING' },
      });
      if (processingPayouts > 0) {
        return NextResponse.json({ error: 'The payout account cannot be changed while a transfer is processing.' }, { status: 409 });
      }
    }

    const resolved = await resolveBankAccount({ accountNumber, bankCode });
    const sameVerifiedAccount = existingAccount
      && existingAccount.status === PayoutAccountStatus.VERIFIED
      && existingAccount.countryCode === countryCode
      && existingAccount.currencyCode === currencyCode
      && existingAccount.bankCode === bankCode
      && existingAccount.recipientCode
      && decryptAccountNumber(existingAccount.accountNumberCipher) === resolved.accountNumber;
    const recipient = sameVerifiedAccount
      ? { recipientCode: existingAccount.recipientCode }
      : await createTransferRecipient({
          name: resolved.accountName,
          accountNumber: resolved.accountNumber,
          bankCode,
          currency: currencyCode,
        });

    await prisma.currency.upsert({
      where: { code: currencyCode },
      create: { code: currencyCode, name: getCurrencyName(currencyCode) },
      update: {},
    });

    let wasCreated = false;
    const account = await prisma.$transaction(async (tx) => {
      const existing = await tx.payoutAccount.findUnique({ where: { userId: user.id } });
      wasCreated = !existing;
      const data = {
        countryCode,
        currencyCode,
        bankCode,
        bankName,
        accountNumberLast4: resolved.accountNumber.slice(-4),
        accountNumberCipher: encryptAccountNumber(resolved.accountNumber),
        accountName: resolved.accountName,
        provider: 'PAYSTACK',
        recipientCode: recipient.recipientCode,
        status: PayoutAccountStatus.VERIFIED,
        verifiedAt: new Date(),
        disabledAt: null,
      };
      const saved = existing
        ? await tx.payoutAccount.update({ where: { id: existing.id }, data })
        : await tx.payoutAccount.create({ data: { userId: user.id, ...data } });
      const unlinkedPayouts = await tx.payout.findMany({
        where: {
          recipientId: user.id,
          currencyCode,
          status: 'PENDING',
          payoutAccountId: null,
        },
        select: { id: true },
      });
      for (const payout of unlinkedPayouts) {
        const linked = await tx.payout.updateMany({
          where: { id: payout.id, payoutAccountId: null, status: 'PENDING' },
          data: { payoutAccountId: saved.id },
        });
        if (linked.count === 1) {
          await tx.financialAuditLog.create({
            data: {
              actorId: user.id,
              action: 'PAYOUT_UPDATED',
              entityType: 'Payout',
              entityId: payout.id,
              after: { payoutAccountId: saved.id },
              reason: 'Pending seller payout linked to the seller’s verified Paystack recipient.',
            },
          });
        }
      }
      if (!sameVerifiedAccount && existing) {
        const payoutsNeedingReapproval = await tx.payout.findMany({
          where: { payoutAccountId: saved.id, status: 'PENDING', approvedAt: { not: null } },
          select: { id: true, approvedAt: true, approvedById: true },
        });
        await tx.payout.updateMany({
          where: { id: { in: payoutsNeedingReapproval.map((payout) => payout.id) }, status: 'PENDING' },
          data: { approvedAt: null, approvedById: null },
        });
        for (const payout of payoutsNeedingReapproval) {
          await tx.financialAuditLog.create({
            data: {
              actorId: user.id,
              action: 'PAYOUT_UPDATED',
              entityType: 'Payout',
              entityId: payout.id,
              before: { approvedAt: payout.approvedAt?.toISOString() ?? null, approvedById: payout.approvedById },
              after: { approvedAt: null, approvedById: null },
              reason: 'Payout approval revoked because the seller changed the verified payout account.',
            },
          });
        }
      }
      await tx.financialAuditLog.create({
        data: {
          actorId: user.id,
          action: 'PAYOUT_UPDATED',
          entityType: 'PayoutAccount',
          entityId: saved.id,
          before: existing ? { bankName: existing.bankName, last4: existing.accountNumberLast4 } : Prisma.JsonNull,
          after: { bankName, last4: saved.accountNumberLast4, recipientCode: recipient.recipientCode },
          reason: existing ? 'Seller updated their verified payout bank account (test mode).' : 'Seller onboarded a verified payout bank account (test mode).',
        },
      });
      return saved;
    });

    return NextResponse.json({ data: serializeAccount(account) }, { status: wasCreated ? 201 : 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'This bank account is already linked to another seller payout profile.' }, { status: 409 });
    }
    console.error('Payout bank-account onboarding failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify this bank account right now.' }, { status: 502 });
  }
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const account = await prisma.payoutAccount.findUnique({ where: { userId: user.id } });
  if (!account) return NextResponse.json({ error: 'No payout account is on file.' }, { status: 404 });
  const processingPayouts = await prisma.payout.count({
    where: { payoutAccountId: account.id, status: 'PROCESSING' },
  });
  if (processingPayouts > 0) {
    return NextResponse.json({ error: 'The payout account cannot be disabled while a transfer is processing.' }, { status: 409 });
  }
  await prisma.payoutAccount.update({
    where: { id: account.id },
    data: { status: PayoutAccountStatus.DISABLED, disabledAt: new Date() },
  });
  await prisma.financialAuditLog.create({
    data: {
      actorId: user.id,
      action: 'PAYOUT_UPDATED',
      entityType: 'PayoutAccount',
      entityId: account.id,
      before: { status: account.status },
      after: { status: PayoutAccountStatus.DISABLED },
      reason: 'Seller disabled their payout bank account.',
    },
  });
  return NextResponse.json({ data: { disabled: true } });
}
