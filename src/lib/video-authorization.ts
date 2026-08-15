import prisma from "@/lib/prisma"
import { canViewScopedContent, type Viewer } from "@/lib/content-access"

export type AuthorizedVideo = {
  id: string
  isPublic: boolean
  status: string
  url: string
  thumbnailUrl: string | null
  uploaderId: string
  module: {
    yearGroup: string
  } | null
}

export type VideoAccessResult =
  | { status: "authorized"; video: AuthorizedVideo }
  | { status: "not-found" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }

export async function authorizeVideoAccess(videoId: string, viewer: Viewer): Promise<VideoAccessResult> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      isPublic: true,
      status: true,
      url: true,
      thumbnailUrl: true,
      uploaderId: true,
      module: {
        select: {
          yearGroup: true,
        },
      },
    },
  })

  if (!video) {
    return { status: "not-found" }
  }

  if (!canViewScopedContent(video, viewer)) {
    return { status: viewer ? "forbidden" : "unauthenticated" }
  }

  return { status: "authorized", video }
}
