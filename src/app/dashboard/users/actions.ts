"use server"

import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { AuditEventType, ProvisioningStatus, Role, type Prisma } from "@prisma/client"
import { disableUserAccount, revokeUserSessions, updateUserRoleAndRevokeSessions } from "@/lib/account-security"
import { recordAuditEvent } from "@/lib/audit"
import { requireAdmin } from "@/lib/current-user"
import { checkRateLimit } from "@/lib/rate-limit"
import {
  boundedText,
  normalizeEsiEmail,
  parseProvisioningStatus,
  parseRole,
  validatePassword,
  validationLimits,
  type FieldErrors,
} from "@/lib/validation"

const adminMutationLimit = 60
const adminMutationWindowMs = 60_000

async function requireAdminMutation() {
  const actor = await requireAdmin()
  const result = checkRateLimit(`admin-mutation:${actor.id}`, adminMutationLimit, adminMutationWindowMs)
  if (!result.allowed) {
    throw new Error(`Too many admin changes. Try again in ${result.retryAfterSeconds} seconds.`)
  }

  return actor
}

function normalizeYearGroup(role: Role, yearGroup: string) {
  if (role !== Role.STUDENT) {
    return null
  }

  if (!yearGroup) {
    throw new Error("Students need a year group")
  }

  return yearGroup
}

async function syncLegacyStudentScope(
  tx: Prisma.TransactionClient,
  userId: string,
  role: Role,
  yearGroup: string | null,
) {
  if (role !== Role.STUDENT || !yearGroup) {
    await tx.cohortMembership.deleteMany({ where: { userId } })
    await tx.studentModuleEnrollment.deleteMany({ where: { userId } })
    return
  }

  const cohort = await tx.cohort.upsert({
    where: { name: yearGroup },
    update: { yearGroup },
    create: { name: yearGroup, yearGroup },
  })
  const modules = await tx.module.findMany({
    where: { yearGroup },
    select: { id: true },
  })

  await tx.cohortMembership.deleteMany({ where: { userId } })
  await tx.studentModuleEnrollment.deleteMany({ where: { userId } })
  await tx.cohortMembership.create({
    data: { userId, cohortId: cohort.id },
  })

  if (modules.length > 0) {
    await tx.studentModuleEnrollment.createMany({
      data: modules.map((module) => ({ userId, moduleId: module.id })),
      skipDuplicates: true,
    })
  }
}

function formIds(formData: FormData, name: string) {
  return [...new Set(formData.getAll(name).map((value) => String(value || "").trim()).filter(Boolean))]
}

export async function createUser(formData: FormData) {
  const actor = await requireAdminMutation()
  const errors: FieldErrors = {}
  const name = boundedText("name", formData.get("name"), validationLimits.nameMax, errors, true)
  const email = normalizeEsiEmail(formData.get("email"), errors)
  const password = validatePassword(formData.get("password"), errors)
  const parsedRole = parseRole(formData.get("role"), errors)
  const yearGroup = boundedText("yearGroup", formData.get("yearGroup"), validationLimits.yearGroupMax, errors).toUpperCase()

  if (!parsedRole || Object.keys(errors).length > 0) {
    throw new Error("Missing required fields")
  }

  const normalizedYearGroup = normalizeYearGroup(parsedRole, yearGroup)

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    throw new Error("Email already in use")
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: parsedRole,
        yearGroup: normalizedYearGroup,
        provisioningStatus: ProvisioningStatus.APPROVED,
        isActive: true,
      },
    })
    await syncLegacyStudentScope(tx, createdUser.id, parsedRole, normalizedYearGroup)
    return createdUser
  })

  await recordAuditEvent({
    type: AuditEventType.USER_CREATE,
    actorId: actor.id,
    subjectId: user.id,
    metadata: { email: user.email, role: user.role },
  })

  revalidatePath("/dashboard/users")
}

export async function updateUserRole(formData: FormData) {
  const actor = await requireAdminMutation()
  const id = String(formData.get("id") || "")
  const errors: FieldErrors = {}
  const parsedRole = parseRole(formData.get("role"), errors)
  const parsedProvisioningStatus = parseProvisioningStatus(
    formData.get("provisioningStatus") || ProvisioningStatus.APPROVED,
    errors,
  )
  const yearGroup = boundedText("yearGroup", formData.get("yearGroup"), validationLimits.yearGroupMax, errors).toUpperCase()

  if (!id || !parsedRole || !parsedProvisioningStatus || Object.keys(errors).length > 0) {
    throw new Error("Missing required fields")
  }

  const normalizedYearGroup = normalizeYearGroup(parsedRole, yearGroup)

  if (actor.id === id) {
    throw new Error("Admins cannot change their own role.")
  }

  await updateUserRoleAndRevokeSessions(id, actor.id, parsedRole, normalizedYearGroup, parsedProvisioningStatus)
  await prisma.$transaction(async (tx) => {
    await syncLegacyStudentScope(tx, id, parsedRole, normalizedYearGroup)
    if (parsedRole !== Role.TEACHER) {
      await tx.teacherModuleAssignment.deleteMany({ where: { userId: id } })
    }
  })
  revalidatePath("/dashboard/users")
}

export async function updateUserAssignments(formData: FormData) {
  await requireAdminMutation()
  const userId = String(formData.get("id") || "")
  const cohortIds = formIds(formData, "cohortId")
  const studentModuleIds = formIds(formData, "studentModuleId")
  const teacherModuleIds = formIds(formData, "teacherModuleId")

  if (!userId) {
    throw new Error("Missing user")
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })

  if (!user) {
    throw new Error("User was not found")
  }

  await prisma.$transaction(async (tx) => {
    await tx.cohortMembership.deleteMany({ where: { userId } })
    if (cohortIds.length > 0) {
      await tx.cohortMembership.createMany({
        data: cohortIds.map((cohortId) => ({ userId, cohortId })),
        skipDuplicates: true,
      })
    }

    await tx.studentModuleEnrollment.deleteMany({ where: { userId } })
    if (user.role === Role.STUDENT && studentModuleIds.length > 0) {
      await tx.studentModuleEnrollment.createMany({
        data: studentModuleIds.map((moduleId) => ({ userId, moduleId })),
        skipDuplicates: true,
      })
    }

    await tx.teacherModuleAssignment.deleteMany({ where: { userId } })
    if (user.role === Role.TEACHER && teacherModuleIds.length > 0) {
      await tx.teacherModuleAssignment.createMany({
        data: teacherModuleIds.map((moduleId) => ({ userId, moduleId })),
        skipDuplicates: true,
      })
    }
  })
  revalidatePath("/dashboard/users")
}

function requireConfirmation(formData: FormData) {
  if (formData.get("confirm") !== "on") {
    throw new Error("Confirm this action before submitting.")
  }
}

export async function disableUser(formData: FormData) {
  const actor = await requireAdminMutation()
  const id = String(formData.get("id") || "")
  requireConfirmation(formData)

  if (actor.id === id) {
    throw new Error("Admins cannot disable their own account.")
  }

  await disableUserAccount(id, actor.id)
  revalidatePath("/dashboard/users")
}

export async function enableUser(id: string) {
  const actor = await requireAdminMutation()

  if (actor.id === id) {
    throw new Error("Admins cannot enable their own account.")
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id },
      data: {
        isActive: true,
        disabledAt: null,
        sessionVersion: { increment: 1 },
      },
      select: { email: true, role: true },
    })

    await tx.auditEvent.create({
      data: {
        type: AuditEventType.USER_DISABLE,
        actorId: actor.id,
        subjectId: id,
        metadata: {
          enabled: true,
          email: user.email,
          role: user.role,
        },
      },
    })
  })
  revalidatePath("/dashboard/users")
}

export async function resetUserPassword(formData: FormData) {
  const actor = await requireAdminMutation()
  const id = String(formData.get("id") || "")
  const errors: FieldErrors = {}
  const password = validatePassword(formData.get("password"), errors)

  if (!id || Object.keys(errors).length > 0) {
    throw new Error(errors.password || "Missing required fields")
  }

  if (actor.id === id) {
    throw new Error("Admins cannot reset their own password here.")
  }

  const hashedPassword = await bcrypt.hash(password, 10)
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        password: hashedPassword,
        sessionVersion: { increment: 1 },
      },
    })
    await tx.session.deleteMany({ where: { userId: id } })
    await tx.auditEvent.create({
      data: {
        type: AuditEventType.PASSWORD_RESET,
        actorId: actor.id,
        subjectId: id,
      },
    })
    await tx.auditEvent.create({
      data: {
        type: AuditEventType.SESSION_REVOKE,
        actorId: actor.id,
        subjectId: id,
        metadata: { reason: AuditEventType.PASSWORD_RESET },
      },
    })
  })
  revalidatePath("/dashboard/users")
}

export async function revokeUserSessionsAction(formData: FormData) {
  const actor = await requireAdminMutation()
  const id = String(formData.get("id") || "")
  requireConfirmation(formData)
  if (!id) {
    throw new Error("Missing user")
  }

  if (actor.id === id) {
    throw new Error("Admins cannot revoke their own sessions here.")
  }

  await revokeUserSessions(id, actor.id, AuditEventType.ROLE_CHANGE)
  revalidatePath("/dashboard/users")
}
