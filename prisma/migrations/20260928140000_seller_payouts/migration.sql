CREATE TYPE "PayoutAccountStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'DISABLED');

CREATE TABLE "PayoutAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumberLast4" VARCHAR(4) NOT NULL,
    "accountNumberCipher" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'PAYSTACK',
    "recipientCode" TEXT,
    "status" "PayoutAccountStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayoutAccount_userId_key" ON "PayoutAccount"("userId");
CREATE UNIQUE INDEX "PayoutAccount_recipientCode_key" ON "PayoutAccount"("recipientCode");
CREATE INDEX "PayoutAccount_status_createdAt_idx" ON "PayoutAccount"("status", "createdAt");

ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "Payout_transactionId_idx";

ALTER TABLE "Payout"
    ADD COLUMN "payoutAccountId" TEXT,
    ADD COLUMN "transferCode" TEXT,
    ADD COLUMN "processorTransferId" TEXT,
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
    ADD COLUMN "nextRetryAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Payout_transactionId_key" ON "Payout"("transactionId");
CREATE UNIQUE INDEX "Payout_providerReference_key" ON "Payout"("providerReference");
CREATE UNIQUE INDEX "Payout_transferCode_key" ON "Payout"("transferCode");
CREATE UNIQUE INDEX "Payout_processorTransferId_key" ON "Payout"("processorTransferId");
CREATE INDEX "Payout_status_nextRetryAt_idx" ON "Payout"("status", "nextRetryAt");

ALTER TABLE "Payout" ADD CONSTRAINT "Payout_payoutAccountId_fkey" FOREIGN KEY ("payoutAccountId") REFERENCES "PayoutAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
