CREATE TYPE "VideoStatus" AS ENUM ('UPLOADING', 'PENDING', 'PROCESSING', 'READY', 'FAILED', 'DELETING');

ALTER TABLE "Video"
ADD COLUMN "status" "VideoStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN "sourceKey" TEXT,
ADD COLUMN "processingVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "processingAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "processingErrorCode" TEXT,
ADD COLUMN "processingErrorMessage" TEXT,
ADD COLUMN "queuedAt" TIMESTAMP(3),
ADD COLUMN "processingStartedAt" TIMESTAMP(3),
ADD COLUMN "processingCompletedAt" TIMESTAMP(3),
ADD COLUMN "processingWorkerVersion" TEXT;

CREATE INDEX "Video_status_createdAt_idx" ON "Video"("status", "createdAt");
CREATE INDEX "Video_uploaderId_status_idx" ON "Video"("uploaderId", "status");
