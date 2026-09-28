ALTER TYPE "MediaType" ADD VALUE IF NOT EXISTS 'DOCUMENT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CALL';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LIVE_TOUR';

CREATE TYPE "CallType" AS ENUM ('VIDEO_CALL', 'LIVE_TOUR');
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'ACTIVE', 'ENDED', 'DECLINED', 'MISSED', 'CANCELLED');

ALTER TABLE "PropertyMedia"
    ADD COLUMN "fileName" TEXT,
    ADD COLUMN "mimeType" TEXT,
    ADD COLUMN "size" INTEGER,
    ADD COLUMN "publicId" TEXT,
    ADD COLUMN "resourceType" TEXT;

ALTER TABLE "MessageAttachment" ADD COLUMN "publicId" TEXT;
ALTER TABLE "Property" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "type" "CallType" NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CallSession_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CallSession_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CallParticipant" (
    "callId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    CONSTRAINT "CallParticipant_pkey" PRIMARY KEY ("callId", "userId"),
    CONSTRAINT "CallParticipant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CallParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CallChatMessage" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallChatMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CallChatMessage_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CallChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CallSession_roomName_key" ON "CallSession"("roomName");
CREATE INDEX "CallSession_propertyId_status_createdAt_idx" ON "CallSession"("propertyId", "status", "createdAt");
CREATE INDEX "CallSession_initiatorId_createdAt_idx" ON "CallSession"("initiatorId", "createdAt");
CREATE INDEX "CallParticipant_userId_status_idx" ON "CallParticipant"("userId", "status");
CREATE INDEX "CallChatMessage_callId_createdAt_idx" ON "CallChatMessage"("callId", "createdAt");
CREATE INDEX "Property_ownerId_viewCount_idx" ON "Property"("ownerId", "viewCount");
