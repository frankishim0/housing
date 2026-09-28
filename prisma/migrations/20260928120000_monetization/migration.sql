-- CreateEnum
CREATE TYPE "CommissionPayer" AS ENUM ('SELLER', 'BUYER', 'SHARED');

-- CreateEnum
CREATE TYPE "FinancialTransactionStatus" AS ENUM ('QUOTED', 'PENDING_PAYMENT', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('NOT_DUE', 'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'HELD');

-- CreateEnum
CREATE TYPE "MonetizationProductType" AS ENUM ('SUBSCRIPTION', 'FEATURED_LISTING', 'QUALIFIED_LEAD');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('ONE_TIME', 'MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MonetizationOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialAuditAction" AS ENUM ('COMMISSION_RULE_CREATED', 'COMMISSION_RULE_UPDATED', 'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'FINANCIAL_STATUS_CHANGED', 'REFUND_RECORDED', 'DISPUTE_UPDATED', 'PAYOUT_UPDATED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentType" ADD VALUE 'SALE';
ALTER TYPE "PaymentType" ADD VALUE 'LEASE';
ALTER TYPE "PaymentType" ADD VALUE 'SHORT_TERM_RENT';

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "transactionType" "PaymentType",
    "countryCode" VARCHAR(2),
    "propertyTypeCode" TEXT,
    "currencyCode" VARCHAR(3),
    "percentageRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "fixedFee" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "processingFeeRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "processingFeeFixed" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "payer" "CommissionPayer" NOT NULL DEFAULT 'SELLER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "agentId" TEXT,
    "propertyId" TEXT,
    "paymentId" TEXT,
    "commissionRuleId" TEXT,
    "transactionType" "PaymentType" NOT NULL,
    "status" "FinancialTransactionStatus" NOT NULL DEFAULT 'QUOTED',
    "amount" DECIMAL(14,4) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "countryCode" VARCHAR(2),
    "commissionPayer" "CommissionPayer" NOT NULL DEFAULT 'SELLER',
    "commissionRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "commissionFixedFee" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "platformCommission" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "buyerPlatformFee" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "sellerCommission" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "processingFeeRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "processingFeeFixed" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "paymentProcessingFee" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "totalBuyerDue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "sellerAmount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "finalPayout" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'NOT_DUE',
    "payoutDueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "providerReference" TEXT,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionRefund" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "MonetizationOrderStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TransactionRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionDispute" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "providerReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "TransactionDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonetizationProduct" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "MonetizationProductType" NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL DEFAULT 'ONE_TIME',
    "price" DECIMAL(14,4) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "durationDays" INTEGER,
    "listingLimit" INTEGER,
    "features" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonetizationProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "billingInterval" "BillingInterval" NOT NULL,
    "priceAtPurchase" DECIMAL(14,4) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "provider" TEXT,
    "providerReference" TEXT,
    "startedAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeaturedListing" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "purchaserId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "MonetizationOrderStatus" NOT NULL DEFAULT 'PENDING',
    "priceAtPurchase" DECIMAL(14,4) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "providerReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeaturedListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadPurchase" (
    "id" TEXT NOT NULL,
    "purchaserId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "status" "MonetizationOrderStatus" NOT NULL DEFAULT 'PENDING',
    "priceAtPurchase" DECIMAL(14,4) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "providerReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "FinancialAuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionRule_active_transactionType_countryCode_propertyT_idx" ON "CommissionRule"("active", "transactionType", "countryCode", "propertyTypeCode", "currencyCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_reference_key" ON "FinancialTransaction"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_paymentId_key" ON "FinancialTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_buyerId_createdAt_idx" ON "FinancialTransaction"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_sellerId_payoutStatus_createdAt_idx" ON "FinancialTransaction"("sellerId", "payoutStatus", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_agentId_payoutStatus_createdAt_idx" ON "FinancialTransaction"("agentId", "payoutStatus", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_propertyId_createdAt_idx" ON "FinancialTransaction"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_status_currencyCode_createdAt_idx" ON "FinancialTransaction"("status", "currencyCode", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_paidAt_currencyCode_idx" ON "FinancialTransaction"("paidAt", "currencyCode");

-- CreateIndex
CREATE INDEX "Payout_recipientId_status_requestedAt_idx" ON "Payout"("recipientId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "Payout_transactionId_idx" ON "Payout"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionRefund_transactionId_status_createdAt_idx" ON "TransactionRefund"("transactionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TransactionDispute_status_createdAt_idx" ON "TransactionDispute"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionDispute_transactionId_key" ON "TransactionDispute"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "MonetizationProduct_code_key" ON "MonetizationProduct"("code");

-- CreateIndex
CREATE INDEX "MonetizationProduct_type_active_currencyCode_idx" ON "MonetizationProduct"("type", "active", "currencyCode");

-- CreateIndex
CREATE INDEX "UserSubscription_userId_status_currentPeriodEnd_idx" ON "UserSubscription"("userId", "status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "FeaturedListing_propertyId_status_expiresAt_idx" ON "FeaturedListing"("propertyId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "FeaturedListing_purchaserId_status_createdAt_idx" ON "FeaturedListing"("purchaserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LeadPurchase_purchaserId_status_createdAt_idx" ON "LeadPurchase"("purchaserId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadPurchase_purchaserId_enquiryId_key" ON "LeadPurchase"("purchaserId", "enquiryId");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_entityType_entityId_createdAt_idx" ON "FinancialAuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_actorId_createdAt_idx" ON "FinancialAuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_commissionRuleId_fkey" FOREIGN KEY ("commissionRuleId") REFERENCES "CommissionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRefund" ADD CONSTRAINT "TransactionRefund_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRefund" ADD CONSTRAINT "TransactionRefund_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRefund" ADD CONSTRAINT "TransactionRefund_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionDispute" ADD CONSTRAINT "TransactionDispute_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetizationProduct" ADD CONSTRAINT "MonetizationProduct_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MonetizationProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedListing" ADD CONSTRAINT "FeaturedListing_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedListing" ADD CONSTRAINT "FeaturedListing_purchaserId_fkey" FOREIGN KEY ("purchaserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedListing" ADD CONSTRAINT "FeaturedListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MonetizationProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadPurchase" ADD CONSTRAINT "LeadPurchase_purchaserId_fkey" FOREIGN KEY ("purchaserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadPurchase" ADD CONSTRAINT "LeadPurchase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MonetizationProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadPurchase" ADD CONSTRAINT "LeadPurchase_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAuditLog" ADD CONSTRAINT "FinancialAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
