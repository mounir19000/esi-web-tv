import { VIDEO_BUCKET_NAME } from "@/lib/minio"

export const MEDIA_OBJECT_PREFIXES = {
  staging: "staging/",
  readyVideo: "videos/",
  thumbnail: "thumbnails/",
  caption: "captions/",
  recording: "recordings/",
} as const

export type VideoMediaAsset = "source" | "thumbnail"

export function isVideoMediaAsset(value: string): value is VideoMediaAsset {
  return value === "source" || value === "thumbnail"
}

export function getVideoMediaUrl(videoId: string, asset: VideoMediaAsset) {
  return `/api/media/videos/${encodeURIComponent(videoId)}/${asset}`
}

export function getVideoPlaybackUrl(videoId: string, storedObject?: string | null) {
  return storedObject ? getVideoMediaUrl(videoId, "source") : null
}

export function getVideoThumbnailUrl(videoId: string, storedObject?: string | null) {
  return storedObject ? getVideoMediaUrl(videoId, "thumbnail") : null
}

function decodeObjectKey(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function stripBucketPrefix(value: string) {
  return value.startsWith(`${VIDEO_BUCKET_NAME}/`) ? value.slice(VIDEO_BUCKET_NAME.length + 1) : value
}

function isSafeObjectKey(value: string) {
  return (
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.split("/").some((segment) => segment === "..")
  )
}

export function resolveStoredObjectKey(storedObject?: string | null) {
  const rawValue = storedObject?.trim()
  if (!rawValue) {
    return null
  }

  let objectKey = rawValue
  if (/^https?:\/\//i.test(rawValue)) {
    try {
      objectKey = new URL(rawValue).pathname
    } catch {
      return null
    }
  }

  objectKey = stripBucketPrefix(decodeObjectKey(objectKey.replace(/^\/+/, "")))
  return isSafeObjectKey(objectKey) ? objectKey : null
}

export function resolveVideoAssetObjectKey(
  video: { url: string | null; thumbnailUrl: string | null },
  asset: VideoMediaAsset,
) {
  const objectKey = resolveStoredObjectKey(asset === "source" ? video.url : video.thumbnailUrl)
  if (!objectKey) {
    return null
  }

  if (asset === "source" && objectKey.startsWith(MEDIA_OBJECT_PREFIXES.readyVideo)) {
    return objectKey
  }

  if (asset === "thumbnail" && objectKey.startsWith(MEDIA_OBJECT_PREFIXES.thumbnail)) {
    return objectKey
  }

  return null
}
