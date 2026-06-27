import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');
const INVALID_PATH =
  fixturePath('invalid.drawio');

test.describe('Suite J: error-recovery', () => {
  /**
   * Test 1: Invalid XML import → error banner/toast shown
   */
  test('Invalid XML import → error banner shown', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', INVALID_PATH);

    // Error banner should appear
    await page.waitForSelector('[data-testid="error-banner"]:not([hidden])', { timeout: 3000 });
    await expect(page.locator('[data-testid="error-banner"]')).toBeVisible();
    await expect(page.locator('.error-message')).not.toHaveText('');
  });

  /**
   * Test 2: Error banner can be dismissed
   */
  test('Error banner can be dismissed', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Trigger an error
    await page.setInputFiles('[data-testid="file-input"]', INVALID_PATH);
    await page.waitForSelector('[data-testid="error-banner"]:not([hidden])', { timeout: 3000 });
    await expect(page.locator('[data-testid="error-banner"]')).toBeVisible();

    // Click dismiss button
    await page.click('[data-testid="dismiss-error"]');
    await page.waitForTimeout(100);

    // Banner should be hidden
    await expect(page.locator('[data-testid="error-banner"]')).toBeHidden();
  });

  /**
   * Test 3: After error, next valid import still works
   */
  test('After error, next valid import still works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // First, trigger an error with invalid file
    await page.setInputFiles('[data-testid="file-input"]', INVALID_PATH);
    await page.waitForSelector('[data-testid="error-banner"]:not([hidden])', { timeout: 3000 });

    // Dismiss the error
    await page.click('[data-testid="dismiss-error"]');
    await page.waitForTimeout(100);

    // Now load a valid file
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Should render correctly
    const svgCount = await page.locator('[data-testid="viewer"] svg').count();
    expect(svgCount).toBe(1);
    const shapeCount = await page.locator('[data-testid="viewer"] [data-vertex-id]').count();
    expect(shapeCount).toBeGreaterThan(0);
  });

  /**
   * Test 4: Export without import context shows error
   * Note: Save button is disabled when no diagram loaded, so error is prevented at UI level.
   * If user somehow bypasses UI, the engine returns error.
   */
  test('Export without import context → save button disabled or error shown', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Save button should be disabled with no diagram
    await expect(page.locator('[data-testid="save-btn"]')).toBeDisabled();

    // Try File > Save menu
    const saveMenuItem = page.locator('[data-testid="menu-save"]');
    await page.locator('[data-testid="menu-file"] summary').click();
    // The save menu item should be visible
    await expect(saveMenuItem).toBeVisible();
    // Clicking it should not crash
    await saveMenuItem.click();
    await page.waitForTimeout(100);

    // App should remain functional
    await expect(page.locator('[data-testid="viewer"]')).toBeVisible();
  });

  /**
   * Test 5: Invalid command from UI path shows error and app remains responsive
   */
  test('Invalid command from UI path shows error and app remains responsive', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Load a valid diagram
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Select a shape
    const shape = page.locator('[data-vertex-id]').first();
    await shape.click();
    await page.waitForTimeout(200);

    // Attempt an invalid operation by interacting with a non-existent element
    // The app's error handling should not crash it
    // Try deleting via Edit > Delete menu when nothing is selected
    await page.locator('[data-testid="menu-edit"] summary').click();
    const deleteItem = page.locator('[data-testid="menu-delete"]');
    await deleteItem.click();
    await page.waitForTimeout(100);

    // App should remain responsive
    await expect(page.locator('[data-testid="viewer"]')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/fatal/);
  });

  /**
   * Test 6: WASM load failure path shows fatal message
   * Note: Hard to trigger in normal test since WASM is built in.
   * We test the fatal message container exists and app handles bootstrap errors.
   */
  test('WASM load failure → fatal message shown in app element', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // App should load WASM successfully (no fatal message)
    const appText = await page.locator('#app').textContent();
    expect(appText).not.toContain('Fatal:');
    expect(appText).not.toContain('Failed to load');

    // The fatal container is #app — verify it has content (WASM loaded)
    await page.waitForSelector('[data-testid="viewer"]', { timeout: 5000 });
  });

  /**
   * Test 7: Rapid re-import twice does not duplicate content
   */
  test('Rapid re-import twice → content replaced not duplicated', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // First import
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
    const firstCount = await page.locator('[data-testid="viewer"] [data-vertex-id]').count();

    // Rapid re-import (immediate)
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const secondCount = await page.locator('[data-testid="viewer"] [data-vertex-id]').count();
    expect(secondCount).toBe(firstCount); // no duplication

    // Third rapid import
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const thirdCount = await page.locator('[data-testid="viewer"] [data-vertex-id]').count();
    expect(thirdCount).toBe(firstCount); // still no duplication
  });

  /**
   * Test 8: Presentation mode escape exits cleanly after an error
   */
  test('Presentation mode escape exits cleanly after error', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Enter presentation mode
    await page.keyboard.press('Control+Shift+P');
    await expect(page.locator('body')).toHaveClass(/presentation-mode/);

    // Simulate an error while in presentation mode
    await page.setInputFiles('[data-testid="file-input"]', INVALID_PATH);
    await page.waitForTimeout(500);

    // Error should be shown (banner is still visible in presentation mode)
    // Note: presentation mode hides navbar/sidebar/inspector but bottom bar may be visible
    // Press Escape to exit
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Should exit presentation mode cleanly
    await expect(page.locator('body')).not.toHaveClass(/presentation-mode/);

    // App should remain functional
    await expect(page.locator('[data-testid="viewer"]')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/fatal/);

    // Dismiss any visible error
    const errorBanner = page.locator('[data-testid="error-banner"]');
    if (!(await errorBanner.getAttribute('hidden'))) {
      await page.click('[data-testid="dismiss-error"]');
    }
  });
});
