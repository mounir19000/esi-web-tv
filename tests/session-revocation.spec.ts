import "dotenv/config"

import { test, expect } from "@playwright/test"
import { AuditEventType, Role } from "@prisma/client"
import bcrypt from "bcryptjs"
import { randomUUID } from "node:crypto"
import { disableUserAccount, revokeUserSessions, updateUserRoleAndRevokeSessions } from "../src/lib/account-security"
import prisma from "../src/lib/prisma"
import { login } from "./helpers"

const password = "SessionRevocation1!"
const createdEmails = new Set<string>()

const uploadPayload = {
  title: "Revocation API Upload",
  description: "This request should never reach storage after revocation.",
  type: "TEACHING",
  moduleId: "",
  isPublic: false,
  file: {
    name: "revocation.mp4",
    size: 1024,
    type: "video/mp4",
  },
}

function uniqueEmail(label: string) {
  const email = `issue5-${label}-${randomUUID().slice(0, 8)}@esi.dz`
  createdEmails.add(email)
  return email
}

async function cleanupUsers(emails: string[]) {
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

async function createLocalUser(role: Role, label: string, yearGroup: string | null = null) {
  const email = uniqueEmail(label)
  const hashedPassword = await bcrypt.hash(password, 10)

  const user = await prisma.user.create({
    data: {
      name: `Issue 5 ${label}`,
      email,
      password: hashedPassword,
      role,
      yearGroup,
      isActive: true,
      disabledAt: null,
    },
    select: { id: true, email: true },
  })

  return { ...user, password }
}

test.describe("session revocation", () => {
  test.describe.configure({ mode: "serial" })

  test.afterAll(async () => {
    await cleanupUsers([...createdEmails])
    await prisma.$disconnect()
  })

  test("disabled teacher's already-open tab cannot upload or request LiveKit tokens", async ({ page }) => {
    const actor = await createLocalUser(Role.ADMIN, "disable-actor")
    const teacher = await createLocalUser(Role.TEACHER, "disabled-teacher")
    const stream = await prisma.liveStream.create({
      data: {
        title: "Revoked teacher stream",
        description: "A private stream owned by the soon-disabled teacher.",
        isLive: true,
        isPublic: false,
        hostId: teacher.id,
      },
      select: { streamKey: true },
    })

    await login(page, teacher.email, teacher.password)

    const tokenBeforeDisable = await page.request.get(`/api/livekit/token?room=${stream.streamKey}`)
    expect(tokenBeforeDisable.status()).toBe(200)

    await disableUserAccount(teacher.id, actor.id)

    const uploadAfterDisable = await page.request.post("/api/uploads", { data: uploadPayload })
    expect(uploadAfterDisable.status()).toBe(401)

    const tokenAfterDisable = await page.request.get(`/api/livekit/token?room=${stream.streamKey}`)
    expect(tokenAfterDisable.status()).toBe(401)

    const eventTypes = await prisma.auditEvent.findMany({
      where: { subjectId: teacher.id },
      select: { type: true },
    })
    expect(eventTypes.map((event) => event.type)).toEqual(
      expect.arrayContaining([AuditEventType.USER_DISABLE, AuditEventType.SESSION_REVOKE]),
    )
  })

  test("password-reset revocation invalidates an already-open teacher session", async ({ page }) => {
    const actor = await createLocalUser(Role.ADMIN, "reset-actor")
    const teacher = await createLocalUser(Role.TEACHER, "reset-teacher")

    await login(page, teacher.email, teacher.password)
    await revokeUserSessions(teacher.id, actor.id, AuditEventType.PASSWORD_RESET)

    const uploadAfterReset = await page.request.post("/api/uploads", { data: uploadPayload })
    expect(uploadAfterReset.status()).toBe(401)

    const revokeEvent = await prisma.auditEvent.findFirst({
      where: {
        subjectId: teacher.id,
        type: AuditEventType.SESSION_REVOKE,
      },
      select: { metadata: true },
    })
    expect(revokeEvent?.metadata).toMatchObject({ reason: AuditEventType.PASSWORD_RESET })
  })

  test("admin demotion denies actions submitted from an already-loaded users page", async ({ page }) => {
    const actor = await createLocalUser(Role.ADMIN, "demotion-actor")
    const admin = await createLocalUser(Role.ADMIN, "demoted-admin")
    const attemptedEmail = uniqueEmail("forbidden-create")

    await login(page, admin.email, admin.password)
    await page.goto("/dashboard/users")
    await expect(page.locator("h1")).toHaveText("User Management")

    await updateUserRoleAndRevokeSessions(admin.id, actor.id, Role.STUDENT, "1CP")

    const createPanel = page.locator("aside.panel")
    await createPanel.locator('input[name="name"]').fill("Forbidden Create")
    await createPanel.locator('input[name="email"]').fill(attemptedEmail)
    await createPanel.locator('input[name="password"]').fill("ShouldNotMatter1!")
    await createPanel.locator('select[name="role"]').selectOption("TEACHER")

    const deniedResponse = page.waitForResponse((response) => {
      return response.request().method() === "POST" && response.url().includes("/dashboard/users")
    })
    await createPanel.getByRole("button", { name: "Create user" }).click()
    await deniedResponse

    await expect
      .poll(() => prisma.user.count({ where: { email: attemptedEmail } }))
      .toBe(0)

    await page.goto("/dashboard/users")
    expect(page.url()).not.toContain("/dashboard/users")

    const eventTypes = await prisma.auditEvent.findMany({
      where: { subjectId: admin.id },
      select: { type: true },
    })
    expect(eventTypes.map((event) => event.type)).toEqual(
      expect.arrayContaining([AuditEventType.ROLE_CHANGE, AuditEventType.SESSION_REVOKE]),
    )
  })
})
