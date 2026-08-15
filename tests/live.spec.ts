import { expect, test } from "@playwright/test"
import { AudienceType, Role, StreamStatus } from "@prisma/client"
import prisma from "../src/lib/prisma"
import { cleanupTestUsers, createTestUser, login } from "./helpers"

test.describe("Go Live Flow", () => {
  test.describe.configure({ mode: "serial" })

  const emails: string[] = []

  test.afterEach(async () => {
    await cleanupTestUsers(emails.splice(0))
  })

  test("teacher creates a provider-backed LiveKit room and token", async ({ page }) => {
    const title = `E2E Live Stream ${Date.now()}`
    const teacher = await createTestUser(Role.TEACHER, "live-teacher")
    emails.push(teacher.email)

    await login(page, teacher.email, teacher.password)

    await page.goto("/live/new")
    await expect(page.locator("h1")).toHaveText("Start a Live Broadcast")

    await page.fill('input[name="title"]', title)
    await page.fill("textarea[name=\"description\"]", "Streaming live right now.")
    await page.selectOption('select[name="audience"]', "PUBLIC")

    await page.getByRole("button", { name: "Go live now" }).click()

    await page.waitForURL(/\/live\/[a-zA-Z0-9-]+/)
    await expect(page.locator("h1")).toHaveText(title)

    const stream = await prisma.liveStream.findFirstOrThrow({
      where: { title },
      select: {
        id: true,
        hostId: true,
        streamKey: true,
        status: true,
        audience: true,
        isPublic: true,
        providerRoomId: true,
      },
    })
    expect(stream.hostId).toBe(teacher.id)
    expect(stream.status).toBe(StreamStatus.STARTING)
    expect(stream.audience).toBe(AudienceType.PUBLIC)
    expect(stream.isPublic).toBe(true)
    expect(stream.providerRoomId).toBeTruthy()

    const tokenResponse = await page.request.get(`/api/livekit/token?room=${stream.streamKey}`)
    expect(tokenResponse.status()).toBe(200)
    expect((await tokenResponse.json()) as { token?: string }).toMatchObject({ token: expect.any(String) })
  })
})
