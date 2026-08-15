CREATE TYPE "ProvisioningStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TYPE "AudienceType" AS ENUM ('PUBLIC', 'ESI', 'COHORT', 'MODULE', 'SELECTED_USERS');

ALTER TABLE "User"
ADD COLUMN "provisioningStatus" "ProvisioningStatus" NOT NULL DEFAULT 'APPROVED';

CREATE TABLE "Cohort" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yearGroup" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cohort_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CohortMembership" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,

    CONSTRAINT "CohortMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentModuleEnrollment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,

    CONSTRAINT "StudentModuleEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeacherModuleAssignment" (
    "id" TEXT NOT NULL,
    "canPublish" BOOLEAN NOT NULL DEFAULT true,
    "canManage" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,

    CONSTRAINT "TeacherModuleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoAudienceUser" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "videoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "VideoAudienceUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiveStreamAudienceUser" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liveStreamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "LiveStreamAudienceUser_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Video"
ADD COLUMN "audience" "AudienceType" NOT NULL DEFAULT 'ESI',
ADD COLUMN "cohortId" TEXT;

UPDATE "Video"
SET "audience" = CASE
    WHEN "isPublic" = true THEN 'PUBLIC'::"AudienceType"
    WHEN "moduleId" IS NOT NULL THEN 'MODULE'::"AudienceType"
    ELSE 'ESI'::"AudienceType"
END;

ALTER TABLE "UploadSession"
ADD COLUMN "audience" "AudienceType" NOT NULL DEFAULT 'ESI',
ADD COLUMN "cohortId" TEXT;

UPDATE "UploadSession"
SET "audience" = CASE
    WHEN "isPublic" = true THEN 'PUBLIC'::"AudienceType"
    WHEN "moduleId" IS NOT NULL THEN 'MODULE'::"AudienceType"
    ELSE 'ESI'::"AudienceType"
END;

ALTER TABLE "LiveStream"
ADD COLUMN "audience" "AudienceType" NOT NULL DEFAULT 'ESI',
ADD COLUMN "cohortId" TEXT;

UPDATE "LiveStream"
SET "audience" = CASE
    WHEN "isPublic" = true THEN 'PUBLIC'::"AudienceType"
    WHEN "moduleId" IS NOT NULL THEN 'MODULE'::"AudienceType"
    ELSE 'ESI'::"AudienceType"
END;

INSERT INTO "Cohort" ("id", "name", "yearGroup", "createdAt", "updatedAt")
SELECT
    'cohort-' || md5("yearGroup") AS "id",
    "yearGroup" AS "name",
    "yearGroup",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "yearGroup"
    FROM "User"
    WHERE "yearGroup" IS NOT NULL AND trim("yearGroup") <> ''
) AS "legacyYearGroups";

INSERT INTO "CohortMembership" ("id", "userId", "cohortId", "createdAt")
SELECT
    'cohort-member-' || md5("User"."id" || ':' || "User"."yearGroup") AS "id",
    "User"."id",
    "Cohort"."id",
    CURRENT_TIMESTAMP
FROM "User"
JOIN "Cohort" ON "Cohort"."yearGroup" = "User"."yearGroup"
WHERE "User"."role" = 'STUDENT' AND "User"."yearGroup" IS NOT NULL AND trim("User"."yearGroup") <> '';

INSERT INTO "StudentModuleEnrollment" ("id", "userId", "moduleId", "createdAt")
SELECT
    'student-module-' || md5("User"."id" || ':' || "Module"."id") AS "id",
    "User"."id",
    "Module"."id",
    CURRENT_TIMESTAMP
FROM "User"
JOIN "Module" ON "Module"."yearGroup" = "User"."yearGroup"
WHERE "User"."role" = 'STUDENT' AND "User"."yearGroup" IS NOT NULL AND trim("User"."yearGroup") <> '';

CREATE UNIQUE INDEX "Cohort_name_key" ON "Cohort"("name");
CREATE INDEX "Cohort_yearGroup_name_idx" ON "Cohort"("yearGroup", "name");

CREATE UNIQUE INDEX "CohortMembership_userId_cohortId_key" ON "CohortMembership"("userId", "cohortId");
CREATE INDEX "CohortMembership_cohortId_userId_idx" ON "CohortMembership"("cohortId", "userId");

CREATE UNIQUE INDEX "StudentModuleEnrollment_userId_moduleId_key" ON "StudentModuleEnrollment"("userId", "moduleId");
CREATE INDEX "StudentModuleEnrollment_moduleId_userId_idx" ON "StudentModuleEnrollment"("moduleId", "userId");

CREATE UNIQUE INDEX "TeacherModuleAssignment_userId_moduleId_key" ON "TeacherModuleAssignment"("userId", "moduleId");
CREATE INDEX "TeacherModuleAssignment_moduleId_userId_idx" ON "TeacherModuleAssignment"("moduleId", "userId");

CREATE UNIQUE INDEX "VideoAudienceUser_videoId_userId_key" ON "VideoAudienceUser"("videoId", "userId");
CREATE INDEX "VideoAudienceUser_userId_idx" ON "VideoAudienceUser"("userId");

CREATE UNIQUE INDEX "LiveStreamAudienceUser_liveStreamId_userId_key" ON "LiveStreamAudienceUser"("liveStreamId", "userId");
CREATE INDEX "LiveStreamAudienceUser_userId_idx" ON "LiveStreamAudienceUser"("userId");

CREATE INDEX "Video_audience_status_createdAt_idx" ON "Video"("audience", "status", "createdAt");
CREATE INDEX "Video_cohortId_status_createdAt_idx" ON "Video"("cohortId", "status", "createdAt");
CREATE INDEX "UploadSession_cohortId_state_createdAt_idx" ON "UploadSession"("cohortId", "state", "createdAt");
CREATE INDEX "LiveStream_audience_isLive_startedAt_idx" ON "LiveStream"("audience", "isLive", "startedAt");
CREATE INDEX "LiveStream_cohortId_isLive_startedAt_idx" ON "LiveStream"("cohortId", "isLive", "startedAt");

ALTER TABLE "Video"
ADD CONSTRAINT "Video_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UploadSession"
ADD CONSTRAINT "UploadSession_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LiveStream"
ADD CONSTRAINT "LiveStream_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CohortMembership"
ADD CONSTRAINT "CohortMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CohortMembership"
ADD CONSTRAINT "CohortMembership_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentModuleEnrollment"
ADD CONSTRAINT "StudentModuleEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentModuleEnrollment"
ADD CONSTRAINT "StudentModuleEnrollment_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeacherModuleAssignment"
ADD CONSTRAINT "TeacherModuleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeacherModuleAssignment"
ADD CONSTRAINT "TeacherModuleAssignment_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoAudienceUser"
ADD CONSTRAINT "VideoAudienceUser_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoAudienceUser"
ADD CONSTRAINT "VideoAudienceUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveStreamAudienceUser"
ADD CONSTRAINT "LiveStreamAudienceUser_liveStreamId_fkey" FOREIGN KEY ("liveStreamId") REFERENCES "LiveStream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveStreamAudienceUser"
ADD CONSTRAINT "LiveStreamAudienceUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
