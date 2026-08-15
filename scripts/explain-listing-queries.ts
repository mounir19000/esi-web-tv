import "dotenv/config"

import prisma from "../src/lib/prisma"

type PlanRow = {
  "QUERY PLAN": string
}

async function explain(name: string, sql: string, ...params: unknown[]) {
  const rows = await prisma.$queryRawUnsafe<PlanRow[]>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`,
    ...params,
  )

  console.log(`\n## ${name}`)
  for (const row of rows) {
    console.log(row["QUERY PLAN"])
  }
}

async function main() {
  console.log("Run against a database loaded with representative production-scale fixtures.")

  await explain(
    "video listing by public visibility",
    `
      SELECT "id", "createdAt", "title", "type", "thumbnailUrl"
      FROM "Video"
      WHERE "status" = $1::"VideoStatus"
        AND ("audience" = $2::"AudienceType" OR "isPublic" = TRUE)
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 25
    `,
    "READY",
    "PUBLIC",
  )

  await explain(
    "video listing by type",
    `
      SELECT "id", "createdAt", "title", "type", "thumbnailUrl"
      FROM "Video"
      WHERE "status" = $1::"VideoStatus"
        AND "type" = $2::"VideoType"
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 25
    `,
    "READY",
    "TEACHING",
  )

  await explain(
    "live stream listing",
    `
      SELECT "id", "createdAt", "streamKey", "title", "status"
      FROM "LiveStream"
      WHERE "isLive" = TRUE
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 25
    `,
  )

  await explain(
    "user management filter",
    `
      SELECT "id", "createdAt", "name", "email", "role", "provisioningStatus"
      FROM "User"
      WHERE "provisioningStatus" = $1::"ProvisioningStatus"
        AND "role" = $2::"Role"
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 50
    `,
    "APPROVED",
    "STUDENT",
  )

  await explain(
    "recording jobs by stream and status",
    `
      SELECT "id", "createdAt", "status", "providerEgressId"
      FROM "RecordingJob"
      WHERE "streamId" = $1
        AND "status" IN ($2::"RecordingJobStatus", $3::"RecordingJobStatus")
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 50
    `,
    "fixture-stream-00000",
    "STARTING",
    "ACTIVE",
  )
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
