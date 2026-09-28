import { CommissionPayer } from '@prisma/client';

const MONEY_SCALE = BigInt(10_000);

export interface CommissionInputs {
  amount: string;
  percentageRate: string;
  fixedFee: string;
  processingFeeRate: string;
  processingFeeFixed: string;
  payer: CommissionPayer;
  minorUnits: number;
}

export interface CommissionBreakdown {
  amount: string;
  platformCommission: string;
  buyerPlatformFee: string;
  sellerCommission: string;
  paymentProcessingFee: string;
  totalBuyerDue: string;
  sellerAmount: string;
  finalPayout: string;
}

export function normalizeMoneyAmount(value: string, minorUnits: number) {
  return toDecimal(roundToMinorUnits(toScaled(value), minorUnits));
}

function toScaled(value: string) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error('Financial values must be non-negative decimal amounts.');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > 4) throw new Error('Financial values may use at most four decimal places.');
  return BigInt(whole) * MONEY_SCALE + BigInt(fraction.padEnd(4, '0') || '0');
}

function roundDiv(numerator: bigint, denominator: bigint) {
  return (numerator + denominator / BigInt(2)) / denominator;
}

function roundToMinorUnits(value: bigint, minorUnits: number) {
  if (!Number.isInteger(minorUnits) || minorUnits < 0 || minorUnits > 4) {
    throw new Error('Currency minor units must be between zero and four.');
  }
  const increment = BigInt(10) ** BigInt(4 - minorUnits);
  return roundDiv(value, increment) * increment;
}

function toDecimal(value: bigint) {
  const rounded = value.toString().padStart(5, '0');
  const whole = rounded.slice(0, -4);
  const fraction = rounded.slice(-4);
  return `${whole}.${fraction}`;
}

export function calculateCommission(input: CommissionInputs): CommissionBreakdown {
  const amount = roundToMinorUnits(toScaled(input.amount), input.minorUnits);
  const rate = toScaled(input.percentageRate);
  const fixed = roundToMinorUnits(toScaled(input.fixedFee), input.minorUnits);
  const processingRate = toScaled(input.processingFeeRate);
  const processingFixed = roundToMinorUnits(toScaled(input.processingFeeFixed), input.minorUnits);
  if (amount <= BigInt(0)) throw new Error('Transaction amount must be positive.');

  const platformCommission = roundToMinorUnits(
    roundDiv(amount * rate, BigInt(100) * MONEY_SCALE) + fixed,
    input.minorUnits,
  );
  const paymentProcessingFee = roundToMinorUnits(
    roundDiv(amount * processingRate, BigInt(100) * MONEY_SCALE) + processingFixed,
    input.minorUnits,
  );

  const buyerPlatformFee = input.payer === CommissionPayer.BUYER
    ? platformCommission
    : input.payer === CommissionPayer.SHARED
      ? roundToMinorUnits(roundDiv(platformCommission, BigInt(2)), input.minorUnits)
      : BigInt(0);
  const sellerCommission = platformCommission - buyerPlatformFee;
  const sellerAmount = amount - sellerCommission;
  const finalPayout = sellerAmount - paymentProcessingFee;
  if (sellerAmount < BigInt(0) || finalPayout < BigInt(0)) {
    throw new Error('Configured commission and processing fees exceed the seller proceeds.');
  }

  return {
    amount: toDecimal(amount),
    platformCommission: toDecimal(platformCommission),
    buyerPlatformFee: toDecimal(buyerPlatformFee),
    sellerCommission: toDecimal(sellerCommission),
    paymentProcessingFee: toDecimal(paymentProcessingFee),
    totalBuyerDue: toDecimal(amount + buyerPlatformFee),
    sellerAmount: toDecimal(sellerAmount),
    finalPayout: toDecimal(finalPayout),
  };
}
