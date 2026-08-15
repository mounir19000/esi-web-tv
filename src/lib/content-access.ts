import { AudienceType, ProvisioningStatus, VideoStatus, type Prisma, type Role } from "@prisma/client"

export type Viewer = {
  id?: string | null
  role?: Role | null
  yearGroup?: string | null
  provisioningStatus?: ProvisioningStatus | null
  moduleEnrollments?: { moduleId: string }[] | null
  teacherAssignments?: { moduleId: string; canPublish?: boolean | null; canManage?: boolean | null }[] | null
  cohortMemberships?: { cohortId: string }[] | null
} | undefined | null

type ScopedContent = {
  isPublic: boolean
  audience?: AudienceType | null
  moduleId?: string | null
  cohortId?: string | null
  module?: { id?: string | null } | null
  hostId?: string | null
  uploaderId?: string | null
  audienceUsers?: { userId: string }[] | null
  liveStreamAudienceUsers?: { userId: string }[] | null
}

export type AudienceSelection = {
  audience: AudienceType
  moduleId?: string | null
  cohortId?: string | null
}

export function isEducator(role?: Role | null) {
  return role === "TEACHER" || role === "ADMIN"
}

function isApproved(viewer: Viewer) {
  return Boolean(
    viewer &&
      (viewer.provisioningStatus === undefined ||
        viewer.provisioningStatus === null ||
        viewer.provisioningStatus === ProvisioningStatus.APPROVED),
  )
}

function isApprovedMember(viewer: Viewer) {
  return Boolean(viewer && isApproved(viewer) && viewer.role && viewer.role !== "GUEST")
}

function audienceFor(content: ScopedContent) {
  if (content.audience) {
    return content.audience
  }

  if (content.isPublic) {
    return AudienceType.PUBLIC
  }

  return content.module || content.moduleId ? AudienceType.MODULE : AudienceType.ESI
}

function moduleIdFor(content: ScopedContent) {
  return content.moduleId ?? content.module?.id ?? null
}

function selectedUserIds(content: ScopedContent) {
  return [
    ...(content.audienceUsers ?? []),
    ...(content.liveStreamAudienceUsers ?? []),
  ].map((entry) => entry.userId)
}

export function viewerEnrolledModuleIds(viewer: Viewer) {
  return [...new Set((viewer?.moduleEnrollments ?? []).map((enrollment) => enrollment.moduleId))]
}

export function viewerAssignedModuleIds(viewer: Viewer, capability: "view" | "publish" | "manage" = "view") {
  return [
    ...new Set(
      (viewer?.teacherAssignments ?? [])
        .filter((assignment) => {
          if (capability === "publish") {
            return assignment.canPublish !== false
          }

          if (capability === "manage") {
            return assignment.canManage !== false
          }

          return true
        })
        .map((assignment) => assignment.moduleId),
    ),
  ]
}

export function viewerCohortIds(viewer: Viewer) {
  return [...new Set((viewer?.cohortMemberships ?? []).map((membership) => membership.cohortId))]
}

export function viewerAccessibleModuleIds(viewer: Viewer) {
  return [...new Set([...viewerEnrolledModuleIds(viewer), ...viewerAssignedModuleIds(viewer)])]
}

export function canManageUserContent(contentOwnerId: string, viewer: Viewer) {
  return Boolean(
    viewer &&
      isApproved(viewer) &&
      (viewer.role === "ADMIN" || (viewer.id === contentOwnerId && isEducator(viewer.role))),
  )
}

export function canViewScopedContent(content: ScopedContent, viewer: Viewer) {
  const audience = audienceFor(content)

  if (audience === AudienceType.PUBLIC || content.isPublic) {
    return true
  }

  if (!viewer || !isApproved(viewer)) {
    return false
  }

  if (viewer.role === "ADMIN") {
    return true
  }

  if ((content.hostId && content.hostId === viewer.id) || (content.uploaderId && content.uploaderId === viewer.id)) {
    return true
  }

  if (!isApprovedMember(viewer)) {
    return false
  }

  if (audience === AudienceType.ESI) {
    return true
  }

  if (audience === AudienceType.MODULE) {
    const moduleId = moduleIdFor(content)
    return Boolean(moduleId && viewerAccessibleModuleIds(viewer).includes(moduleId))
  }

  if (audience === AudienceType.COHORT) {
    return Boolean(content.cohortId && viewerCohortIds(viewer).includes(content.cohortId))
  }

  if (audience === AudienceType.SELECTED_USERS) {
    return Boolean(viewer.id && selectedUserIds(content).includes(viewer.id))
  }

  return false
}

export function canPublishToAudience(viewer: Viewer, selection: AudienceSelection) {
  if (!viewer || !isApproved(viewer)) {
    return false
  }

  if (viewer.role === "ADMIN") {
    return true
  }

  if (viewer.role !== "TEACHER") {
    return false
  }

  if (selection.audience === AudienceType.PUBLIC || selection.audience === AudienceType.ESI) {
    return true
  }

  if (selection.audience === AudienceType.MODULE) {
    return Boolean(
      selection.moduleId &&
        viewerAssignedModuleIds(viewer, "publish").includes(selection.moduleId),
    )
  }

  return false
}

export function validateAudienceSelection(selection: AudienceSelection) {
  if (selection.audience === AudienceType.MODULE && !selection.moduleId) {
    return "Module audience requires a selected module."
  }

  if (selection.audience === AudienceType.COHORT && !selection.cohortId) {
    return "Cohort audience requires a selected cohort."
  }

  if (selection.audience !== AudienceType.MODULE && selection.audience !== AudienceType.COHORT && selection.cohortId) {
    return "Cohort can only be set for cohort audience."
  }

  return null
}

function viewerVideoAccessPredicates(viewer: Viewer): Prisma.VideoWhereInput[] {
  const publicPredicates: Prisma.VideoWhereInput[] = [{ audience: AudienceType.PUBLIC }, { isPublic: true }]
  if (!viewer || !isApproved(viewer)) {
    return publicPredicates
  }

  if (viewer.role === "ADMIN") {
    return []
  }

  const moduleIds = viewerAccessibleModuleIds(viewer)
  const cohortIds = viewerCohortIds(viewer)
  const allowed: Prisma.VideoWhereInput[] = [...publicPredicates]

  if (viewer.id) {
    allowed.push({ uploaderId: viewer.id })
  }

  if (isApprovedMember(viewer)) {
    allowed.push({ audience: AudienceType.ESI })
  }

  if (moduleIds.length > 0) {
    allowed.push({ audience: AudienceType.MODULE, moduleId: { in: moduleIds } })
  }

  if (cohortIds.length > 0) {
    allowed.push({ audience: AudienceType.COHORT, cohortId: { in: cohortIds } })
  }

  if (viewer.id) {
    allowed.push({
      audience: AudienceType.SELECTED_USERS,
      audienceUsers: { some: { userId: viewer.id } },
    })
  }

  return allowed
}

function viewerLiveStreamAccessPredicates(viewer: Viewer): Prisma.LiveStreamWhereInput[] {
  const publicPredicates: Prisma.LiveStreamWhereInput[] = [{ audience: AudienceType.PUBLIC }, { isPublic: true }]
  if (!viewer || !isApproved(viewer)) {
    return publicPredicates
  }

  if (viewer.role === "ADMIN") {
    return []
  }

  const moduleIds = viewerAccessibleModuleIds(viewer)
  const cohortIds = viewerCohortIds(viewer)
  const allowed: Prisma.LiveStreamWhereInput[] = [...publicPredicates]

  if (viewer.id) {
    allowed.push({ hostId: viewer.id })
  }

  if (isApprovedMember(viewer)) {
    allowed.push({ audience: AudienceType.ESI })
  }

  if (moduleIds.length > 0) {
    allowed.push({ audience: AudienceType.MODULE, moduleId: { in: moduleIds } })
  }

  if (cohortIds.length > 0) {
    allowed.push({ audience: AudienceType.COHORT, cohortId: { in: cohortIds } })
  }

  if (viewer.id) {
    allowed.push({
      audience: AudienceType.SELECTED_USERS,
      liveStreamAudienceUsers: { some: { userId: viewer.id } },
    })
  }

  return allowed
}

export function visibleVideoWhere(viewer: Viewer): Prisma.VideoWhereInput {
  const predicates = viewerVideoAccessPredicates(viewer)
  return predicates.length === 0
    ? { status: VideoStatus.READY }
    : { AND: [{ status: VideoStatus.READY }, { OR: predicates }] }
}

export function visibleLiveStreamWhere(viewer: Viewer): Prisma.LiveStreamWhereInput {
  const predicates = viewerLiveStreamAccessPredicates(viewer)
  return predicates.length === 0 ? {} : { OR: predicates }
}
