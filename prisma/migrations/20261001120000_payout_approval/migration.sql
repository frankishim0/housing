ALTER TABLE "Payout"
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" TEXT;

CREATE INDEX "Payout_status_approvedAt_idx" ON "Payout"("status", "approvedAt");

ALTER TABLE "Payout"
ADD CONSTRAINT "Payout_approvedById_fkey"
FOREIGN KEY ("approvedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
