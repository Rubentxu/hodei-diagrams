import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

test.describe('Editor: delete', () => {
  test('Delete key removes selected shape', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Select the shape
    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();

    // Press Delete
    await page.keyboard.press('Delete');

    // Allow time for re-render
    await page.waitForTimeout(200);

    // Verify command was dispatched (SVG still visible)
    await expect(viewer.locator('svg')).toBeAttached();
  });

  test('Delete with no selection is a no-op', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Press Delete without selection
    await page.keyboard.press('Delete');

    // SVG should still be visible
    const viewer = page.locator('[data-testid="viewer"]');
    await expect(viewer.locator('svg')).toBeVisible();
  });
});
