import { Queue } from "bullmq"
import { VideoStatus } from "@prisma/client"
import prisma from "@/lib/prisma"
import { initBuckets } from "@/lib/minio"
import {
  createRedisConnection,
  mediaProcessingQueueName,
  type MediaProcessingJobData,
} from "@/lib/media-queue"

type DependencyCheck = {
  ok: boolean
  latencyMs: number
  error?: string
}

type DependencyName = "database" | "redis" | "minio"

export type ReadinessReport = {
  ok: boolean
  checkedAt: string
  dependencies: Record<DependencyName, DependencyCheck>
}

async function timedCheck(callback: () => Promise<void>): Promise<DependencyCheck> {
  const startedAt = performance.now()
  try {
    await callback()
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
    }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "Unknown health check error",
    }
  }
}

export async function checkDatabase() {
  return timedCheck(async () => {
    await prisma.$queryRaw`SELECT 1`
  })
}

export async function checkRedis() {
  return timedCheck(async () => {
    const redis = createRedisConnection()
    try {
      await redis.ping()
    } finally {
      await redis.quit().catch(() => redis.disconnect())
    }
  })
}

export async function checkMinio() {
  return timedCheck(async () => {
    await initBuckets()
  })
}

export async function getReadinessReport(): Promise<ReadinessReport> {
  const [database, redis, minio] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkMinio(),
  ])
  const dependencies = { database, redis, minio }

  return {
    ok: Object.values(dependencies).every((dependency) => dependency.ok),
    checkedAt: new Date().toISOString(),
    dependencies,
  }
}

function metricLine(name: string, value: number | bigint, labels: Record<string, string> = {}) {
  const labelEntries = Object.entries(labels)
  const renderedLabels = labelEntries.length > 0
    ? `{${labelEntries.map(([key, label]) => `${key}=${JSON.stringify(label)}`).join(",")}}`
    : ""

  return `${name}${renderedLabels} ${value.toString()}`
}

async function getQueueCounts() {
  const queue = new Queue<MediaProcessingJobData>(mediaProcessingQueueName, {
    connection: createRedisConnection(),
  })

  try {
    return await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed")
  } finally {
    await queue.close()
  }
}

export async function getPrometheusMetrics() {
  const [queueCounts, failedVideos, processingVideos, activeStreams, trackedStorage, readiness] = await Promise.all([
    getQueueCounts(),
    prisma.video.count({ where: { status: VideoStatus.FAILED } }),
    prisma.video.count({ where: { status: VideoStatus.PROCESSING } }),
    prisma.liveStream.count({ where: { isLive: true } }),
    prisma.mediaAsset.aggregate({
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    getReadinessReport(),
  ])
  const lines = [
    "# HELP esitv_dependency_up Dependency health status where 1 is healthy.",
    "# TYPE esitv_dependency_up gauge",
    ...Object.entries(readiness.dependencies).map(([name, result]) =>
      metricLine("esitv_dependency_up", result.ok ? 1 : 0, { dependency: name }),
    ),
    "# HELP esitv_dependency_latency_ms Dependency health check latency in milliseconds.",
    "# TYPE esitv_dependency_latency_ms gauge",
    ...Object.entries(readiness.dependencies).map(([name, result]) =>
      metricLine("esitv_dependency_latency_ms", result.latencyMs, { dependency: name }),
    ),
    "# HELP esitv_media_queue_jobs BullMQ media processing jobs by status.",
    "# TYPE esitv_media_queue_jobs gauge",
    ...Object.entries(queueCounts).map(([status, count]) =>
      metricLine("esitv_media_queue_jobs", count, { status }),
    ),
    "# HELP esitv_video_failures Videos currently marked as failed.",
    "# TYPE esitv_video_failures gauge",
    metricLine("esitv_video_failures", failedVideos),
    "# HELP esitv_video_processing Videos currently being processed.",
    "# TYPE esitv_video_processing gauge",
    metricLine("esitv_video_processing", processingVideos),
    "# HELP esitv_live_streams_active Live streams currently active.",
    "# TYPE esitv_live_streams_active gauge",
    metricLine("esitv_live_streams_active", activeStreams),
    "# HELP esitv_storage_tracked_bytes Bytes tracked through MediaAsset rows.",
    "# TYPE esitv_storage_tracked_bytes gauge",
    metricLine("esitv_storage_tracked_bytes", trackedStorage._sum.sizeBytes ?? 0),
    "# HELP esitv_storage_assets Tracked media asset row count.",
    "# TYPE esitv_storage_assets gauge",
    metricLine("esitv_storage_assets", trackedStorage._count._all),
  ]

  return `${lines.join("\n")}\n`
}
