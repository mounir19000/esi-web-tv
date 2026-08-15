import "dotenv/config"

import { defineConfig, devices } from "@playwright/test"
import { e2eEnv, e2ePort } from "./tests/e2e-env"

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  globalTeardown: "./tests/global-teardown.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: e2eEnv.NEXTAUTH_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npx tsx tests/e2e-prepare.ts && npm run dev -- --hostname 127.0.0.1 --port ${e2ePort}`,
    env: e2eEnv,
    url: e2eEnv.NEXTAUTH_URL,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "true",
  },
})
