"use server"

import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { AuditEventType, Role } from "@prisma/client"
import { disableUserAccount, updateUserRoleAndRevokeSessions } from "@/lib/account-security"
import { recordAuditEvent } from "@/lib/audit"
import { requireAdmin } from "@/lib/current-user"

const validRoles = new Set<string>(Object.values(Role))

function normalizeYearGroup(role: Role, yearGroup: string) {
  if (role !== Role.STUDENT) {
    return null
  }

  if (!yearGroup) {
    throw new Error("Students need a year group")
  }

  return yearGroup
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

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: parsedRole,
      yearGroup: normalizedYearGroup,
      isActive: true,
    }
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
  const yearGroup = String(formData.get("yearGroup") || "").trim().toUpperCase()

  if (!id || !validRoles.has(role)) {
    throw new Error("Missing required fields")
  }

  const parsedRole = role as Role
  const normalizedYearGroup = normalizeYearGroup(parsedRole, yearGroup)

  if (actor.id === id) {
    throw new Error("Admins cannot change their own role.")
  }

  await updateUserRoleAndRevokeSessions(id, actor.id, parsedRole, normalizedYearGroup)
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
