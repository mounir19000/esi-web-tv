import { test, expect } from '@playwright/test';
import { Role } from '@prisma/client';
import { cleanupTestUsers, createTestUser, login } from './helpers';

test.describe('Authentication', () => {
  test.describe.configure({ mode: 'serial' });

  const emails: string[] = [];

  test.afterEach(async () => {
    await cleanupTestUsers(emails.splice(0));
  });

  test('teacher can access dashboard', async ({ page }) => {
    const teacher = await createTestUser(Role.TEACHER, 'auth-teacher');
    emails.push(teacher.email);

    await login(page, teacher.email, teacher.password);

    // Teacher can go to dashboard
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.locator('h1')).toHaveText(`Welcome, ${teacher.name}`);
  });

  test('student cannot access upload page', async ({ page }) => {
    const student = await createTestUser(Role.STUDENT, 'auth-student');
    emails.push(student.email);

    await login(page, student.email, student.password);

    // Try going to upload
    await page.goto('/dashboard/upload');
    await expect(page).toHaveURL('http://localhost:3000/dashboard');
  });
});
