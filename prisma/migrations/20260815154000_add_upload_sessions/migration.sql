CREATE TYPE "UploadSessionState" AS ENUM ('INITIATED', 'UPLOADING', 'COMPLETED', 'ABORTED', 'EXPIRED');

CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "VideoType" NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "originalFileName" TEXT,
    "objectKey" TEXT NOT NULL,
    "expectedSize" BIGINT NOT NULL,
    "expectedPartSize" INTEGER NOT NULL,
    "expectedType" TEXT NOT NULL,
    "checksum" TEXT,
    "multipartUploadId" TEXT NOT NULL,
    "state" "UploadSessionState" NOT NULL DEFAULT 'INITIATED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "videoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "moduleId" TEXT,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UploadSession_objectKey_key" ON "UploadSession"("objectKey");
CREATE UNIQUE INDEX "UploadSession_videoId_key" ON "UploadSession"("videoId");
CREATE INDEX "UploadSession_ownerId_state_expiresAt_idx" ON "UploadSession"("ownerId", "state", "expiresAt");

ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;
