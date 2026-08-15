import prisma from "@/lib/prisma"
import { canViewScopedContent, type Viewer } from "@/lib/content-access"
import type { AudienceType } from "@prisma/client"

export type AuthorizedVideo = {
  id: string
  isPublic: boolean
  audience: AudienceType
  status: string
  url: string
  thumbnailUrl: string | null
  uploaderId: string
  moduleId: string | null
  cohortId: string | null
  module: {
    id: string
    yearGroup: string
  } | null
  audienceUsers: { userId: string }[]
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
      audience: true,
      status: true,
      url: true,
      thumbnailUrl: true,
      uploaderId: true,
      moduleId: true,
      cohortId: true,
      module: {
        select: {
          id: true,
          yearGroup: true,
        },
      },
      audienceUsers: {
        select: { userId: true },
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
