import { FinancialTransactionStatus, PaymentType, PropertyStatus } from '@prisma/client';

export function isExclusivePropertyTransaction(type: PaymentType) {
  return type === PaymentType.SALE;
}

export function canStartSaleCheckout(
  type: PaymentType,
  propertyStatus: PropertyStatus,
  otherSaleStatus: FinancialTransactionStatus | null,
) {
  if (!isExclusivePropertyTransaction(type)) return true;
  return propertyStatus === PropertyStatus.PUBLISHED
    && otherSaleStatus !== FinancialTransactionStatus.PENDING_PAYMENT
    && otherSaleStatus !== FinancialTransactionStatus.PAID
    && otherSaleStatus !== FinancialTransactionStatus.DISPUTED;
}

export function canCompleteSale(
  propertyStatus: PropertyStatus | null,
  anotherSaleIsPaid: boolean,
) {
  return propertyStatus === PropertyStatus.PUBLISHED && !anotherSaleIsPaid;
}

const DISPUTE_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
  UNDER_REVIEW: ['RESOLVED', 'REJECTED'],
  RESOLVED: [],
  REJECTED: [],
};

export function canTransitionDispute(current: string, next: string) {
  return current === next || (DISPUTE_TRANSITIONS[current] ?? []).includes(next);
}
