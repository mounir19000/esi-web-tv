import { expect, type Page } from "@playwright/test"

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
