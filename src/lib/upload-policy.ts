import type { VideoType } from "@prisma/client"

export const allowedUploadVideoTypes = ["TEACHING", "CLUB", "EXPLANATION", "OTHER"] as const
export const uploadMaxBytes = 1024 * 1024 * 1024
export const uploadPartSizeBytes = 10 * 1024 * 1024
export const uploadSessionTtlMs = 60 * 60 * 1000
export const maxActiveUploadSessions = 3
export const maxUploadParts = 10_000
export const uploadContentType = "video/mp4"

export type MultipartUploadPart = {
  partNumber: number
  startByte: number
  endByte: number
  size: number
}

export type UploadedMultipartPart = {
  part: number
  etag?: string
  size: number
}

export function isAllowedUploadVideoType(value: string): value is VideoType {
  return allowedUploadVideoTypes.includes(value as VideoType)
}

export function getMultipartUploadParts(fileSize: number, partSize = uploadPartSizeBytes): MultipartUploadPart[] {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) {
    throw new Error("File size must be a positive integer")
  }

  if (!Number.isSafeInteger(partSize) || partSize <= 0) {
    throw new Error("Part size must be a positive integer")
  }

  const partCount = Math.ceil(fileSize / partSize)
  if (partCount > maxUploadParts) {
    throw new Error("File requires too many upload parts")
  }

  return Array.from({ length: partCount }, (_, index) => {
    const startByte = index * partSize
    const endByte = Math.min(startByte + partSize, fileSize)
    return {
      partNumber: index + 1,
      startByte,
      endByte,
      size: endByte - startByte,
    }
  })
}

export function validateUploadedParts(
  uploadedParts: UploadedMultipartPart[],
  expectedSize: number,
  partSize = uploadPartSizeBytes,
) {
  const expectedParts = getMultipartUploadParts(expectedSize, partSize)
  const uploadedByPart = new Map(uploadedParts.map((part) => [part.part, part]))

  return expectedParts.map((expectedPart) => {
    const uploadedPart = uploadedByPart.get(expectedPart.partNumber)
    if (!uploadedPart) {
      throw new Error(`Missing upload part ${expectedPart.partNumber}`)
    }

    if (uploadedPart.size !== expectedPart.size) {
      throw new Error(`Upload part ${expectedPart.partNumber} has an unexpected size`)
    }

    return {
      part: expectedPart.partNumber,
      etag: uploadedPart.etag,
    }
  })
}

export function assertValidChecksum(checksum?: string | null) {
  if (!checksum) {
    return null
  }

  const normalizedChecksum = checksum.trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalizedChecksum)) {
    throw new Error("Checksum must be a SHA-256 hex digest")
  }

  return normalizedChecksum
}
