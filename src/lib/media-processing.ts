import { createWriteStream } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pipeline } from "node:stream/promises"
import type { Readable } from "node:stream"
import {
  MediaAssetStatus,
  MediaAssetType,
  RecordingStatus,
  ThumbnailStatus,
  VideoStatus,
  type Prisma,
} from "@prisma/client"
import prisma from "@/lib/prisma"
import { getMinioClient, VIDEO_BUCKET_NAME } from "@/lib/minio"
import {
  MediaPipelineError,
  probeMediaSource,
  sha256LocalFile,
  transcodeAndUpload,
  type GeneratedMediaAsset,
  type GeneratedVideoVariant,
  type SourceMediaMetadata,
} from "@/lib/ffmpeg"
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
const generatedMediaPrefixes = (videoId: string) => [
  `${MEDIA_OBJECT_PREFIXES.readyVideo}${videoId}/hls/`,
  `${MEDIA_OBJECT_PREFIXES.thumbnail}${videoId}-thumb`,
]

function truncateErrorMessage(message: string) {
  return message.length > 1_000 ? `${message.slice(0, 997)}...` : message
}

export function normalizeProcessingError(error: unknown) {
  if (error instanceof MediaPipelineError) {
    return new MediaProcessingError(error.code, truncateErrorMessage(error.message), error.retryable)
  }

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
  const objectInfo = await minioClient.statObject(VIDEO_BUCKET_NAME, objectKey)
  const objectStream = (await minioClient.getObject(VIDEO_BUCKET_NAME, objectKey)) as Readable
  await pipeline(objectStream, createWriteStream(tempPath))
  return { tempDir, tempPath, objectInfo }
}

function objectContentType(objectInfo: { metaData?: Record<string, string> }) {
  return objectInfo.metaData?.["content-type"] || objectInfo.metaData?.["Content-Type"] || "application/octet-stream"
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

async function listObjectKeys(prefix: string) {
  const objectStream = getMinioClient().listObjectsV2(VIDEO_BUCKET_NAME, prefix, true)
  const keys: string[] = []

  await new Promise<void>((resolve, reject) => {
    objectStream.on("data", (item: { name?: string }) => {
      if (item.name) {
        keys.push(item.name)
      }
    })
    objectStream.on("error", reject)
    objectStream.on("end", resolve)
  })

  return keys
}

async function removeObjectsByKey(storageKeys: string[]) {
  const uniqueStorageKeys = [...new Set(storageKeys)].filter(Boolean)
  if (uniqueStorageKeys.length === 0) {
    return
  }

  await getMinioClient().removeObjects(VIDEO_BUCKET_NAME, uniqueStorageKeys)
}

async function cleanupGeneratedStorage(videoId: string) {
  const keysByPrefix = await Promise.all(generatedMediaPrefixes(videoId).map(listObjectKeys))
  await removeObjectsByKey(keysByPrefix.flat())
}

async function resetGeneratedMedia(videoId: string) {
  const generatedAssets = await prisma.mediaAsset.findMany({
    where: {
      videoId,
      type: { not: MediaAssetType.SOURCE },
    },
    select: { storageKey: true },
  })

  await removeObjectsByKey(generatedAssets.map((asset) => asset.storageKey))
  await cleanupGeneratedStorage(videoId)

  await prisma.$transaction([
    prisma.mediaAsset.deleteMany({
      where: {
        videoId,
        type: { not: MediaAssetType.SOURCE },
      },
    }),
    prisma.videoVariant.deleteMany({ where: { videoId } }),
  ])
}

function sourceMetadataUpdate(
  source: SourceMediaMetadata,
  sourceKey: string,
  sourceSizeBytes: bigint,
  sourceChecksumSha256: string,
  sourceContentType: string,
): Prisma.VideoUpdateInput {
  return {
    durationSeconds: source.durationSeconds,
    width: source.width,
    height: source.height,
    videoCodec: source.videoCodec,
    audioCodec: source.audioCodec,
    container: source.container,
    bitrate: source.bitrate,
    sourceSizeBytes,
    sourceChecksumSha256,
    sourceContentType,
    mediaAssets: {
      upsert: {
        where: { storageKey: sourceKey },
        update: {
          type: MediaAssetType.SOURCE,
          status: MediaAssetStatus.READY,
          contentType: sourceContentType,
          sizeBytes: sourceSizeBytes,
          checksumSha256: sourceChecksumSha256,
          errorCode: null,
          errorMessage: null,
        },
        create: {
          type: MediaAssetType.SOURCE,
          status: MediaAssetStatus.READY,
          storageKey: sourceKey,
          contentType: sourceContentType,
          sizeBytes: sourceSizeBytes,
          checksumSha256: sourceChecksumSha256,
        },
      },
    },
  }
}

async function persistGeneratedMedia(
  videoId: string,
  result: {
    videoUrl: string
    thumbnailUrl: string | null
    thumbnailStatus: ThumbnailStatus
    variants: GeneratedVideoVariant[]
    assets: GeneratedMediaAsset[]
  },
) {
  await prisma.$transaction(async (tx) => {
    const createdVariants = new Map<string, string>()

    for (const variant of result.variants) {
      const createdVariant = await tx.videoVariant.create({
        data: {
          videoId,
          label: variant.label,
          width: variant.width,
          height: variant.height,
          bitrate: variant.bitrate,
          codec: variant.codec,
          playlistKey: variant.playlistKey,
        },
      })
      createdVariants.set(variant.label, createdVariant.id)
    }

    for (const asset of result.assets) {
      await tx.mediaAsset.create({
        data: {
          videoId,
          variantId: asset.variantLabel ? createdVariants.get(asset.variantLabel) : undefined,
          type: asset.type,
          status: MediaAssetStatus.READY,
          storageKey: asset.storageKey,
          contentType: asset.contentType,
          sizeBytes: asset.sizeBytes,
          checksumSha256: asset.checksumSha256,
          language: asset.language,
          label: asset.label,
          isDefault: asset.isDefault ?? false,
        },
      })
    }

    await tx.video.update({
      where: { id: videoId },
      data: {
        status: VideoStatus.READY,
        url: result.videoUrl,
        thumbnailUrl: result.thumbnailUrl,
        thumbnailStatus: result.thumbnailStatus,
        processingErrorCode: null,
        processingErrorMessage: null,
        processingCompletedAt: new Date(),
        processingWorkerVersion: mediaWorkerVersion,
      },
    })
  })
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

    await resetGeneratedMedia(video.id)
    const source = await probeMediaSource(downloaded.tempPath)
    const sourceChecksumSha256 = await sha256LocalFile(downloaded.tempPath)
    const sourceSizeBytes = BigInt(downloaded.objectInfo.size)
    const sourceContentType = objectContentType(downloaded.objectInfo)

    await prisma.video.update({
      where: { id: video.id },
      data: sourceMetadataUpdate(
        source,
        video.sourceKey,
        sourceSizeBytes,
        sourceChecksumSha256,
        sourceContentType,
      ),
    })

    const transcodeResult = await transcodeAndUpload(downloaded.tempPath, video.id, source)
    await persistGeneratedMedia(video.id, transcodeResult)

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

    return { skipped: false }
  } catch (error) {
    await cleanupGeneratedStorage(video.id).catch(() => null)
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
