import type { Prisma, Role } from "@prisma/client"
import type { Session } from "next-auth"

type Viewer = Session["user"] | undefined | null

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
