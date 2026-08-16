import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { AudienceType, MediaAssetStatus, MediaAssetType, Role, ThumbnailStatus, VideoStatus, VideoType } from "@prisma/client"
import prisma from "../src/lib/prisma"
import { cleanupTestUsers, createTestUser, login } from "./helpers"

async function expectNoHighImpactViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  const violations = result.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  )
  const summary = violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target),
  }))

  expect(summary).toEqual([])
}

async function expectValidMainLandmarks(page: Page) {
  await expect(page.locator("main#main-content")).toHaveCount(1)
  await expect(page.locator("main main")).toHaveCount(0)
}

test.describe("Accessibility", () => {
  test.describe.configure({ mode: "serial" })

  const emails: string[] = []

  test.afterEach(async () => {
    await cleanupTestUsers(emails.splice(0))
  })

  test("public pages have valid landmarks and no high-impact axe violations", async ({ page }) => {
    for (const path of ["/", "/explore", "/live", "/login"]) {
      await page.goto(path)
      await expectValidMainLandmarks(page)
      await expectNoHighImpactViolations(page)
    }
  })

  test("skip link and mobile navigation work from the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")

    await page.keyboard.press("Tab")
    const skipLink = page.getByRole("link", { name: "Skip to main content" })
    await expect(skipLink).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.locator("#main-content")).toBeFocused()

    const menuButton = page.locator("button[aria-controls='primary-navigation']")
    await expect(menuButton).toHaveAccessibleName("Open main navigation")
    await menuButton.focus()
    await page.keyboard.press("Enter")
    await expect(menuButton).toHaveAttribute("aria-expanded", "true")
    await expect(menuButton).toHaveAccessibleName("Close main navigation")
    const navigation = page.getByRole("navigation", { name: "Main navigation" })
    await expect(navigation).toBeVisible()
    await expect(navigation.getByRole("link", { name: "Explore", exact: true })).toBeFocused()

    await page.keyboard.press("Escape")
    await expect(menuButton).toHaveAttribute("aria-expanded", "false")
    await expect(menuButton).toHaveAccessibleName("Open main navigation")
    await expect(menuButton).toBeFocused()
  })

  test("authenticated workflows have no high-impact axe violations", async ({ page }) => {
    const teacher = await createTestUser(Role.TEACHER, "a11y-teacher")
    emails.push(teacher.email)

    await login(page, teacher.email, teacher.password)

    for (const path of ["/dashboard", "/dashboard/upload", "/live/new"]) {
      await page.goto(path)
      await expectValidMainLandmarks(page)
      await expectNoHighImpactViolations(page)
    }
  })

  test("admin user management has no high-impact axe violations", async ({ page }) => {
    const admin = await createTestUser(Role.ADMIN, "a11y-admin")
    emails.push(admin.email)

    await login(page, admin.email, admin.password)
    await page.goto("/dashboard/users")

    await expectValidMainLandmarks(page)
    await expectNoHighImpactViolations(page)
  })

  test("captioned videos expose labeled WebVTT tracks", async ({ page }) => {
    const teacher = await createTestUser(Role.TEACHER, "a11y-caption")
    emails.push(teacher.email)
    const video = await prisma.video.create({
      data: {
        title: `A11y Caption Fixture ${Date.now()}`,
        description: "A public video with a selectable caption track.",
        type: VideoType.TEACHING,
        isPublic: true,
        audience: AudienceType.PUBLIC,
        status: VideoStatus.READY,
        url: "videos/a11y-caption/source.mp4",
        sourceKey: "videos/a11y-caption/source.mp4",
        thumbnailStatus: ThumbnailStatus.SKIPPED,
        uploaderId: teacher.id,
        mediaAssets: {
          create: {
            type: MediaAssetType.CAPTION,
            status: MediaAssetStatus.READY,
            storageKey: `captions/${Date.now()}/english.vtt`,
            contentType: "text/vtt; charset=utf-8",
            sizeBytes: BigInt(46),
            checksumSha256: "0".repeat(64),
            language: "en",
            label: "English",
            isDefault: true,
          },
        },
      },
      select: { id: true },
    })

    await page.goto(`/video/${video.id}`)
    await expectValidMainLandmarks(page)
    const track = page.locator("video track[kind='captions']")
    await expect(track).toHaveCount(1)
    await expect(track).toHaveAttribute("srclang", "en")
    await expect(track).toHaveAttribute("label", "English")
    await expectNoHighImpactViolations(page)
  })
})
