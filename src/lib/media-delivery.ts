import { Readable } from "node:stream"
import { NextResponse } from "next/server"
import { appConfig } from "@/lib/env"
import { getMinioClient, VIDEO_BUCKET_NAME } from "@/lib/minio"
import { MEDIA_OBJECT_PREFIXES, rewriteHlsPlaylist } from "@/lib/media"

const defaultSignedUrlTtlSeconds = 60
const minSignedUrlTtlSeconds = 15
const maxSignedUrlTtlSeconds = 15 * 60

export const protectedMediaHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
}

function getSignedUrlTtlSeconds() {
  return Math.min(
    Math.max(appConfig.media.signedUrlTtlSeconds || defaultSignedUrlTtlSeconds, minSignedUrlTtlSeconds),
    maxSignedUrlTtlSeconds,
  )
}

function hlsPathFromStorageKey(videoId: string, storageKey: string) {
  const prefix = `${MEDIA_OBJECT_PREFIXES.readyVideo}${videoId}/hls/`
  return storageKey.startsWith(prefix) ? storageKey.slice(prefix.length) : "master.m3u8"
}

function isPlaylist(storageKey: string) {
  return storageKey.endsWith(".m3u8")
}

function isAppStreamedAsset(storageKey: string) {
  return storageKey.endsWith(".ts") || storageKey.startsWith(MEDIA_OBJECT_PREFIXES.caption)
}

function contentTypeForStorageKey(storageKey: string) {
  if (storageKey.endsWith(".ts")) {
    return "video/mp2t"
  }

  if (storageKey.endsWith(".vtt")) {
    return "text/vtt; charset=utf-8"
  }

  return "application/octet-stream"
}

async function streamToString(stream: Readable) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString("utf8")
}

export function jsonMediaError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: protectedMediaHeaders })
}

export async function protectedMediaResponse(videoId: string, storageKey: string) {
  if (isPlaylist(storageKey)) {
    const objectStream = await getMinioClient().getObject(VIDEO_BUCKET_NAME, storageKey) as Readable
    const playlist = await streamToString(objectStream)
    const rewrittenPlaylist = rewriteHlsPlaylist(videoId, hlsPathFromStorageKey(videoId, storageKey), playlist)

    return new NextResponse(rewrittenPlaylist, {
      status: 200,
      headers: {
        ...protectedMediaHeaders,
        "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      },
    })
  }

  if (isAppStreamedAsset(storageKey)) {
    const minioClient = getMinioClient()
    const [objectInfo, objectStream] = await Promise.all([
      minioClient.statObject(VIDEO_BUCKET_NAME, storageKey),
      minioClient.getObject(VIDEO_BUCKET_NAME, storageKey),
    ])

    return new NextResponse(Readable.toWeb(objectStream) as ReadableStream, {
      status: 200,
      headers: {
        ...protectedMediaHeaders,
        "Content-Type": contentTypeForStorageKey(storageKey),
        "Content-Length": String(objectInfo.size),
      },
    })
  }

  const signedUrlTtlSeconds = getSignedUrlTtlSeconds()
  const signedUrl = await getMinioClient().presignedGetObject(VIDEO_BUCKET_NAME, storageKey, signedUrlTtlSeconds, {
    "response-cache-control": `private, max-age=${signedUrlTtlSeconds}`,
  })

  const response = NextResponse.redirect(signedUrl, 307)
  Object.entries(protectedMediaHeaders).forEach(([header, value]) => {
    response.headers.set(header, value)
  })
  return response
}
