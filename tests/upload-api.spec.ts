import { test, expect } from "@playwright/test"
import { login, logout } from "./helpers"

const uploadPayload = {
  title: "API Upload Session",
  description: "Created by an API gate test.",
  type: "TEACHING",
  moduleId: "",
  isPublic: false,
  file: {
    name: "dummy.mp4",
    size: 1024,
    type: "video/mp4",
  },
}

test.describe("Upload API authorization", () => {
  test("anonymous users cannot initiate an upload", async ({ request }) => {
    const response = await request.post("/api/uploads", { data: uploadPayload })
    expect(response.status()).toBe(401)
  })

  test("students cannot initiate an upload", async ({ page }) => {
    await login(page, "student@esi.dz", "student")

    const response = await page.request.post("/api/uploads", { data: uploadPayload })
    expect(response.status()).toBe(403)
  })

  test("a different signed-in user cannot complete an upload session", async ({ page }) => {
    let sessionId: string | null = null

    await login(page, "teacher@esi.dz", "teacher")
    const createResponse = await page.request.post("/api/uploads", { data: uploadPayload })
    expect(createResponse.status()).toBe(200)
    sessionId = ((await createResponse.json()) as { sessionId: string }).sessionId

    await logout(page)
    await login(page, "admin@esi.dz", "admin")

    const completeResponse = await page.request.post(`/api/uploads/${sessionId}/complete`)
    expect(completeResponse.status()).toBe(403)

    await logout(page)
    await login(page, "teacher@esi.dz", "teacher")

    const abortResponse = await page.request.delete(`/api/uploads/${sessionId}`)
    expect(abortResponse.status()).toBe(200)
  })
})
