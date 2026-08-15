import { VideoStatus, type Prisma, type Role } from "@prisma/client"
import type { Session } from "next-auth"

export type Viewer = Session["user"] | undefined | null

type ModuleScope = {
  yearGroup: string
} | null

type ScopedContent = {
  isPublic: boolean
  module?: ModuleScope
  hostId?: string
  uploaderId?: string
}

export function isEducator(role?: Role | null) {
  return role === "TEACHER" || role === "ADMIN"
}

export function canManageUserContent(contentOwnerId: string, viewer: Viewer) {
  return Boolean(viewer && (viewer.role === "ADMIN" || viewer.id === contentOwnerId))
}

export function canViewScopedContent(content: ScopedContent, viewer: Viewer) {
  if (content.isPublic) {
    return true
  }

  if (!viewer) {
    return false
  }

  if (viewer.role === "ADMIN") {
    return true
  }

  if (content.hostId && content.hostId === viewer.id) {
    return true
  }

  if (content.uploaderId && content.uploaderId === viewer.id) {
    return true
  }

  if (viewer.role === "TEACHER") {
    return true
  }

  return Boolean(
    viewer.role === "STUDENT" &&
      viewer.yearGroup &&
      content.module?.yearGroup === viewer.yearGroup,
  )
}

export function visibleVideoWhere(viewer: Viewer): Prisma.VideoWhereInput {
  const readyVideoWhere: Prisma.VideoWhereInput = { status: VideoStatus.READY }

  if (viewer?.role === "ADMIN" || viewer?.role === "TEACHER") {
    return readyVideoWhere
  }

  if (viewer?.role === "STUDENT" && viewer.yearGroup) {
    return {
      AND: [
        readyVideoWhere,
        { OR: [{ isPublic: true }, { module: { yearGroup: viewer.yearGroup } }] },
      ],
    }
  }

  return { AND: [readyVideoWhere, { isPublic: true }] }
}

export function visibleLiveStreamWhere(viewer: Viewer): Prisma.LiveStreamWhereInput {
  if (viewer?.role === "ADMIN" || viewer?.role === "TEACHER") {
    return {}
  }

  if (viewer?.role === "STUDENT" && viewer.yearGroup) {
    return {
      OR: [{ isPublic: true }, { module: { yearGroup: viewer.yearGroup } }],
    }
  }

  return { isPublic: true }
}
