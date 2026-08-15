import { auth } from "@/auth"
import { minioClient, VIDEO_BUCKET_NAME } from "@/lib/minio"
import { isVideoMediaAsset, resolveVideoAssetObjectKey } from "@/lib/media"
import { authorizeVideoAccess } from "@/lib/video-authorization"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type MediaRouteParams = {
  videoId: string
  asset: string
}

const defaultSignedUrlTtlSeconds = 60
const minSignedUrlTtlSeconds = 15
const maxSignedUrlTtlSeconds = 15 * 60
const noStoreHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
}

function getSignedUrlTtlSeconds() {
  const configuredTtl = Number.parseInt(process.env.MEDIA_SIGNED_URL_TTL_SECONDS || "", 10)
  if (!Number.isFinite(configuredTtl)) {
    return defaultSignedUrlTtlSeconds
  }

  return Math.min(Math.max(configuredTtl, minSignedUrlTtlSeconds), maxSignedUrlTtlSeconds)
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStoreHeaders })
}

export async function GET(_request: Request, context: { params: Promise<MediaRouteParams> }) {
  const { videoId, asset } = await context.params
  if (!isVideoMediaAsset(asset)) {
    return jsonError("Media asset not found", 404)
  }

  const session = await auth()
  const access = await authorizeVideoAccess(videoId, session?.user)

  if (access.status === "not-found") {
    return jsonError("Video not found", 404)
  }

  if (access.status === "unauthenticated") {
    return jsonError("Sign in required", 401)
  }

  if (access.status === "forbidden") {
    return jsonError("Forbidden", 403)
  }

  const objectKey = resolveVideoAssetObjectKey(access.video, asset)
  if (!objectKey) {
    return jsonError("Media asset not found", 404)
  }

  const signedUrlTtlSeconds = getSignedUrlTtlSeconds()
  const signedUrl = await minioClient.presignedGetObject(VIDEO_BUCKET_NAME, objectKey, signedUrlTtlSeconds, {
    "response-cache-control": `private, max-age=${signedUrlTtlSeconds}`,
  })

  const response = NextResponse.redirect(signedUrl, 307)
  Object.entries(noStoreHeaders).forEach(([header, value]) => {
    response.headers.set(header, value)
  })
  return response
}
