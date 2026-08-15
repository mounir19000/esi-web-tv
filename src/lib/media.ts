import { VIDEO_BUCKET_NAME } from "@/lib/minio"
import path from "node:path"

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

export function getVideoHlsUrl(videoId: string, hlsPath = "master.m3u8") {
  return `/api/media/videos/${encodeURIComponent(videoId)}/hls/${encodeHlsPath(hlsPath)}`
}

export function getVideoCaptionUrl(videoId: string, captionId: string) {
  return `/api/media/videos/${encodeURIComponent(videoId)}/captions/${encodeURIComponent(captionId)}`
}

export function getVideoPlaybackUrl(videoId: string, storedObject?: string | null) {
  if (!storedObject) {
    return null
  }

  return isHlsManifestObjectKey(storedObject)
    ? getVideoHlsUrl(videoId)
    : getVideoMediaUrl(videoId, "source")
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

export function isHlsManifestObjectKey(value: string) {
  return value.endsWith(".m3u8") && value.includes("/hls/")
}

function encodeHlsPath(hlsPath: string) {
  return hlsPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

export function resolveHlsObjectKey(videoId: string, hlsPath: string) {
  const normalizedPath = path.posix.normalize(hlsPath.replace(/^\/+/, ""))
  if (
    !normalizedPath ||
    normalizedPath === "." ||
    normalizedPath.startsWith("../") ||
    normalizedPath.includes("/../") ||
    normalizedPath.includes("\\")
  ) {
    return null
  }

  return `${MEDIA_OBJECT_PREFIXES.readyVideo}${videoId}/hls/${normalizedPath}`
}

export function rewriteHlsPlaylist(videoId: string, playlistPath: string, playlist: string) {
  const playlistDir = path.posix.dirname(playlistPath)

  return playlist
    .split(/\r?\n/)
    .map((line) => {
      const trimmedLine = line.trim()
      if (!trimmedLine || trimmedLine.startsWith("#")) {
        return line
      }

      if (/^[a-z][a-z0-9+.-]*:/i.test(trimmedLine)) {
        return line
      }

      const [uriPath, uriQuery = ""] = trimmedLine.split("?", 2)
      const relativePath = path.posix.normalize(path.posix.join(playlistDir, uriPath))
      if (relativePath.startsWith("../") || relativePath.includes("/../")) {
        return line
      }

      const rewritten = getVideoHlsUrl(videoId, relativePath)
      return uriQuery ? `${rewritten}?${uriQuery}` : rewritten
    })
    .join("\n")
}

export function resolveStoredObjectKey(storedObject?: string | null) {
  const rawValue = storedObject?.trim()
  if (!rawValue) {
    return null
  }

  const schemeMatch = rawValue.match(/^([a-z][a-z0-9+.-]*):/i)
  if (schemeMatch && !/^https?:\/\//i.test(rawValue)) {
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
