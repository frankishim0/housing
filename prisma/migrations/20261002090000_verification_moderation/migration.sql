-- CreateEnum
CREATE TYPE "ModerationAuditAction" AS ENUM ('USER_VERIFICATION_SUBMITTED', 'USER_VERIFICATION_APPROVED', 'USER_VERIFICATION_REJECTED', 'USER_VERIFICATION_INFO_REQUESTED', 'PROFESSIONAL_VERIFICATION_SUBMITTED', 'PROFESSIONAL_VERIFICATION_APPROVED', 'PROFESSIONAL_VERIFICATION_REJECTED', 'PROFESSIONAL_VERIFICATION_SUSPENDED', 'PROFESSIONAL_VERIFICATION_INFO_REQUESTED', 'PROPERTY_VERIFICATION_SUBMITTED', 'PROPERTY_VERIFICATION_APPROVED', 'PROPERTY_VERIFICATION_REJECTED', 'PROPERTY_VERIFICATION_INFO_REQUESTED', 'USER_SUSPENDED', 'USER_REINSTATED', 'REPORT_CREATED', 'REPORT_STATUS_CHANGED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.
ALTER TYPE "NotificationType" ADD VALUE 'VERIFICATION';
ALTER TYPE "NotificationType" ADD VALUE 'MODERATION';

-- AlterEnum
ALTER TYPE "UserVerificationStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "AgentProfile" ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable: existing Report rows (if any) default to the prior implicit meaning
-- (an open property/user report) so backfilled values are accurate, not placeholders.
ALTER TABLE "Report" ADD COLUMN     "adminNotes" TEXT,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT,
ADD COLUMN     "targetType" TEXT NOT NULL DEFAULT 'PROPERTY',
ADD COLUMN     "targetUserId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT,
ADD COLUMN     "verificationReviewedAt" TIMESTAMP(3),
ADD COLUMN     "verificationReviewedById" TEXT;

-- AlterTable
ALTER TABLE "Verification" ADD COLUMN     "documents" JSONB,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewerId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "ModerationAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "ModerationAuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationAuditLog_entityType_entityId_createdAt_idx" ON "ModerationAuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationAuditLog_actorId_createdAt_idx" ON "ModerationAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_targetUserId_idx" ON "Report"("targetUserId");

-- CreateIndex
CREATE INDEX "Report_messageId_idx" ON "Report"("messageId");

-- CreateIndex
CREATE INDEX "Report_targetType_status_idx" ON "Report"("targetType", "status");

-- CreateIndex
CREATE INDEX "Verification_type_status_idx" ON "Verification"("type", "status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_verificationReviewedById_fkey" FOREIGN KEY ("verificationReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAuditLog" ADD CONSTRAINT "ModerationAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prevent a user from having more than one active (PENDING) verification request of the
-- same type at once (e.g. two concurrent IDENTITY requests). Prisma's schema syntax does not
-- support partial/filtered unique indexes, so this is hand-written, mirroring the approach
-- already used for the viewing-scheduling partial unique index.
CREATE UNIQUE INDEX "Verification_active_user_type_key" ON "Verification"("userId", "type") WHERE "status" = 'PENDING' AND "propertyId" IS NULL;
CREATE UNIQUE INDEX "Verification_active_property_type_key" ON "Verification"("propertyId", "type") WHERE "status" = 'PENDING' AND "propertyId" IS NOT NULL;
