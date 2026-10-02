ALTER TABLE "Viewing"
ADD COLUMN "scheduledAt" TIMESTAMP(3);

CREATE INDEX "Viewing_propertyId_scheduledAt_status_idx"
ON "Viewing"("propertyId", "scheduledAt", "status");

CREATE UNIQUE INDEX "Viewing_active_property_scheduledAt_key"
ON "Viewing"("propertyId", "scheduledAt")
WHERE "scheduledAt" IS NOT NULL AND "status" IN ('REQUESTED', 'ACCEPTED', 'RESCHEDULED');
