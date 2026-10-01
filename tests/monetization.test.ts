import assert from 'node:assert/strict';
import { CommissionPayer } from '@prisma/client';
import { calculateCommission } from '../lib/monetization';

const buyerPaid = calculateCommission({
  amount: '1000',
  percentageRate: '5',
  fixedFee: '10',
  processingFeeRate: '2',
  processingFeeFixed: '3',
  payer: CommissionPayer.BUYER,
  minorUnits: 2,
});

assert.deepEqual(buyerPaid, {
  amount: '1000.0000',
  platformCommission: '60.0000',
  buyerPlatformFee: '60.0000',
  sellerCommission: '0.0000',
  paymentProcessingFee: '23.0000',
  totalBuyerDue: '1060.0000',
  sellerAmount: '1000.0000',
  finalPayout: '977.0000',
});

const shared = calculateCommission({
  amount: '10',
  percentageRate: '5',
  fixedFee: '0',
  processingFeeRate: '0',
  processingFeeFixed: '0',
  payer: CommissionPayer.SHARED,
  minorUnits: 2,
});
assert.equal(shared.platformCommission, '0.5000');
assert.equal(shared.buyerPlatformFee, '0.2500');
assert.equal(shared.sellerCommission, '0.2500');
assert.equal(shared.totalBuyerDue, '10.2500');

const defaultPropertyTransaction = calculateCommission({
  amount: '6500000',
  percentageRate: '2',
  fixedFee: '0',
  processingFeeRate: '0',
  processingFeeFixed: '0',
  payer: CommissionPayer.BUYER,
  minorUnits: 2,
});
assert.deepEqual(defaultPropertyTransaction, {
  amount: '6500000.0000',
  platformCommission: '130000.0000',
  buyerPlatformFee: '130000.0000',
  sellerCommission: '0.0000',
  paymentProcessingFee: '0.0000',
  totalBuyerDue: '6630000.0000',
  sellerAmount: '6500000.0000',
  finalPayout: '6500000.0000',
});

const zeroDecimalCurrency = calculateCommission({
  amount: '10.49',
  percentageRate: '0',
  fixedFee: '0',
  processingFeeRate: '0',
  processingFeeFixed: '0',
  payer: CommissionPayer.SELLER,
  minorUnits: 0,
});
assert.equal(zeroDecimalCurrency.amount, '10.0000');

assert.throws(() => calculateCommission({
  amount: '10',
  percentageRate: '100',
  fixedFee: '1',
  processingFeeRate: '0',
  processingFeeFixed: '0',
  payer: CommissionPayer.SELLER,
  minorUnits: 2,
}), /exceed the seller proceeds/);

console.log('Monetization calculation tests passed.');
