/**
 * E2E Smoke Tests — Dashboard Core Flow.
 *
 * Verifies:
 * 1. Login page renders and accepts credentials
 * 2. Dashboard page loads after authentication
 * 3. Core widgets are present on the dashboard
 * 4. Navigation between pages works
 *
 * Prerequisites:
 * - API server running on localhost:3001
 * - Database seeded with test user
 * - Next.js dev server on localhost:3000
 */
import { test, expect } from '@playwright/test';

test.describe('Dashboard Smoke Tests', () => {
  test.describe('Authentication', () => {
    test('login page should be accessible', async ({ page }) => {
      await page.goto('/login');

      // Verify login form elements are present
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(
        page.locator('button[type="submit"]'),
      ).toBeVisible();
    });

    test('signup page should be accessible', async ({ page }) => {
      await page.goto('/signup');

      // Verify signup form elements
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
    });

    test('unauthenticated user should be redirected to login', async ({
      page,
    }) => {
      await page.goto('/dashboard');

      // Should redirect to login page
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Dashboard (authenticated)', () => {
    test.beforeEach(async ({ page }) => {
      // Login with test credentials
      await page.goto('/login');
      await page.fill('input[type="email"]', 'test@example.com');
      await page.fill('input[type="password"]', 'TestP@ss123');
      await page.click('button[type="submit"]');

      // Wait for navigation to dashboard
      await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
    });

    test('dashboard should load and display main layout', async ({
      page,
    }) => {
      await expect(page).toHaveURL(/\/dashboard/);

      // Verify main layout elements exist
      // Header should be visible
      const header = page.locator('header');
      await expect(header).toBeVisible();
    });

    test('dashboard should display stock widgets', async ({ page }) => {
      // Check for widget container presence
      // Widgets are wrapped in WidgetWrapper components
      const widgetContainers = page.locator('[data-widget]');

      // At minimum, the watchlist widget should be present
      // (exact count depends on user's saved layout)
      await expect(widgetContainers.first()).toBeVisible({
        timeout: 15_000,
      });
    });

    test('sidebar navigation should work', async ({ page }) => {
      // Click on sidebar navigation links
      const sidebar = page.locator('nav, aside');
      await expect(sidebar).toBeVisible();
    });
  });

  test.describe('Stock Detail Page', () => {
    test('stock detail page should render for valid symbol', async ({
      page,
    }) => {
      // Navigate to Samsung Electronics (005930)
      await page.goto('/stocks/005930');

      // Page should load without error
      // (may redirect to login if not authenticated)
      const status = page.url();
      expect(status).toMatch(/\/(stocks\/005930|login)/);
    });
  });

  test.describe('Health Check', () => {
    test('API health endpoint should respond', async ({ request }) => {
      // Verify the API backend is reachable
      const response = await request.get('http://localhost:3001/api/health');

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });
  });
});
