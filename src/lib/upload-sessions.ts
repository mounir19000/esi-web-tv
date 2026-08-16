import { randomUUID, createHash } from "node:crypto"
import { AudienceType, UploadSessionState, type UploadSession, type VideoType } from "@prisma/client"
import prisma from "@/lib/prisma"
import { getMinioClient, initBuckets, toPublicMediaUrl, VIDEO_BUCKET_NAME } from "@/lib/minio"
import { MEDIA_OBJECT_PREFIXES } from "@/lib/media"
import { enqueueVideoProcessing } from "@/lib/media-queue"
import {
  getMultipartUploadParts,
  uploadContentType,
  uploadMaxBytes,
  uploadPartSizeBytes,
  uploadSessionTtlMs,
  validateUploadedParts,
  type MultipartUploadPart,
  type UploadedMultipartPart,
} from "@/lib/upload-policy"

type MinioClient = ReturnType<typeof getMinioClient>
type MultipartCapableMinioClient = MinioClient & {
  initiateNewMultipartUpload(bucketName: string, objectName: string, headers: Record<string, string>): Promise<string>
  abortMultipartUpload(bucketName: string, objectName: string, uploadId: string): Promise<void>
  completeMultipartUpload(
    bucketName: string,
    objectName: string,
    uploadId: string,
    parts: { part: number; etag?: string }[],
  ): Promise<{ etag: string; versionId: string | null }>
  listParts(bucketName: string, objectName: string, uploadId: string): Promise<UploadedMultipartPart[]>
}

function getMultipartClient() {
  return getMinioClient() as MultipartCapableMinioClient
}

const uploadUrlTtlSeconds = 15 * 60
const activeUploadStates: UploadSessionState[] = [UploadSessionState.INITIATED, UploadSessionState.UPLOADING]

export type CreateUploadSessionInput = {
  ownerId: string
  title: string
  description: string | null
  type: VideoType
  audience: AudienceType
  isPublic: boolean
  moduleId: string | null
  cohortId?: string | null
  originalFileName: string | null
  expectedSize: number
  expectedType: string
  checksum: string | null
}

export type PresignedUploadPart = MultipartUploadPart & {
  url: string
}

function randomStagingObjectKey(ownerId: string) {
  return `${MEDIA_OBJECT_PREFIXES.staging}${ownerId}/${randomUUID()}.mp4`
}

function assertActiveUploadSession(session: UploadSession) {
  if (!activeUploadStates.includes(session.state)) {
    throw new Error("Upload session is no longer active")
  }

  if (session.expiresAt <= new Date()) {
    throw new Error("Upload session has expired")
  }
}

async function signUploadParts(session: UploadSession, partNumbers?: number[]): Promise<PresignedUploadPart[]> {
  assertActiveUploadSession(session)

  const allParts = getMultipartUploadParts(Number(session.expectedSize), session.expectedPartSize)
  const requestedPartNumbers = partNumbers ? new Set(partNumbers) : null
  const parts = requestedPartNumbers
    ? allParts.filter((part) => requestedPartNumbers.has(part.partNumber))
    : allParts

  if (requestedPartNumbers && parts.length !== requestedPartNumbers.size) {
    throw new Error("Requested upload part is outside the session range")
  }

  return Promise.all(
    parts.map(async (part) => ({
      ...part,
      url: toPublicMediaUrl(
        await getMultipartClient().presignedUrl("PUT", VIDEO_BUCKET_NAME, session.objectKey, uploadUrlTtlSeconds, {
          partNumber: String(part.partNumber),
          uploadId: session.multipartUploadId,
        }),
      ),
    })),
  )
}

export async function expireStaleUploadSessions(ownerId?: string) {
  const expiredSessions = await prisma.uploadSession.findMany({
    where: {
      state: { in: activeUploadStates },
      expiresAt: { lte: new Date() },
      ...(ownerId ? { ownerId } : {}),
    },
    take: 25,
  })

  await Promise.allSettled(
    expiredSessions.map(async (session) => {
      await getMultipartClient().abortMultipartUpload(VIDEO_BUCKET_NAME, session.objectKey, session.multipartUploadId)
      await prisma.uploadSession.update({
        where: { id: session.id },
        data: { state: UploadSessionState.EXPIRED },
      })
    }),
  )
}

export async function createUploadSession(input: CreateUploadSessionInput) {
  await initBuckets()
  await expireStaleUploadSessions(input.ownerId)

  const activeCount = await prisma.uploadSession.count({
    where: {
      ownerId: input.ownerId,
      state: { in: activeUploadStates },
      expiresAt: { gt: new Date() },
    },
  })

  if (activeCount >= 3) {
    throw new Error("Too many active uploads")
  }

  if (input.expectedSize <= 0 || input.expectedSize > uploadMaxBytes) {
    throw new Error("Video file is too large")
  }

  if (input.expectedType !== uploadContentType) {
    throw new Error("Only MP4 files are supported")
  }

  const objectKey = randomStagingObjectKey(input.ownerId)
  const uploadId = await getMultipartClient().initiateNewMultipartUpload(VIDEO_BUCKET_NAME, objectKey, {
    "Content-Type": input.expectedType,
  })

  const session = await prisma.uploadSession.create({
    data: {
      title: input.title,
      description: input.description,
      type: input.type,
      audience: input.audience,
      isPublic: input.isPublic,
      originalFileName: input.originalFileName,
      objectKey,
      expectedSize: BigInt(input.expectedSize),
      expectedPartSize: uploadPartSizeBytes,
      expectedType: input.expectedType,
      checksum: input.checksum,
      multipartUploadId: uploadId,
      state: UploadSessionState.INITIATED,
      expiresAt: new Date(Date.now() + uploadSessionTtlMs),
      ownerId: input.ownerId,
      ...(input.moduleId ? { moduleId: input.moduleId } : {}),
      ...(input.cohortId ? { cohortId: input.cohortId } : {}),
    },
  })

  const parts = await signUploadParts(session)
  await prisma.uploadSession.update({
    where: { id: session.id },
    data: { state: UploadSessionState.UPLOADING },
  })

  return {
    session,
    parts,
  }
}

export async function refreshUploadPartUrls(sessionId: string, ownerId: string, partNumbers: number[]) {
  const session = await prisma.uploadSession.findUnique({ where: { id: sessionId } })
  if (!session || session.ownerId !== ownerId) {
    return null
  }

  const uniquePartNumbers = [...new Set(partNumbers)]
  if (
    uniquePartNumbers.length === 0 ||
    uniquePartNumbers.some((partNumber) => !Number.isInteger(partNumber) || partNumber <= 0)
  ) {
    throw new Error("Invalid upload part numbers")
  }

  return signUploadParts(session, uniquePartNumbers)
}

async function streamObjectToHash(objectKey: string) {
  const hash = createHash("sha256")
  const objectStream = await getMinioClient().getObject(VIDEO_BUCKET_NAME, objectKey)

  for await (const chunk of objectStream) {
    hash.update(chunk)
  }

  return hash.digest("hex")
}

export async function completeUploadSession(sessionId: string, ownerId: string) {
  const session = await prisma.uploadSession.findUnique({ where: { id: sessionId } })
  if (!session || session.ownerId !== ownerId) {
    return null
  }

  assertActiveUploadSession(session)

  const listedParts = await getMultipartClient().listParts(VIDEO_BUCKET_NAME, session.objectKey, session.multipartUploadId)
  const completionParts = validateUploadedParts(
    listedParts,
    Number(session.expectedSize),
    session.expectedPartSize,
  )

  await getMultipartClient().completeMultipartUpload(
    VIDEO_BUCKET_NAME,
    session.objectKey,
    session.multipartUploadId,
    completionParts,
  )

  const objectInfo = await getMinioClient().statObject(VIDEO_BUCKET_NAME, session.objectKey)
  if (objectInfo.size !== Number(session.expectedSize)) {
    throw new Error("Uploaded object size does not match the upload session")
  }

  const contentType = objectInfo.metaData?.["content-type"]
  if (contentType && contentType !== uploadContentType) {
    throw new Error("Uploaded object type does not match the upload session")
  }

  if (session.checksum) {
    const actualChecksum = await streamObjectToHash(session.objectKey)
    if (actualChecksum !== session.checksum) {
      throw new Error("Uploaded object checksum does not match the upload session")
    }
  }

  const video = await prisma.$transaction(async (tx) => {
    const createdVideo = await tx.video.create({
      data: {
        title: session.title,
        description: session.description,
        type: session.type,
        audience: session.audience,
        isPublic: session.isPublic,
        status: "PENDING",
        url: "",
        thumbnailUrl: null,
        sourceKey: session.objectKey,
        uploaderId: session.ownerId,
        ...(session.moduleId ? { moduleId: session.moduleId } : {}),
        ...(session.cohortId ? { cohortId: session.cohortId } : {}),
      },
    })

    await tx.uploadSession.update({
      where: { id: session.id },
      data: {
        state: UploadSessionState.COMPLETED,
        completedAt: new Date(),
        videoId: createdVideo.id,
      },
    })

    return createdVideo
  })

  try {
    await enqueueVideoProcessing(video.id, video.processingVersion)
  } catch (error) {
    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: "FAILED",
        processingErrorCode: "QUEUE_ENQUEUE_FAILED",
        processingErrorMessage: error instanceof Error ? error.message : "Could not enqueue media processing job",
      },
    })
    throw error
  }

  return video
}

export async function abortUploadSession(sessionId: string, ownerId: string) {
  const session = await prisma.uploadSession.findUnique({ where: { id: sessionId } })
  if (!session || session.ownerId !== ownerId) {
    return null
  }

  if (activeUploadStates.includes(session.state)) {
    await getMultipartClient().abortMultipartUpload(VIDEO_BUCKET_NAME, session.objectKey, session.multipartUploadId)
  }

  return prisma.uploadSession.update({
    where: { id: session.id },
    data: { state: UploadSessionState.ABORTED },
  })
}
