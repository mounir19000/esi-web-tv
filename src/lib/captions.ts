import { createHash, randomUUID } from "node:crypto"
import { MediaAssetStatus, MediaAssetType } from "@prisma/client"
import { MEDIA_OBJECT_PREFIXES } from "@/lib/media"
import { getMinioClient, VIDEO_BUCKET_NAME } from "@/lib/minio"
import prisma from "@/lib/prisma"

export const captionMaxBytes = 2 * 1024 * 1024
export const captionContentType = "text/vtt; charset=utf-8"

type CaptionUploadFile = {
  name: string
  size: number
  type: string
  arrayBuffer(): Promise<ArrayBuffer>
}

export class CaptionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CaptionValidationError"
  }
}

function assertCaptionUploadFile(value: unknown): asserts value is CaptionUploadFile {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as CaptionUploadFile).name !== "string" ||
    typeof (value as CaptionUploadFile).size !== "number" ||
    typeof (value as CaptionUploadFile).type !== "string" ||
    typeof (value as CaptionUploadFile).arrayBuffer !== "function"
  ) {
    throw new CaptionValidationError("Choose a WebVTT caption file.")
  }
}

export function normalizeCaptionLanguage(value: string) {
  const language = value.trim().toLowerCase()
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(language)) {
    throw new CaptionValidationError("Use a valid language tag, for example en or fr.")
  }

  return language
}

export function normalizeCaptionLabel(value: string, language: string) {
  const label = value.trim().replace(/\s+/g, " ")
  if (label.length > 80) {
    throw new CaptionValidationError("Caption label must be 80 characters or less.")
  }

  return label || language.toUpperCase()
}

export function validateWebVttText(value: string) {
  const normalized = value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
  if (!normalized.trim()) {
    throw new CaptionValidationError("Caption file cannot be empty.")
  }

  if (normalized.includes("\0")) {
    throw new CaptionValidationError("Caption file contains invalid characters.")
  }

  const firstLine = normalized.split("\n", 1)[0].trim()
  if (firstLine !== "WEBVTT" && !firstLine.startsWith("WEBVTT ")) {
    throw new CaptionValidationError("Caption file must be a WebVTT file.")
  }

  return normalized.endsWith("\n") ? normalized : `${normalized}\n`
}

export async function readCaptionUploadFile(value: unknown) {
  assertCaptionUploadFile(value)

  if (value.size <= 0) {
    throw new CaptionValidationError("Caption file cannot be empty.")
  }

  if (value.size > captionMaxBytes) {
    throw new CaptionValidationError("Caption file is too large.")
  }

  if (value.type && value.type !== "text/vtt") {
    throw new CaptionValidationError("Only WebVTT caption files are supported.")
  }

  if (!value.name.toLowerCase().endsWith(".vtt")) {
    throw new CaptionValidationError("Caption file must use the .vtt extension.")
  }

  const buffer = Buffer.from(await value.arrayBuffer())
  return validateWebVttText(buffer.toString("utf8"))
}

export async function attachCaptionAsset(input: {
  videoId: string
  file: unknown
  language: string
  label: string
  isDefault: boolean
}) {
  const language = normalizeCaptionLanguage(input.language)
  const label = normalizeCaptionLabel(input.label, language)
  const captionText = await readCaptionUploadFile(input.file)
  const captionBuffer = Buffer.from(captionText, "utf8")
  const checksumSha256 = createHash("sha256").update(captionBuffer).digest("hex")
  const storageKey = `${MEDIA_OBJECT_PREFIXES.caption}${input.videoId}/${randomUUID()}.vtt`

  await getMinioClient().putObject(VIDEO_BUCKET_NAME, storageKey, captionBuffer, captionBuffer.length, {
    "Content-Type": captionContentType,
  })

  try {
    return await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.mediaAsset.updateMany({
          where: {
            videoId: input.videoId,
            type: MediaAssetType.CAPTION,
          },
          data: { isDefault: false },
        })
      }

      return tx.mediaAsset.create({
        data: {
          videoId: input.videoId,
          type: MediaAssetType.CAPTION,
          status: MediaAssetStatus.READY,
          storageKey,
          contentType: captionContentType,
          sizeBytes: BigInt(captionBuffer.length),
          checksumSha256,
          language,
          label,
          isDefault: input.isDefault,
        },
      })
    })
  } catch (error) {
    await getMinioClient().removeObject(VIDEO_BUCKET_NAME, storageKey).catch(() => null)
    throw error
  }
}
