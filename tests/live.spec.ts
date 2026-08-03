import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Go Live Flow', () => {
  test('teacher can configure a live stream', async ({ page }) => {
    // 1. Log in as teacher
    await login(page, 'teacher@esi.dz', 'teacher');

    // 2. Go to Go Live page
    await page.goto('/live/new');
    await expect(page.locator('h1')).toHaveText('Start a Live Broadcast');

    // 3. Fill out the form
    await page.fill('input[name="title"]', 'E2E Live Stream: Algorithms');
    await page.fill('textarea[name="description"]', 'Streaming live right now.');

    // 4. Submit
    await page.click('button:has-text("Go live now")');

    // 5. Verify redirect to the live broadcast room
    await page.waitForURL(/\/live\/[a-zA-Z0-9-]+/);
    await expect(page.locator('h1')).toHaveText('E2E Live Stream: Algorithms');
  });
});
