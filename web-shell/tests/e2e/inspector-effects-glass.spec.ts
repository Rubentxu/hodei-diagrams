import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

/**
 * Suite: Inspector Glass Effects
 * Tests the Glass sub-section in the inspector Style pane.
 */
test.describe('Suite: inspector-glass', () => {
  /**
   * Test 1: Glass section exists and has required controls
   */
  test('Glass section has all required controls', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Select the shape to reveal inspector controls
    await rect.click();
    await page.waitForTimeout(500);

    // Glass section should exist
    const glassSection = page.locator('[data-testid="inspector-glass-section"]');
    await expect(glassSection).toBeAttached();

    // All glass controls should exist in the DOM
    await expect(page.locator('[data-testid="glass-toggle"]')).toBeAttached();
    await expect(page.locator('[data-testid="glass-opacity-slider"]')).toBeAttached();
  });

  /**
   * Test 2: Glass section is disabled when no shape selected
   */
  test('No selection → glass section disabled', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Deselect via Escape key (reliable — avoids click coords hitting shape at origin)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Glass section should be disabled
    const glassSection = page.locator('[data-testid="inspector-glass-section"]');
    await expect(glassSection).toHaveClass(/disabled/);
  });

  /**
   * Test 3: Glass toggle is unchecked initially
   */
  test('Glass toggle unchecked initially', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(500);

    // Glass toggle should be unchecked
    const glassToggle = page.locator('[data-testid="glass-toggle"]');
    await expect(glassToggle).not.toBeChecked();
  });

  /**
   * Test 4: Glass section body is hidden when toggle is off
   */
  test('Glass body hidden when toggle is off', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(500);

    // Glass body should be hidden
    const glassControls = page.locator('#glass-controls');
    await expect(glassControls).toBeHidden();
  });

  /**
   * Test 5: Glass section body is visible when toggle is on
   */
  test('Glass body visible when toggle is on', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(500);

    // Click the glass toggle via JS (input has pointer-events:none + may be visually hidden)
    await page.evaluate(() => {
      const toggle = document.querySelector('[data-testid="glass-toggle"]') as HTMLInputElement;
      if (toggle) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);

    // Glass body should now be visible
    const glassControls = page.locator('#glass-controls');
    await expect(glassControls).toBeVisible();
  });

  /**
   * Test 6: Glass opacity slider updates value display
   */
  test('Glass opacity slider updates value display', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(500);

    // Enable glass first via JS
    await page.evaluate(() => {
      const toggle = document.querySelector('[data-testid="glass-toggle"]') as HTMLInputElement;
      if (toggle) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);

    // Change opacity slider
    const slider = page.locator('[data-testid="glass-opacity-slider"]');
    await slider.fill('0.75');
    await page.waitForTimeout(100);

    // Value display should update
    const valueDisplay = page.locator('#glass-controls .slider-value');
    await expect(valueDisplay).toHaveText('0.75');
  });
});
