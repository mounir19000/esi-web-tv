import { expect, test } from "@playwright/test"
import { AudienceType, Role, UploadSessionState } from "@prisma/client"
import prisma from "../src/lib/prisma"
import { cleanupTestUsers, createTestUser, getSeededModule, login, logout } from "./helpers"

const uploadPayload = {
  title: "API Upload Session",
  description: "Created by an API gate test.",
  type: "TEACHING",
  moduleId: "",
  audience: AudienceType.ESI,
  file: {
    name: "dummy.mp4",
    size: 1024,
    type: "video/mp4",
  },
}

test.describe("Upload API authorization", () => {
  test.describe.configure({ mode: "serial" })

  const emails: string[] = []

  test.afterEach(async () => {
    await cleanupTestUsers(emails.splice(0))
  })

  test("anonymous users cannot initiate an upload", async ({ request }) => {
    const response = await request.post("/api/uploads", { data: uploadPayload })
    expect(response.status()).toBe(401)
  })

  test("students cannot initiate an upload", async ({ page }) => {
    const student = await createTestUser(Role.STUDENT, "upload-api-student")
    emails.push(student.email)

    await login(page, student.email, student.password)

    const response = await page.request.post("/api/uploads", { data: uploadPayload })
    expect(response.status()).toBe(403)
  })

  test("invalid upload payloads return field errors without creating sessions", async ({ page }) => {
    const teacher = await createTestUser(Role.TEACHER, "upload-api-validation")
    emails.push(teacher.email)

    await login(page, teacher.email, teacher.password)

    const response = await page.request.post("/api/uploads", {
      data: {
        ...uploadPayload,
        title: "",
        audience: "NOT_A_REAL_AUDIENCE",
        file: { ...uploadPayload.file, type: "video/quicktime" },
      },
    })

    expect(response.status()).toBe(400)
    const body = (await response.json()) as { fieldErrors?: Record<string, string> }
    expect(body.fieldErrors).toMatchObject({
      title: expect.any(String),
      audience: expect.any(String),
    })

    await expect
      .poll(() => prisma.uploadSession.count({ where: { ownerId: teacher.id } }))
      .toBe(0)
  })

  test("teachers cannot publish to unassigned modules", async ({ page }) => {
    const teacher = await createTestUser(Role.TEACHER, "upload-api-module")
    const seededModule = await getSeededModule("1CP")
    emails.push(teacher.email)

    await prisma.teacherModuleAssignment.deleteMany({
      where: { userId: teacher.id, moduleId: seededModule.id },
    })
    await login(page, teacher.email, teacher.password)

    const response = await page.request.post("/api/uploads", {
      data: {
        ...uploadPayload,
        audience: AudienceType.MODULE,
        moduleId: seededModule.id,
      },
    })

    expect(response.status()).toBe(403)
    expect(await response.json()).toMatchObject({ error: "You cannot publish to that audience" })
  })

  test("a different signed-in user cannot complete an upload session", async ({ page }) => {
    let sessionId: string | null = null
    const teacher = await createTestUser(Role.TEACHER, "upload-api-teacher")
    const admin = await createTestUser(Role.ADMIN, "upload-api-admin")
    emails.push(teacher.email, admin.email)

    await login(page, teacher.email, teacher.password)
    const createResponse = await page.request.post("/api/uploads", { data: uploadPayload })
    expect(createResponse.status()).toBe(200)
    sessionId = ((await createResponse.json()) as { sessionId: string }).sessionId

    await expect
      .poll(async () => {
        const session = await prisma.uploadSession.findUnique({ where: { id: sessionId || "" } })
        return session?.state
      })
      .toBe(UploadSessionState.UPLOADING)

    await logout(page)
    await login(page, admin.email, admin.password)

    const completeResponse = await page.request.post(`/api/uploads/${sessionId}/complete`)
    expect(completeResponse.status()).toBe(403)

    await logout(page)
    await login(page, teacher.email, teacher.password)

    const abortResponse = await page.request.delete(`/api/uploads/${sessionId}`)
    expect(abortResponse.status()).toBe(200)
  })
})
