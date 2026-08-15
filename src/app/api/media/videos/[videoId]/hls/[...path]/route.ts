import { MediaAssetStatus, MediaAssetType, VideoStatus } from "@prisma/client"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/current-user"
import { authorizeVideoAccess } from "@/lib/video-authorization"
import { resolveHlsObjectKey } from "@/lib/media"
import { jsonMediaError, protectedMediaResponse } from "@/lib/media-delivery"

export const dynamic = "force-dynamic"

type HlsRouteParams = {
  videoId: string
  path: string[]
}

const hlsAssetTypes: MediaAssetType[] = [
  MediaAssetType.HLS_MASTER,
  MediaAssetType.HLS_VARIANT_PLAYLIST,
  MediaAssetType.HLS_SEGMENT,
]

export async function GET(_request: Request, context: { params: Promise<HlsRouteParams> }) {
  const { videoId, path } = await context.params
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

  const storageKey = resolveHlsObjectKey(videoId, path.join("/"))
  if (!storageKey) {
    return jsonMediaError("Media asset not found", 404)
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      videoId,
      storageKey,
      type: { in: hlsAssetTypes },
      status: MediaAssetStatus.READY,
    },
    select: { storageKey: true },
  })

  if (!asset) {
    return jsonMediaError("Media asset not found", 404)
  }

  return protectedMediaResponse(videoId, asset.storageKey)
}
