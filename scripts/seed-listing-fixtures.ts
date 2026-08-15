import "dotenv/config"

import {
  AudienceType,
  AuditEventType,
  ProvisioningStatus,
  RecordingJobStatus,
  RecordingStatus,
  Role,
  StreamStatus,
  VideoStatus,
  VideoType,
} from "@prisma/client"
import prisma from "../src/lib/prisma"

const defaultScale = 1200
const maxScale = 10000

function fixtureId(prefix: string, index: number) {
  return `fixture-${prefix}-${String(index).padStart(5, "0")}`
}

function fixtureDate(index: number) {
  return new Date(Date.UTC(2026, 0, 1, 12, 0, 0) - index * 60_000)
}

function fixtureScale() {
  const value = Number(process.env.LISTING_FIXTURE_SCALE ?? defaultScale)
  if (!Number.isInteger(value) || value < 100) {
    return defaultScale
  }

  return Math.min(value, maxScale)
}

async function main() {
  if (process.env.APP_ENV === "production" && process.env.ALLOW_PRODUCTION_FIXTURES !== "true") {
    throw new Error("Refusing to seed listing fixtures in production without ALLOW_PRODUCTION_FIXTURES=true.")
  }

  const scale = fixtureScale()
  const moduleCount = Math.max(60, Math.floor(scale / 20))
  const userCount = Math.max(240, Math.floor(scale / 4))
  const streamCount = Math.max(240, Math.floor(scale / 4))
  const jobCount = Math.max(160, Math.floor(scale / 6))
  const auditCount = Math.max(400, Math.floor(scale / 2))
  const teacherId = "fixture-listing-teacher"
  const now = new Date()
  const yearGroups = ["1CP", "2CP", "1CS", "2CS", "3CS"]
  const videoTypes = Object.values(VideoType)

  await prisma.user.upsert({
    where: { id: teacherId },
    update: {
      name: "Fixture Teacher",
      email: "fixture.teacher@esi.dz",
      role: Role.TEACHER,
      provisioningStatus: ProvisioningStatus.APPROVED,
      isActive: true,
      disabledAt: null,
    },
    create: {
      id: teacherId,
      name: "Fixture Teacher",
      email: "fixture.teacher@esi.dz",
      role: Role.TEACHER,
      provisioningStatus: ProvisioningStatus.APPROVED,
      isActive: true,
    },
  })

  const modules = Array.from({ length: moduleCount }, (_, index) => ({
    id: fixtureId("module", index),
    name: `Fixture Module ${String(index + 1).padStart(4, "0")}`,
    yearGroup: yearGroups[index % yearGroups.length],
    createdAt: fixtureDate(index),
    updatedAt: now,
  }))

  await prisma.module.createMany({ data: modules, skipDuplicates: true })

  await prisma.user.createMany({
    data: Array.from({ length: userCount }, (_, index) => ({
      id: fixtureId("user", index),
      name: `Fixture User ${String(index + 1).padStart(4, "0")}`,
      email: `fixture.user.${String(index + 1).padStart(5, "0")}@esi.dz`,
      role: index % 7 === 0 ? Role.TEACHER : Role.STUDENT,
      yearGroup: yearGroups[index % yearGroups.length],
      provisioningStatus: index % 11 === 0 ? ProvisioningStatus.PENDING : ProvisioningStatus.APPROVED,
      isActive: index % 17 !== 0,
      createdAt: fixtureDate(index),
      updatedAt: now,
    })),
    skipDuplicates: true,
  })

  await prisma.video.createMany({
    data: Array.from({ length: scale }, (_, index) => {
      const isPublic = index % 4 === 0
      const fixtureModule = modules[index % modules.length]
      return {
        id: fixtureId("video", index),
        title: `Fixture Video ${String(index + 1).padStart(5, "0")}`,
        description: `Fixture listing video for ${fixtureModule.name}`,
        type: videoTypes[index % videoTypes.length],
        isPublic,
        audience: isPublic ? AudienceType.PUBLIC : index % 3 === 0 ? AudienceType.ESI : AudienceType.MODULE,
        status: index % 13 === 0 ? VideoStatus.PENDING : VideoStatus.READY,
        url: `fixtures/videos/${index}/master.m3u8`,
        thumbnailUrl: `fixtures/videos/${index}/thumbnail.jpg`,
        sourceKey: `fixtures/sources/${index}.mp4`,
        uploaderId: teacherId,
        moduleId: fixtureModule.id,
        createdAt: fixtureDate(index),
        updatedAt: now,
      }
    }),
    skipDuplicates: true,
  })

  await prisma.liveStream.createMany({
    data: Array.from({ length: streamCount }, (_, index) => {
      const isLive = index % 3 !== 0
      const isPublic = index % 4 === 0
      return {
        id: fixtureId("stream", index),
        title: `Fixture Stream ${String(index + 1).padStart(5, "0")}`,
        description: "Fixture live stream for listing query plans.",
        isPublic,
        audience: isPublic ? AudienceType.PUBLIC : AudienceType.ESI,
        isLive,
        status: isLive ? StreamStatus.LIVE : StreamStatus.ENDED,
        streamKey: fixtureId("stream-key", index),
        hostId: teacherId,
        moduleId: modules[index % modules.length].id,
        startedAt: isLive ? fixtureDate(index) : null,
        endedAt: isLive ? null : fixtureDate(index),
        createdAt: fixtureDate(index),
        updatedAt: now,
      }
    }),
    skipDuplicates: true,
  })

  await prisma.recording.createMany({
    data: Array.from({ length: jobCount }, (_, index) => ({
      id: fixtureId("recording", index),
      status: index % 5 === 0 ? RecordingStatus.FAILED : RecordingStatus.READY,
      objectKey: `fixtures/recordings/${index}.mp4`,
      sizeBytes: BigInt(10_000_000 + index),
      durationSeconds: 1800 + (index % 600),
      streamId: fixtureId("stream", index % streamCount),
      createdAt: fixtureDate(index),
      updatedAt: now,
    })),
    skipDuplicates: true,
  })

  await prisma.recordingJob.createMany({
    data: Array.from({ length: jobCount }, (_, index) => ({
      id: fixtureId("recording-job", index),
      status: index % 5 === 0 ? RecordingJobStatus.FAILED : RecordingJobStatus.COMPLETED,
      providerEgressId: `fixture-egress-${index}`,
      outputKey: `fixtures/egress/${index}.mp4`,
      streamId: fixtureId("stream", index % streamCount),
      recordingId: fixtureId("recording", index),
      createdAt: fixtureDate(index),
      updatedAt: now,
    })),
    skipDuplicates: true,
  })

  await prisma.auditEvent.createMany({
    data: Array.from({ length: auditCount }, (_, index) => ({
      id: fixtureId("audit", index),
      type: index % 3 === 0 ? AuditEventType.LOGIN : AuditEventType.CONTENT_UPDATE,
      actorId: index % 2 === 0 ? teacherId : fixtureId("user", index % userCount),
      subjectId: fixtureId("user", index % userCount),
      metadata: { source: "listing-fixture", index },
      createdAt: fixtureDate(index),
    })),
    skipDuplicates: true,
  })

  console.log(`Seeded listing fixtures with scale ${scale}.`)
  console.log(`Modules: ${moduleCount}, users: ${userCount}, videos: ${scale}, streams: ${streamCount}.`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
