import { test, expect } from '@playwright/test';

test.describe('Go Live Flow', () => {
  test('teacher can configure a live stream', async ({ page }) => {
    // 1. Log in as teacher
    await page.goto('/api/auth/signin');
    await page.fill('input[name="email"]', 'teacher@esi.dz');
    await page.fill('input[name="password"]', 'teacher');
    await page.click('button:has-text("Sign in with Credentials")');

    // Wait for redirect to home
    await expect(page.locator('text=Sign Out')).toBeVisible();

    // 2. Go to Go Live page
    await page.goto('/live/new');
    await expect(page.locator('h1')).toHaveText('Start a Live Broadcast');

    // 3. Fill out the form
    await page.fill('input[name="title"]', 'E2E Live Stream: Algorithms');
    await page.fill('textarea[name="description"]', 'Streaming live right now.');

    // 4. Submit
    await page.click('button:has-text("Go Live Now")');

    // 5. Verify redirect to the live broadcast room
    await page.waitForURL(/\/live\/[a-zA-Z0-9-]+/);
    await expect(page.locator('h1:has-text("Live Room:")')).toBeVisible();
  });
});
