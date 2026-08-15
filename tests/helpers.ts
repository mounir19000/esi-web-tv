import { expect, type Page } from "@playwright/test"
import { ProvisioningStatus, Role } from "@prisma/client"
import bcrypt from "bcryptjs"
import { randomUUID } from "node:crypto"
import prisma from "../src/lib/prisma"

export const e2ePassword = "E2eTestPassword1!"

export function uniqueTestEmail(label: string) {
  return `e2e-${label}-${randomUUID().slice(0, 8)}@esi.dz`
}

export async function createTestUser(role: Role, label: string, yearGroup: string | null = null) {
  const email = uniqueTestEmail(label)
  const hashedPassword = await bcrypt.hash(e2ePassword, 10)

  const user = await prisma.user.create({
    data: {
      name: `E2E ${label}`,
      email,
      password: hashedPassword,
      role,
      yearGroup: role === Role.STUDENT ? yearGroup ?? "1CP" : null,
      provisioningStatus: ProvisioningStatus.APPROVED,
      isActive: true,
      disabledAt: null,
    },
    select: { id: true, name: true, email: true },
  })

  if (role === Role.STUDENT) {
    const resolvedYearGroup = yearGroup ?? "1CP"
    const cohort = await prisma.cohort.upsert({
      where: { name: resolvedYearGroup },
      update: { yearGroup: resolvedYearGroup },
      create: { name: resolvedYearGroup, yearGroup: resolvedYearGroup },
    })
    const modules = await prisma.module.findMany({
      where: { yearGroup: resolvedYearGroup },
      select: { id: true },
    })

    await prisma.cohortMembership.create({
      data: { userId: user.id, cohortId: cohort.id },
    })
    await prisma.studentModuleEnrollment.createMany({
      data: modules.map((module) => ({ userId: user.id, moduleId: module.id })),
      skipDuplicates: true,
    })
  }

  if (role === Role.TEACHER) {
    const modules = await prisma.module.findMany({ select: { id: true } })
    await prisma.teacherModuleAssignment.createMany({
      data: modules.map((module) => ({ userId: user.id, moduleId: module.id })),
      skipDuplicates: true,
    })
  }

  return { ...user, password: e2ePassword }
}

export async function cleanupTestUsers(emails: string[]) {
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  })
  const userIds = users.map((user) => user.id)

  if (userIds.length === 0) {
    return
  }

  await prisma.auditEvent.deleteMany({
    where: {
      OR: [{ actorId: { in: userIds } }, { subjectId: { in: userIds } }],
    },
  })
  await prisma.liveStream.deleteMany({ where: { hostId: { in: userIds } } })
  await prisma.uploadSession.deleteMany({ where: { ownerId: { in: userIds } } })
  await prisma.video.deleteMany({ where: { uploaderId: { in: userIds } } })
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.account.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByText("Sign out")).toBeVisible()
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click()
  await expect(page.getByLabel("Main navigation").getByRole("link", { name: "Sign in" })).toBeVisible()
}
