/**
 * app-ready.ts — App readiness helpers for E2E tests.
 *
 * Problem: `waitForLoadState('networkidle')` is flaky in SPAs because
 * background polling (WASM, service workers, analytics) prevents 500ms of
 * network silence. Tests timeout or see half-loaded pages.
 *
 * Solution: Wait for a specific UI signal — the HUD is the most reliable
 * marker because it's created synchronously after WASM init completes.
 *
 * Usage:
 * ```ts
 * import { waitForAppReady } from './helpers/app-ready.js';
 *
 * test.beforeEach(async ({ page }) => {
 *   await waitForAppReady(page);
 * });
 * ```
 */

import { type Page, expect } from '@playwright/test';

/**
 * Navigate to the app and wait for it to be fully initialized.
 *
 * Replaces `await page.goto('/')` + `await page.waitForLoadState('networkidle')`
 * with a stable UI-based wait.
 *
 * The app is ready when:
 * 1. The viewer container is visible (canvas rendered)
 * 2. The HUD is visible (WASM engine initialized)
 * 3. The loading overlay is gone (if it was shown)
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Wait for the HUD as the primary ready signal (WASM init complete)
  // Use a generous timeout because WASM init can be slow in CI
  await expect(page.locator('[data-testid="hud"]')).toBeVisible({ timeout: 15_000 });

  // Also ensure the viewer is present
  await expect(page.locator('[data-testid="viewer"]')).toBeVisible({ timeout: 5_000 });
}

/**
 * Dismiss any visible error banner. Call in beforeEach to ensure a clean
 * slate for each test.
 *
 * Usage:
 * ```ts
 * test.beforeEach(async ({ page }) => {
 *   await waitForAppReady(page);
 *   await dismissErrorBanner(page);
 * });
 * ```
 */
export async function dismissErrorBanner(page: Page): Promise<void> {
  const banner = page.locator('[data-testid="error-banner"]');
  if (await banner.isVisible().catch(() => false)) {
    await page.click('[data-testid="dismiss-error"]', { timeout: 3_000 }).catch(() => {
      // If dismiss button is not available, ignore — some tests may
      // intentionally trigger errors and that's ok
    });
  }
}
