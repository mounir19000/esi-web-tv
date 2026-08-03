import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('teacher can access dashboard', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Sign In');
    // Assuming next-auth Credentials provider is used
    // This depends on the exact mock auth UI setup. We will navigate directly and verify if redirected.
    
    // Actually, in our mock auth, how does the user log in? 
    // They click "Sign In", go to /api/auth/signin, and fill a form.
    // Let's directly fill the credentials provider form.
    await page.fill('input[name="email"]', 'teacher@esi.dz');
    await page.fill('input[name="password"]', 'teacher');
    await page.click('button:has-text("Sign in with Credentials")');

    // Should be redirected to home page
    await expect(page.locator('text=Sign Out')).toBeVisible();

    // Teacher can go to dashboard
    await page.click('text=Dashboard');
    await expect(page.locator('h1')).toHaveText('Welcome, Mock TEACHER');
  });

  test('student cannot access upload page', async ({ page }) => {
    await page.goto('/api/auth/signin');
    await page.fill('input[name="email"]', 'student@esi.dz');
    await page.fill('input[name="password"]', 'student');
    await page.click('button:has-text("Sign in with Credentials")');

    await expect(page.locator('text=Sign Out')).toBeVisible();

    // Try going to upload
    const response = await page.goto('/dashboard/upload');
    // Next.js redirects unauthorized users
    expect(page.url()).toBe('http://localhost:3000/');
  });
});
