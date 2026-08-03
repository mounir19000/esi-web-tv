import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Authentication', () => {
  test('teacher can access dashboard', async ({ page }) => {
    await login(page, 'teacher@esi.dz', 'teacher');

    // Teacher can go to dashboard
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.locator('h1')).toHaveText('Welcome, Test Teacher');
  });

  test('student cannot access upload page', async ({ page }) => {
    await login(page, 'student@esi.dz', 'student');

    // Try going to upload
    await page.goto('/dashboard/upload');
    await expect(page).toHaveURL('http://localhost:3000/dashboard');
  });
});
