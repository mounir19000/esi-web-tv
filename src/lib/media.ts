import { VIDEO_BUCKET_NAME } from "@/lib/minio"

export function getMediaUrl(objectName?: string | null) {
  if (!objectName) {
    return null
  }

  if (/^https?:\/\//.test(objectName)) {
    return objectName
  }

  const configuredBaseUrl =
    process.env.NEXT_PUBLIC_MINIO_PUBLIC_URL || process.env.MINIO_PUBLIC_URL

  if (configuredBaseUrl) {
    return `${configuredBaseUrl.replace(/\/$/, "")}/${objectName}`
  }

  const protocol = process.env.MINIO_USE_SSL === "true" ? "https" : "http"
  const endpoint = process.env.MINIO_ENDPOINT || "localhost"
  const port = process.env.MINIO_PORT || "9000"

  return `${protocol}://${endpoint}:${port}/${VIDEO_BUCKET_NAME}/${objectName}`
}
