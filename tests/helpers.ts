import { expect, type Page } from "@playwright/test"
import { Role } from "@prisma/client"
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
      isActive: true,
      disabledAt: null,
    },
    select: { id: true, name: true, email: true },
  })

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
