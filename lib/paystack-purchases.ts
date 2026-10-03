import {
  BillingInterval,
  FinancialAuditAction,
  FinancialTransactionStatus,
  MonetizationOrderStatus,
  PaymentStatus,
  PaymentType,
  PropertyStatus,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { amountToMinorUnits, VerifiedPayment } from '@/lib/payments';
import { PaymentPurchase, PaymentWebhookRepository, processVerifiedPayment } from '@/lib/payment-webhook';
import { createPayoutRecordForPaidTransaction, isPayoutsEnabled } from '@/lib/payouts';
import { prisma } from '@/lib/prisma';
import { canCompleteSale } from '@/lib/transaction-lifecycle';

type TransactionClient = Prisma.TransactionClient;

function addBillingInterval(start: Date, interval: BillingInterval) {
  const end = new Date(start);
  if (interval === BillingInterval.MONTHLY) end.setMonth(end.getMonth() + 1);
  else if (interval === BillingInterval.ANNUAL) end.setFullYear(end.getFullYear() + 1);
  return end;
}

const repository: PaymentWebhookRepository<TransactionClient> = {
  async runOnce(eventId, eventType, action) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const record = await tx.paymentWebhookEvent.create({
          data: { eventId, eventType, outcome: 'processing' },
          select: { id: true },
        });
        const outcome = await action(tx);
        await tx.paymentWebhookEvent.update({
          where: { id: record.id },
          data: { outcome: String(outcome), processedAt: new Date() },
        });
        return outcome;
      }, { maxWait: 10_000, timeout: 20_000 });
      return { duplicate: false, result };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = error.meta?.target;
        if ((Array.isArray(target) && target.includes('eventId'))
          || (typeof target === 'string' && target.includes('eventId'))) {
          return { duplicate: true };
        }
      }
      throw error;
    }
  },

  async findPurchase(tx, reference, providerCode): Promise<PaymentPurchase | null> {
    const payment = await tx.payment.findUnique({
      where: { reference },
      include: { financialTransaction: true, currencyData: { select: { minorUnits: true } } },
    });
    if (!payment || payment.provider !== providerCode) return null;

    if (payment.financialTransaction) {
      const transaction = payment.financialTransaction;
      const amountMinor = amountToMinorUnits(transaction.totalBuyerDue.toString(), payment.currencyData.minorUnits);
      if (amountMinor !== amountToMinorUnits(payment.amount.toString(), payment.currencyData.minorUnits)
        || payment.currency !== transaction.currencyCode) {
        throw new Error(`Stored ${providerCode} payment does not match the financial transaction quote.`);
      }
      return {
        kind: 'TRANSACTION',
        id: transaction.id,
        reference: transaction.reference,
        providerReference: payment.providerReference,
        status: transaction.status,
        amountMinor,
        currency: transaction.currencyCode,
      };
    }

    if (reference.startsWith('SUB-')) {
      const subscriptionId = reference.slice('SUB-'.length);
      const subscription = await tx.userSubscription.findUnique({ where: { id: subscriptionId } });
      if (!subscription) return null;
      const amountMinor = amountToMinorUnits(subscription.priceAtPurchase.toString(), payment.currencyData.minorUnits);
      if (amountMinor !== amountToMinorUnits(payment.amount.toString(), payment.currencyData.minorUnits)
        || payment.currency !== subscription.currencyCode) {
        throw new Error(`Stored ${providerCode} payment does not match the subscription purchase.`);
      }
      return {
        kind: 'SUBSCRIPTION',
        id: subscription.id,
        reference,
        providerReference: payment.providerReference,
        status: subscription.status,
        amountMinor,
        currency: subscription.currencyCode,
      };
    }

    if (reference.startsWith('FEATURED-')) {
      const listingId = reference.slice('FEATURED-'.length);
      const listing = await tx.featuredListing.findUnique({ where: { id: listingId } });
      if (!listing) return null;
      const amountMinor = amountToMinorUnits(listing.priceAtPurchase.toString(), payment.currencyData.minorUnits);
      if (amountMinor !== amountToMinorUnits(payment.amount.toString(), payment.currencyData.minorUnits)
        || payment.currency !== listing.currencyCode) {
        throw new Error(`Stored ${providerCode} payment does not match the featured-listing purchase.`);
      }
      return {
        kind: 'FEATURED_LISTING',
        id: listing.id,
        reference,
        providerReference: payment.providerReference,
        status: listing.status,
        amountMinor,
        currency: listing.currencyCode,
      };
    }

    return null;
  },

  async settlePurchase(tx, purchase, payment: VerifiedPayment) {
    const successful = payment.status === 'success';
    const abandoned = payment.status === 'abandoned';
    const paymentStatus = successful ? PaymentStatus.SUCCESSFUL : PaymentStatus.FAILED;
    const paymentRecord = await tx.payment.findUnique({ where: { reference: purchase.reference } });
    if (!paymentRecord || (paymentRecord.provider !== 'PAYSTACK' && paymentRecord.provider !== 'MOCK')) return;
    const providerCode = paymentRecord.provider;

    if (purchase.kind === 'TRANSACTION') {
      const financialTransaction = await tx.financialTransaction.findUnique({
        where: { id: purchase.id },
        select: { propertyId: true, transactionType: true },
      });
      let saleConflict = false;
      if (successful && financialTransaction?.transactionType === PaymentType.SALE && financialTransaction.propertyId) {
        await tx.$queryRaw`SELECT "id" FROM "Property" WHERE "id" = ${financialTransaction.propertyId} FOR UPDATE`;
        const property = await tx.property.findUnique({
          where: { id: financialTransaction.propertyId },
          select: { status: true },
        });
        const anotherSaleIsPaid = await tx.financialTransaction.count({
          where: {
            propertyId: financialTransaction.propertyId,
            id: { not: purchase.id },
            transactionType: PaymentType.SALE,
            status: FinancialTransactionStatus.PAID,
          },
        }).then((count) => count > 0);
        saleConflict = !canCompleteSale(property?.status ?? null, anotherSaleIsPaid);
        if (!saleConflict) {
          const propertyUpdate = await tx.property.updateMany({
            where: { id: financialTransaction.propertyId, status: PropertyStatus.PUBLISHED },
            data: { status: PropertyStatus.SOLD, publishedAt: null },
          });
          saleConflict = propertyUpdate.count !== 1;
        }
      }

      const status = successful
        ? saleConflict ? FinancialTransactionStatus.DISPUTED : FinancialTransactionStatus.PAID
        : abandoned
          ? FinancialTransactionStatus.CANCELLED
          : FinancialTransactionStatus.FAILED;
      const updated = await tx.financialTransaction.updateMany({
        where: { id: purchase.id, status: FinancialTransactionStatus.PENDING_PAYMENT },
        data: {
          status,
          paymentId: paymentRecord.id,
          ...(successful ? { paidAt: payment.paidAt ?? new Date() } : {}),
        },
      });
      if (updated.count !== 1) throw new Error('Financial transaction state changed during payment settlement.');
      if (saleConflict) {
        await tx.transactionDispute.upsert({
          where: { transactionId: purchase.id },
          create: {
            transactionId: purchase.id,
            reason: 'Payment succeeded after the sale listing became unavailable; administrator review is required.',
          },
          update: {},
        });
      }
      if (successful && !saleConflict && providerCode === 'PAYSTACK' && isPayoutsEnabled()) {
        await createPayoutRecordForPaidTransaction(tx, purchase.id, payment.paidAt ?? new Date());
      }
      await tx.payment.update({
        where: { id: paymentRecord.id },
        data: {
          status: paymentStatus,
          processorTransactionId: payment.transactionId,
          providerReference: payment.reference,
          ...(successful ? { paymentDate: payment.paidAt ?? new Date() } : {}),
        },
      });
      await tx.financialAuditLog.create({
        data: {
          actorId: paymentRecord.userId,
          action: FinancialAuditAction.FINANCIAL_STATUS_CHANGED,
          entityType: 'FinancialTransaction',
          entityId: purchase.id,
          before: { status: purchase.status },
          after: {
            status,
            paymentProvider: providerCode,
            providerReference: payment.reference,
            providerTransactionId: payment.transactionId,
          },
          reason: saleConflict
            ? `${providerCode} payment succeeded but the sale could not be completed because the listing was no longer available; the transaction was placed in dispute.`
            : `${providerCode} test-mode payment verification processed (${payment.status}).`,
        },
      });
      return;
    }

    let changed = false;
    if (purchase.kind === 'SUBSCRIPTION') {
      const subscription = await tx.userSubscription.findUniqueOrThrow({ where: { id: purchase.id } });
      if (subscription.status !== SubscriptionStatus.PENDING) return;
      const now = payment.paidAt ?? new Date();
      await tx.userSubscription.update({
        where: { id: purchase.id },
        data: successful
          ? {
              status: SubscriptionStatus.ACTIVE,
              startedAt: now,
              currentPeriodEnd: addBillingInterval(now, subscription.billingInterval),
              provider: providerCode,
              providerReference: payment.reference,
            }
          : { status: abandoned ? SubscriptionStatus.CANCELLED : SubscriptionStatus.FAILED },
      });
      changed = true;
    } else {
      const listing = await tx.featuredListing.findUnique({
        where: { id: purchase.id },
        include: { product: { select: { durationDays: true } } },
      });
      if (!listing || listing.status !== MonetizationOrderStatus.PENDING) return;
      const now = payment.paidAt ?? new Date();
      const expiresAt = successful && listing.product.durationDays
        ? new Date(now.getTime() + listing.product.durationDays * 24 * 60 * 60 * 1000)
        : null;
      await tx.featuredListing.update({
        where: { id: purchase.id },
        data: successful
          ? {
              status: MonetizationOrderStatus.PAID,
              startsAt: now,
              expiresAt,
              providerReference: payment.reference,
            }
          : { status: abandoned ? MonetizationOrderStatus.CANCELLED : MonetizationOrderStatus.FAILED },
      });
      changed = true;
    }

    if (!changed) return;
    await tx.payment.update({
      where: { id: paymentRecord.id },
      data: {
        status: paymentStatus,
        processorTransactionId: payment.transactionId,
        providerReference: payment.reference,
        ...(successful ? { paymentDate: payment.paidAt ?? new Date() } : {}),
      },
    });
    await tx.financialAuditLog.create({
      data: {
        actorId: paymentRecord.userId,
        action: FinancialAuditAction.FINANCIAL_STATUS_CHANGED,
        entityType: purchase.kind === 'SUBSCRIPTION' ? 'UserSubscription' : 'FeaturedListing',
        entityId: purchase.id,
        before: { status: purchase.status },
        after: {
          status: successful ? 'PAID' : abandoned ? 'CANCELLED' : 'FAILED',
          paymentProvider: providerCode,
          providerReference: payment.reference,
          providerTransactionId: payment.transactionId,
        },
        reason: `${providerCode} test-mode payment verification processed (${payment.status}).`,
      },
    });
  },
};

export function processPaystackPayment(payment: VerifiedPayment) {
  return processVerifiedPayment(payment, repository, 'PAYSTACK');
}

export function processMockPayment(payment: VerifiedPayment) {
  return processVerifiedPayment(payment, repository, 'MOCK');
}
