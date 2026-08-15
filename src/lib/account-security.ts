import { AuditEventType, ProvisioningStatus, Role, type Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { recordAuditEvent } from "@/lib/audit"

type SessionRevocationReason = Extract<
  AuditEventType,
  "PASSWORD_RESET" | "ROLE_CHANGE" | "USER_DISABLE"
>

export async function revokeUserSessions(
  userId: string,
  actorId: string | null,
  reason: SessionRevocationReason,
) {
  const user = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
      select: { id: true, sessionVersion: true },
    })

    await tx.session.deleteMany({ where: { userId } })

    return updatedUser
  })

  await recordAuditEvent({
    type: AuditEventType.SESSION_REVOKE,
    actorId,
    subjectId: userId,
    metadata: { reason },
  })

  return user
}

export async function disableUserAccount(userId: string, actorId: string) {
  const disabledAt = new Date()

  const disabledUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        disabledAt,
        sessionVersion: { increment: 1 },
      },
      select: { id: true, email: true, role: true, sessionVersion: true },
    })

    await tx.session.deleteMany({ where: { userId } })
    await tx.auditEvent.create({
      data: {
        type: AuditEventType.USER_DISABLE,
        actorId,
        subjectId: userId,
        metadata: {
          email: user.email,
          role: user.role,
        },
      },
    })
    await tx.auditEvent.create({
      data: {
        type: AuditEventType.SESSION_REVOKE,
        actorId,
        subjectId: userId,
        metadata: { reason: AuditEventType.USER_DISABLE },
      },
    })

    return user
  })

  return disabledUser
}

export async function updateUserRoleAndRevokeSessions(
  userId: string,
  actorId: string,
  role: Role,
  yearGroup: string | null,
  provisioningStatus: ProvisioningStatus = ProvisioningStatus.APPROVED,
) {
  const updatedUser = await prisma.$transaction(async (tx) => {
    const previousUser = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true, yearGroup: true, provisioningStatus: true },
    })

    const user = await tx.user.update({
      where: { id: userId },
      data: {
        role,
        yearGroup,
        provisioningStatus,
        sessionVersion: { increment: 1 },
      },
      select: { id: true, role: true, yearGroup: true, provisioningStatus: true, sessionVersion: true },
    })

    await tx.session.deleteMany({ where: { userId } })
    await tx.auditEvent.create({
      data: {
        type: AuditEventType.ROLE_CHANGE,
        actorId,
        subjectId: userId,
        metadata: {
          from: {
            role: previousUser.role,
            yearGroup: previousUser.yearGroup,
            provisioningStatus: previousUser.provisioningStatus,
          },
          to: {
            role: user.role,
            yearGroup: user.yearGroup,
            provisioningStatus: user.provisioningStatus,
          },
        } satisfies Prisma.InputJsonValue,
      },
    })
    await tx.auditEvent.create({
      data: {
        type: AuditEventType.SESSION_REVOKE,
        actorId,
        subjectId: userId,
        metadata: { reason: AuditEventType.ROLE_CHANGE },
      },
    })

    return user
  })

  return updatedUser
}
