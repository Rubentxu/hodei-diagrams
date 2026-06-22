import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';

/**
 * Suite: Inspector Shadow Effects
 * Tests the Shadow sub-section in the inspector Style pane.
 */
test.describe('Suite: inspector-shadow', () => {
  /**
   * Test 1: Shadow section exists and has required controls
   */
  test('Shadow section has all required controls', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Select the shape to reveal inspector controls
    await rect.click();
    await page.waitForTimeout(500);

    // Shadow section should exist
    const shadowSection = page.locator('[data-testid="inspector-shadow-section"]');
    await expect(shadowSection).toBeAttached();

    // All shadow controls should exist in the DOM
    await expect(page.locator('[data-testid="shadow-toggle"]')).toBeAttached();
    await expect(page.locator('[data-testid="shadow-dx-slider"]')).toBeAttached();
    await expect(page.locator('[data-testid="shadow-dy-slider"]')).toBeAttached();
    await expect(page.locator('[data-testid="shadow-blur-slider"]')).toBeAttached();
    await expect(page.locator('[data-testid="shadow-color-picker"]')).toBeAttached();
  });

  /**
   * Test 2: Shadow section is disabled when no shape selected
   */
  test('No selection → shadow section disabled', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Click on empty area to deselect
    const canvasContainer = page.locator('[data-testid="canvas-container"]');
    const canvasBox = await canvasContainer.boundingBox();
    await page.mouse.click(canvasBox!.x + 5, canvasBox!.y + 5);
    await page.waitForTimeout(300);

    // Shadow section should be disabled
    const shadowSection = page.locator('[data-testid="inspector-shadow-section"]');
    await expect(shadowSection).toHaveClass(/disabled/);
  });

  /**
   * Test 3: Shadow toggle is unchecked initially
   */
  test('Shadow toggle unchecked initially', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(500);

    // Shadow toggle should be unchecked
    const shadowToggle = page.locator('[data-testid="shadow-toggle"]');
    await expect(shadowToggle).not.toBeChecked();
  });

  /**
   * Test 4: Shadow section body is hidden when toggle is off
   */
  test('Shadow body hidden when toggle is off', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(500);

    // Shadow body should be hidden
    const shadowControls = page.locator('#shadow-controls');
    await expect(shadowControls).toBeHidden();
  });
});
