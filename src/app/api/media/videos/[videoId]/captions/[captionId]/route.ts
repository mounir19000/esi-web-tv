import { MediaAssetStatus, MediaAssetType, VideoStatus } from "@prisma/client"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/current-user"
import { authorizeVideoAccess } from "@/lib/video-authorization"
import { jsonMediaError, protectedMediaResponse } from "@/lib/media-delivery"

export const dynamic = "force-dynamic"

type CaptionRouteParams = {
  videoId: string
  captionId: string
}

export async function GET(_request: Request, context: { params: Promise<CaptionRouteParams> }) {
  const { videoId, captionId } = await context.params
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

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: captionId,
      videoId,
      type: MediaAssetType.CAPTION,
      status: MediaAssetStatus.READY,
    },
    select: { storageKey: true },
  })

  if (!asset) {
    return jsonMediaError("Caption not found", 404)
  }

  return protectedMediaResponse(videoId, asset.storageKey)
}
