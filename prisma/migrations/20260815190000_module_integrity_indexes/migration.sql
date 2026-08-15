CREATE TYPE "StreamStatus" AS ENUM ('DRAFT', 'STARTING', 'LIVE', 'ENDING', 'ENDED', 'FAILED');

-- Repoint content to one canonical module per exact name/year group before
-- enforcing the database constraint. The lowest id is deterministic and keeps
-- the migration safe to review from a backup.
WITH canonical_modules AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (PARTITION BY "name", "yearGroup" ORDER BY "id") AS "canonicalId"
  FROM "Module"
)
UPDATE "Video" AS "video"
SET "moduleId" = canonical_modules."canonicalId"
FROM canonical_modules
WHERE "video"."moduleId" = canonical_modules."id"
  AND canonical_modules."id" <> canonical_modules."canonicalId";

WITH canonical_modules AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (PARTITION BY "name", "yearGroup" ORDER BY "id") AS "canonicalId"
  FROM "Module"
)
UPDATE "LiveStream" AS "stream"
SET "moduleId" = canonical_modules."canonicalId"
FROM canonical_modules
WHERE "stream"."moduleId" = canonical_modules."id"
  AND canonical_modules."id" <> canonical_modules."canonicalId";

WITH canonical_modules AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (PARTITION BY "name", "yearGroup" ORDER BY "id") AS "canonicalId"
  FROM "Module"
)
UPDATE "UploadSession" AS "session"
SET "moduleId" = canonical_modules."canonicalId"
FROM canonical_modules
WHERE "session"."moduleId" = canonical_modules."id"
  AND canonical_modules."id" <> canonical_modules."canonicalId";

WITH duplicate_modules AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (PARTITION BY "name", "yearGroup" ORDER BY "id") AS "canonicalId"
  FROM "Module"
)
DELETE FROM "Module" AS "module"
USING duplicate_modules
WHERE "module"."id" = duplicate_modules."id"
  AND duplicate_modules."id" <> duplicate_modules."canonicalId";

ALTER TABLE "User"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Module"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Video"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "LiveStream"
ADD COLUMN "status" "StreamStatus" NOT NULL DEFAULT 'ENDED',
ADD COLUMN "providerRoomId" TEXT,
ADD COLUMN "participantCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastProviderEventAt" TIMESTAMP(3),
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "LiveStream"
SET "status" = CASE WHEN "isLive" THEN 'LIVE'::"StreamStatus" ELSE 'ENDED'::"StreamStatus" END,
    "startedAt" = CASE WHEN "isLive" AND "startedAt" IS NULL THEN CURRENT_TIMESTAMP ELSE "startedAt" END,
    "endedAt" = CASE WHEN NOT "isLive" AND "endedAt" IS NULL THEN CURRENT_TIMESTAMP ELSE "endedAt" END;

ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Module" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Video" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "LiveStream" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE UNIQUE INDEX "Module_name_yearGroup_key" ON "Module"("name", "yearGroup");
CREATE INDEX "Module_yearGroup_name_idx" ON "Module"("yearGroup", "name");

CREATE INDEX "Video_isPublic_status_createdAt_idx" ON "Video"("isPublic", "status", "createdAt");
CREATE INDEX "Video_type_status_createdAt_idx" ON "Video"("type", "status", "createdAt");
CREATE INDEX "Video_moduleId_status_createdAt_idx" ON "Video"("moduleId", "status", "createdAt");
CREATE INDEX "Video_uploaderId_createdAt_idx" ON "Video"("uploaderId", "createdAt");

CREATE INDEX "UploadSession_moduleId_state_createdAt_idx" ON "UploadSession"("moduleId", "state", "createdAt");

CREATE INDEX "LiveStream_isLive_isPublic_startedAt_idx" ON "LiveStream"("isLive", "isPublic", "startedAt");
CREATE INDEX "LiveStream_status_startedAt_idx" ON "LiveStream"("status", "startedAt");
CREATE INDEX "LiveStream_moduleId_isLive_startedAt_idx" ON "LiveStream"("moduleId", "isLive", "startedAt");
CREATE INDEX "LiveStream_hostId_isLive_startedAt_idx" ON "LiveStream"("hostId", "isLive", "startedAt");
