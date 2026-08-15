import { expect, test } from "@playwright/test"
import { AudienceType, Role, UploadSessionState } from "@prisma/client"
import path from "node:path"
import prisma from "../src/lib/prisma"
import {
  cleanupTestUsers,
  createTestUser,
  login,
  processVideoToReady,
  waitForVideoByTitle,
} from "./helpers"

test.describe("Video upload and media delivery", () => {
  test.describe.configure({ mode: "serial" })

  const emails: string[] = []

  test.afterEach(async () => {
    await cleanupTestUsers(emails.splice(0))
  })

  test("teacher upload reaches READY and protected media is authorized", async ({ page, request }) => {
    const title = `E2E Ready Upload ${Date.now()}`
    const teacher = await createTestUser(Role.TEACHER, "upload-teacher")
    emails.push(teacher.email)

    await login(page, teacher.email, teacher.password)

    await page.goto("/dashboard/upload")
    await expect(page.locator("h1")).toHaveText("Upload Video")

    await page.fill('input[name="title"]', title)
    await page.fill("textarea[name=\"description\"]", "This is a processed upload created by Playwright.")
    await page.selectOption('select[name="type"]', "TEACHING")
    await page.selectOption('select[name="audience"]', "ESI")
    await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "dummy.mp4"))

    await page.getByRole("button", { name: "Upload and process" }).click()
    await page.waitForURL(/\/video\/[a-zA-Z0-9-]+/)

    const uploadedVideo = await waitForVideoByTitle(title)
    expect(uploadedVideo.uploaderId).toBe(teacher.id)
    expect(uploadedVideo.audience).toBe(AudienceType.ESI)
    expect(uploadedVideo.sourceKey).toMatch(/^staging\//)

    const uploadSession = await prisma.uploadSession.findFirst({
      where: { videoId: uploadedVideo.id },
      select: { state: true, completedAt: true },
    })
    expect(uploadSession?.state).toBe(UploadSessionState.COMPLETED)
    expect(uploadSession?.completedAt).toBeTruthy()

    const readyVideo = await processVideoToReady(uploadedVideo.id)
    await page.reload()
    await expect(page.locator("h1").first()).toHaveText(title)
    await expect(page.locator(".video-player")).toBeVisible()

    const signedInManifest = await page.request.get(`/api/media/videos/${readyVideo.id}/hls/master.m3u8`)
    expect(signedInManifest.status()).toBe(200)
    expect(signedInManifest.headers()["cache-control"]).toContain("private")
    expect(await signedInManifest.text()).toContain("#EXTM3U")

    const anonymousManifest = await request.get(`/api/media/videos/${readyVideo.id}/hls/master.m3u8`)
    expect(anonymousManifest.status()).toBe(401)

    await prisma.video.update({
      where: { id: readyVideo.id },
      data: { audience: AudienceType.PUBLIC, isPublic: true },
    })

    const publicManifest = await request.get(`/api/media/videos/${readyVideo.id}/hls/master.m3u8`)
    expect(publicManifest.status()).toBe(200)
  })
})
