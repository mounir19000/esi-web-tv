import { isVideoMediaAsset, resolveVideoAssetObjectKey } from "@/lib/media"
import { authorizeVideoAccess } from "@/lib/video-authorization"
import { getCurrentUser } from "@/lib/current-user"
import { jsonMediaError, protectedMediaResponse } from "@/lib/media-delivery"
import { VideoStatus } from "@prisma/client"

export const dynamic = "force-dynamic"

type MediaRouteParams = {
  videoId: string
  asset: string
}

export async function GET(_request: Request, context: { params: Promise<MediaRouteParams> }) {
  const { videoId, asset } = await context.params
  if (!isVideoMediaAsset(asset)) {
    return jsonMediaError("Media asset not found", 404)
  }

  const user = await getCurrentUser()
  const access = await authorizeVideoAccess(videoId, user)

  if (access.status === "not-found") {
    return jsonMediaError("Video not found", 404)
  }

  if (access.status === "unauthenticated") {
    return jsonMediaError("Sign in required", 401)
  }

  if (access.status === "forbidden") {
    return jsonMediaError("Forbidden", 403)
  }

  if (access.video.status !== VideoStatus.READY) {
    return jsonMediaError("Media asset not found", 404)
  }

  const objectKey = resolveVideoAssetObjectKey(access.video, asset)
  if (!objectKey) {
    return jsonMediaError("Media asset not found", 404)
  }

  return protectedMediaResponse(videoId, objectKey)
}
