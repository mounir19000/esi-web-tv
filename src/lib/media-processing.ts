import { createWriteStream } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pipeline } from "node:stream/promises"
import type { Readable } from "node:stream"
import ffmpeg from "fluent-ffmpeg"
import { RecordingStatus, VideoStatus } from "@prisma/client"
import prisma from "@/lib/prisma"
import { getMinioClient, VIDEO_BUCKET_NAME } from "@/lib/minio"
import { transcodeAndUpload } from "@/lib/ffmpeg"
import { MEDIA_OBJECT_PREFIXES } from "@/lib/media"
import {
  enqueueVideoProcessing,
  mediaWorkerVersion,
  type MediaProcessingJobData,
} from "@/lib/media-queue"

export class MediaProcessingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
    this.name = "MediaProcessingError"
  }
}

type ProcessingJobContext = {
  attempt: number
  maxAttempts: number
}

const staleProcessingMs = 30 * 60 * 1000

function truncateErrorMessage(message: string) {
  return message.length > 1_000 ? `${message.slice(0, 997)}...` : message
}

export function normalizeProcessingError(error: unknown) {
  if (error instanceof MediaProcessingError) {
    return error
  }

  const message = error instanceof Error ? error.message : "Media processing failed"
  return new MediaProcessingError("PROCESSING_FAILED", truncateErrorMessage(message), true)
}

async function downloadObjectToTempFile(objectKey: string, videoId: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `esitv-media-${videoId}-`))
  const tempPath = path.join(tempDir, "source.mp4")
  const minioClient = getMinioClient()
  const objectStream = (await minioClient.getObject(VIDEO_BUCKET_NAME, objectKey)) as Readable
  await pipeline(objectStream, createWriteStream(tempPath))
  return { tempDir, tempPath }
}

async function validateMediaFile(inputFilePath: string) {
  await new Promise<void>((resolve, reject) => {
    ffmpeg.ffprobe(inputFilePath, (error, metadata) => {
      if (error) {
        reject(new MediaProcessingError("MEDIA_VALIDATION_FAILED", "Uploaded file is not readable media", false))
        return
      }

      const hasVideoStream = metadata.streams.some((stream) => stream.codec_type === "video")
      if (!hasVideoStream) {
        reject(new MediaProcessingError("MEDIA_VALIDATION_FAILED", "Uploaded file does not contain a video stream", false))
        return
      }

      resolve()
    })
  })
}

async function claimProcessingJob(data: MediaProcessingJobData) {
  const video = await prisma.video.findUnique({
    where: { id: data.videoId },
    select: {
      id: true,
      status: true,
      sourceKey: true,
      processingVersion: true,
    },
  })

  if (!video || video.processingVersion !== data.processingVersion || !video.sourceKey) {
    return null
  }

  const claimed = await prisma.video.updateMany({
    where: {
      id: video.id,
      processingVersion: data.processingVersion,
      status: VideoStatus.PENDING,
    },
    data: {
      status: VideoStatus.PROCESSING,
      processingAttempts: { increment: 1 },
      processingStartedAt: new Date(),
      processingCompletedAt: null,
      processingWorkerVersion: mediaWorkerVersion,
    },
  })

  return claimed.count === 1 ? video : null
}

async function recordProcessingFailure(videoId: string, error: MediaProcessingError, isFinalAttempt: boolean) {
  await prisma.video.update({
    where: { id: videoId },
    data: {
      status: isFinalAttempt ? VideoStatus.FAILED : VideoStatus.PENDING,
      processingErrorCode: error.code,
      processingErrorMessage: error.message,
      processingCompletedAt: isFinalAttempt ? new Date() : null,
      processingWorkerVersion: mediaWorkerVersion,
    },
  })

  if (isFinalAttempt) {
    await prisma.recording.updateMany({
      where: {
        publishedVideoId: videoId,
        status: RecordingStatus.PROCESSING,
      },
      data: {
        status: RecordingStatus.FAILED,
        errorCode: error.code,
        errorMessage: error.message,
      },
    })
  }
}

export async function processMediaJob(data: MediaProcessingJobData, context: ProcessingJobContext) {
  const video = await claimProcessingJob(data)
  if (!video?.sourceKey) {
    return { skipped: true }
  }

  let tempDir: string | null = null
  try {
    const downloaded = await downloadObjectToTempFile(video.sourceKey, video.id)
    tempDir = downloaded.tempDir

    await validateMediaFile(downloaded.tempPath)
    const { videoUrl, thumbnailUrl } = await transcodeAndUpload(downloaded.tempPath, video.id)

    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: VideoStatus.READY,
        url: videoUrl,
        thumbnailUrl,
        processingErrorCode: null,
        processingErrorMessage: null,
        processingCompletedAt: new Date(),
        processingWorkerVersion: mediaWorkerVersion,
      },
    })

    await prisma.recording.updateMany({
      where: {
        publishedVideoId: video.id,
        status: { in: [RecordingStatus.PROCESSING, RecordingStatus.FAILED] },
      },
      data: {
        status: RecordingStatus.PUBLISHED,
        publishedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    })

    if (video.sourceKey.startsWith(MEDIA_OBJECT_PREFIXES.staging)) {
      await getMinioClient().removeObject(VIDEO_BUCKET_NAME, video.sourceKey)
    }
    return { skipped: false }
  } catch (error) {
    const processingError = normalizeProcessingError(error)
    const isFinalAttempt = !processingError.retryable || context.attempt >= context.maxAttempts
    await recordProcessingFailure(video.id, processingError, isFinalAttempt)
    throw processingError
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  }
}

export async function reconcileMediaProcessingQueue() {
  const staleCutoff = new Date(Date.now() - staleProcessingMs)

  await prisma.video.updateMany({
    where: {
      status: VideoStatus.PROCESSING,
      processingStartedAt: { lt: staleCutoff },
    },
    data: {
      status: VideoStatus.PENDING,
      processingErrorCode: "PROCESSING_STALE",
      processingErrorMessage: "Processing was returned to the queue after the worker stopped responding.",
    },
  })

  const pendingVideos = await prisma.video.findMany({
    where: {
      status: VideoStatus.PENDING,
      sourceKey: { not: null },
    },
    select: {
      id: true,
      processingVersion: true,
    },
    take: 100,
  })

  const results = await Promise.allSettled(
    pendingVideos.map((video) => enqueueVideoProcessing(video.id, video.processingVersion)),
  )

  return {
    scanned: pendingVideos.length,
    enqueued: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  }
}
