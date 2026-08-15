CREATE TYPE "RecordingPolicy" AS ENUM ('NONE', 'AUTO');

CREATE TYPE "RecordingStatus" AS ENUM ('RECORDING', 'READY', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DISCARDED');

CREATE TYPE "RecordingJobStatus" AS ENUM ('STARTING', 'ACTIVE', 'ENDING', 'COMPLETED', 'FAILED', 'ABORTED');

ALTER TABLE "LiveStream"
ADD COLUMN "recordingPolicy" "RecordingPolicy" NOT NULL DEFAULT 'NONE';

CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "status" "RecordingStatus" NOT NULL DEFAULT 'RECORDING',
    "objectKey" TEXT,
    "sizeBytes" BIGINT,
    "durationSeconds" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "discardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "streamId" TEXT NOT NULL,
    "publishedVideoId" TEXT,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecordingJob" (
    "id" TEXT NOT NULL,
    "status" "RecordingJobStatus" NOT NULL DEFAULT 'STARTING',
    "providerEgressId" TEXT,
    "outputKey" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "streamId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,

    CONSTRAINT "RecordingJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Recording_objectKey_key" ON "Recording"("objectKey");
CREATE UNIQUE INDEX "Recording_publishedVideoId_key" ON "Recording"("publishedVideoId");
CREATE INDEX "Recording_streamId_status_idx" ON "Recording"("streamId", "status");
CREATE INDEX "Recording_status_createdAt_idx" ON "Recording"("status", "createdAt");

CREATE UNIQUE INDEX "RecordingJob_providerEgressId_key" ON "RecordingJob"("providerEgressId");
CREATE INDEX "RecordingJob_streamId_status_idx" ON "RecordingJob"("streamId", "status");
CREATE INDEX "RecordingJob_recordingId_status_idx" ON "RecordingJob"("recordingId", "status");

ALTER TABLE "Recording"
ADD CONSTRAINT "Recording_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "LiveStream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Recording"
ADD CONSTRAINT "Recording_publishedVideoId_fkey" FOREIGN KEY ("publishedVideoId") REFERENCES "Video"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecordingJob"
ADD CONSTRAINT "RecordingJob_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "LiveStream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecordingJob"
ADD CONSTRAINT "RecordingJob_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;
