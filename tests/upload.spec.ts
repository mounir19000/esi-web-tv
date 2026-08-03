import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Video Upload Flow', () => {
  test('teacher can upload a video', async ({ page }) => {
    // 1. Log in as teacher
    await page.goto('/api/auth/signin');
    await page.fill('input[name="email"]', 'teacher@esi.dz');
    await page.fill('input[name="password"]', 'teacher');
    await page.click('button:has-text("Sign in with Credentials")');

    // Wait for redirect to home
    await expect(page.locator('text=Sign Out')).toBeVisible();

    // 2. Go to upload page
    await page.goto('/dashboard/upload');
    await expect(page.locator('h1')).toHaveText('Upload Video');

    // 3. Fill out the upload form
    await page.fill('input[name="title"]', 'E2E Test Video: Next.js');
    await page.fill('textarea[name="description"]', 'This is a test video uploaded via Playwright.');
    
    // Select a Video Type
    await page.selectOption('select[name="type"]', 'TEACHING');
    
    // Upload the dummy video file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, 'dummy.mp4'));

    // 4. Submit form
    await page.click('button:has-text("Upload & Process")');

    // 5. Verify redirection to explore page and presence of video
    await page.waitForURL('**/explore');
    await expect(page.locator('h1').first()).toHaveText('Explore Videos');
    
    // The video should be in the grid
    await expect(page.locator('text=E2E Test Video: Next.js').first()).toBeVisible();
  });
});
