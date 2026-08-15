import { Queue, type JobsOptions } from "bullmq"
import IORedis from "ioredis"
import prisma from "@/lib/prisma"
import { VideoStatus } from "@prisma/client"
import { appConfig } from "@/lib/env"

export const mediaProcessingQueueName = "media-processing"
export const mediaProcessingJobName = "process-video"
export const mediaWorkerVersion = appConfig.queue.mediaWorkerVersion

export type MediaProcessingJobData = {
  videoId: string
  processingVersion: number
}

const mediaProcessingAttempts = 3

declare global {
  var mediaProcessingQueue: Queue<MediaProcessingJobData> | undefined
}

export function buildMediaProcessingJobId(videoId: string, processingVersion: number) {
  return `video:${videoId}:v${processingVersion}`
}

export function getMediaProcessingJobOptions(videoId: string, processingVersion: number): JobsOptions {
  return {
    jobId: buildMediaProcessingJobId(videoId, processingVersion),
    attempts: mediaProcessingAttempts,
    backoff: {
      type: "exponential",
      delay: 30_000,
    },
    removeOnComplete: {
      age: 7 * 24 * 60 * 60,
      count: 1_000,
    },
    removeOnFail: false,
  }
}

export function createRedisConnection() {
  return new IORedis(appConfig.queue.redisUrl, {
    maxRetriesPerRequest: null,
  })
}

export function getMediaProcessingQueue() {
  if (!globalThis.mediaProcessingQueue) {
    globalThis.mediaProcessingQueue = new Queue<MediaProcessingJobData>(mediaProcessingQueueName, {
      connection: createRedisConnection(),
    })
  }

  return globalThis.mediaProcessingQueue
}

export async function enqueueVideoProcessing(videoId: string, processingVersion: number) {
  const queue = getMediaProcessingQueue()
  const job = await queue.add(
    mediaProcessingJobName,
    { videoId, processingVersion },
    getMediaProcessingJobOptions(videoId, processingVersion),
  )

  await prisma.video.update({
    where: { id: videoId },
    data: {
      status: VideoStatus.PENDING,
      queuedAt: new Date(),
      processingErrorCode: null,
      processingErrorMessage: null,
    },
  })

  return job
}

export async function retryVideoProcessing(videoId: string, options: { includeReady?: boolean } = {}) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      status: true,
      sourceKey: true,
    },
  })

  const retryableStatuses: VideoStatus[] = options.includeReady
    ? [VideoStatus.FAILED, VideoStatus.READY]
    : [VideoStatus.FAILED]

  if (!video || !retryableStatuses.includes(video.status) || !video.sourceKey) {
    return null
  }

  const retryCandidate = await prisma.video.update({
    where: { id: video.id },
    data: {
      status: VideoStatus.PENDING,
      processingVersion: { increment: 1 },
      processingStartedAt: null,
      processingCompletedAt: null,
      processingErrorCode: null,
      processingErrorMessage: null,
    },
    select: {
      id: true,
      processingVersion: true,
    },
  })

  return enqueueVideoProcessing(retryCandidate.id, retryCandidate.processingVersion)
}
