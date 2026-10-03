import assert from 'node:assert/strict';
import { FinancialTransactionStatus, PaymentType, PropertyStatus } from '@prisma/client';
import { canCompleteSale, canStartSaleCheckout, canTransitionDispute, isExclusivePropertyTransaction } from '../lib/transaction-lifecycle';

assert.equal(isExclusivePropertyTransaction(PaymentType.SALE), true);
assert.equal(isExclusivePropertyTransaction(PaymentType.RENT), false);
assert.equal(isExclusivePropertyTransaction(PaymentType.LEASE), false);

assert.equal(canStartSaleCheckout(PaymentType.SALE, PropertyStatus.PUBLISHED, null), true);
assert.equal(canStartSaleCheckout(PaymentType.SALE, PropertyStatus.PUBLISHED, FinancialTransactionStatus.PENDING_PAYMENT), false);
assert.equal(canStartSaleCheckout(PaymentType.SALE, PropertyStatus.PUBLISHED, FinancialTransactionStatus.PAID), false);
assert.equal(canStartSaleCheckout(PaymentType.SALE, PropertyStatus.PUBLISHED, FinancialTransactionStatus.DISPUTED), false);
assert.equal(canStartSaleCheckout(PaymentType.SALE, PropertyStatus.SOLD, null), false);
assert.equal(canStartSaleCheckout(PaymentType.SALE, PropertyStatus.PUBLISHED, FinancialTransactionStatus.FAILED), true);
assert.equal(canStartSaleCheckout(PaymentType.SALE, PropertyStatus.PUBLISHED, FinancialTransactionStatus.CANCELLED), true);

assert.equal(canStartSaleCheckout(PaymentType.RENT, PropertyStatus.PUBLISHED, FinancialTransactionStatus.PENDING_PAYMENT), true);
assert.equal(canStartSaleCheckout(PaymentType.LEASE, PropertyStatus.PUBLISHED, FinancialTransactionStatus.PAID), true);

assert.equal(canCompleteSale(PropertyStatus.PUBLISHED, false), true);
assert.equal(canCompleteSale(PropertyStatus.PUBLISHED, true), false);
assert.equal(canCompleteSale(PropertyStatus.SOLD, false), false);
assert.equal(canCompleteSale(null, false), false);

assert.equal(canTransitionDispute('OPEN', 'UNDER_REVIEW'), true);
assert.equal(canTransitionDispute('UNDER_REVIEW', 'RESOLVED'), true);
assert.equal(canTransitionDispute('OPEN', 'REJECTED'), true);
assert.equal(canTransitionDispute('RESOLVED', 'OPEN'), false);
assert.equal(canTransitionDispute('REJECTED', 'UNDER_REVIEW'), false);

console.log('Transaction lifecycle exclusivity tests passed.');
