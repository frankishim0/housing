ALTER TYPE "SubscriptionStatus" ADD VALUE 'FAILED';

ALTER TABLE "Payment"
    ALTER COLUMN "amount" TYPE DECIMAL(14,4),
    ADD COLUMN "processorTransactionId" TEXT;

CREATE UNIQUE INDEX "Payment_processorTransactionId_key"
    ON "Payment"("processorTransactionId");

CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeWebhookEvent_eventId_key"
    ON "StripeWebhookEvent"("eventId");

CREATE INDEX "StripeWebhookEvent_eventType_processedAt_idx"
    ON "StripeWebhookEvent"("eventType", "processedAt");
