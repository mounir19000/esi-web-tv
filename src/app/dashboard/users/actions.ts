"use server"

import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { AuditEventType, ProvisioningStatus, Role, type Prisma } from "@prisma/client"
import { disableUserAccount, updateUserRoleAndRevokeSessions } from "@/lib/account-security"
import { recordAuditEvent } from "@/lib/audit"
import { requireAdmin } from "@/lib/current-user"

const validRoles = new Set<string>(Object.values(Role))
const validProvisioningStatuses = new Set<string>(Object.values(ProvisioningStatus))

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
  const actor = await requireAdmin()

  const name = String(formData.get("name") || "").trim()
  const email = String(formData.get("email") || "").trim().toLowerCase()
  const password = String(formData.get("password") || "")
  const role = String(formData.get("role") || "")
  const yearGroup = String(formData.get("yearGroup") || "").trim().toUpperCase()

  if (!name || !email || !password || !validRoles.has(role)) {
    throw new Error("Missing required fields")
  }

  const parsedRole = role as Role
  const normalizedYearGroup = normalizeYearGroup(parsedRole, yearGroup)

  if (!email.endsWith("@esi.dz")) {
    throw new Error("Only @esi.dz email addresses are allowed")
  }

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
  const actor = await requireAdmin()
  const id = String(formData.get("id") || "")
  const role = String(formData.get("role") || "")
  const provisioningStatus = String(formData.get("provisioningStatus") || ProvisioningStatus.APPROVED)
  const yearGroup = String(formData.get("yearGroup") || "").trim().toUpperCase()

  if (!id || !validRoles.has(role) || !validProvisioningStatuses.has(provisioningStatus)) {
    throw new Error("Missing required fields")
  }

  const parsedRole = role as Role
  const parsedProvisioningStatus = provisioningStatus as ProvisioningStatus
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
  await requireAdmin()
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

export async function disableUser(id: string) {
  const actor = await requireAdmin()

  if (actor.id === id) {
    throw new Error("Admins cannot disable their own account.")
  }

  await disableUserAccount(id, actor.id)
  revalidatePath("/dashboard/users")
}
