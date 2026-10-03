-- Adds the ARCHIVED listing status and the listing-review audit actions.
-- IF NOT EXISTS keeps this safe on databases already synced with `db push`.
ALTER TYPE "PropertyStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
ALTER TYPE "ModerationAuditAction" ADD VALUE IF NOT EXISTS 'PROPERTY_REVIEW_SUBMITTED';
ALTER TYPE "ModerationAuditAction" ADD VALUE IF NOT EXISTS 'PROPERTY_REVIEW_REJECTED';