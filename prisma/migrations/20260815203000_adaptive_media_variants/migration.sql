CREATE TYPE "ThumbnailStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'SKIPPED');

CREATE TYPE "VideoVariantStatus" AS ENUM ('READY', 'FAILED');

CREATE TYPE "MediaAssetType" AS ENUM ('SOURCE', 'HLS_MASTER', 'HLS_VARIANT_PLAYLIST', 'HLS_SEGMENT', 'THUMBNAIL', 'CAPTION');

CREATE TYPE "MediaAssetStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

ALTER TABLE "Video"
ADD COLUMN "durationSeconds" DOUBLE PRECISION,
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER,
ADD COLUMN "videoCodec" TEXT,
ADD COLUMN "audioCodec" TEXT,
ADD COLUMN "container" TEXT,
ADD COLUMN "bitrate" INTEGER,
ADD COLUMN "sourceSizeBytes" BIGINT,
ADD COLUMN "sourceChecksumSha256" TEXT,
ADD COLUMN "sourceContentType" TEXT,
ADD COLUMN "thumbnailStatus" "ThumbnailStatus" NOT NULL DEFAULT 'PENDING';

CREATE TABLE "VideoVariant" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bitrate" INTEGER NOT NULL,
    "codec" TEXT NOT NULL,
    "playlistKey" TEXT NOT NULL,
    "status" "VideoVariantStatus" NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "videoId" TEXT NOT NULL,

    CONSTRAINT "VideoVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "type" "MediaAssetType" NOT NULL,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'READY',
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "language" TEXT,
    "label" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "videoId" TEXT NOT NULL,
    "variantId" TEXT,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoVariant_playlistKey_key" ON "VideoVariant"("playlistKey");
CREATE UNIQUE INDEX "VideoVariant_videoId_label_key" ON "VideoVariant"("videoId", "label");
CREATE INDEX "VideoVariant_videoId_height_idx" ON "VideoVariant"("videoId", "height");

CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");
CREATE INDEX "MediaAsset_videoId_type_status_idx" ON "MediaAsset"("videoId", "type", "status");
CREATE INDEX "MediaAsset_variantId_type_idx" ON "MediaAsset"("variantId", "type");
CREATE INDEX "MediaAsset_type_status_idx" ON "MediaAsset"("type", "status");

ALTER TABLE "VideoVariant"
ADD CONSTRAINT "VideoVariant_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaAsset"
ADD CONSTRAINT "MediaAsset_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaAsset"
ADD CONSTRAINT "MediaAsset_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "VideoVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
