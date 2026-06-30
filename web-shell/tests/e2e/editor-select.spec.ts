import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

test.describe('Editor: click-to-select', () => {
  test('click on a shape selects it', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Click on the rect element (at center of 80x40 rect at 10,20)
    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();

    // Check that .selected class was applied
    await expect(rect).toHaveClass(/selected/);
  });

  test('re-importing clears previous selection', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Select a shape
    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();
    await expect(rect).toHaveClass(/selected/);

    // Re-import same file — innerHTML reset clears selection highlight
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // After re-render, the old DOM element is gone; new rect should not be selected
    const newRect = viewer.locator('[data-vertex-id]').first();
    await expect(newRect).not.toHaveClass(/selected/);
  });
});
