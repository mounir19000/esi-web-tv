import { expect, test } from "@playwright/test"
import { Role } from "@prisma/client"
import { cleanupTestUsers, createTestUser, login } from "./helpers"

test.describe("Authentication", () => {
  test.describe.configure({ mode: "serial" })

  const emails: string[] = []

  test.afterEach(async () => {
    await cleanupTestUsers(emails.splice(0))
  })

  test("teacher can access educator dashboard actions", async ({ page }) => {
    const teacher = await createTestUser(Role.TEACHER, "auth-teacher")
    emails.push(teacher.email)

    await login(page, teacher.email, teacher.password)

    await page.getByRole("link", { name: "Dashboard" }).click()
    await expect(page.locator("h1")).toHaveText(`Welcome, ${teacher.name}`)
    await expect(page.getByRole("link", { name: "Upload video" })).toBeVisible()
    await expect(page.locator("main").getByRole("link", { name: "Go live", exact: true })).toBeVisible()
  })

  test("student cannot access educator-only upload page", async ({ page }) => {
    const student = await createTestUser(Role.STUDENT, "auth-student")
    emails.push(student.email)

    await login(page, student.email, student.password)

    await page.goto("/dashboard/upload")
    await expect(page).toHaveURL("/dashboard")
    await expect(page.getByRole("link", { name: "Upload video" })).toHaveCount(0)
  })
})
