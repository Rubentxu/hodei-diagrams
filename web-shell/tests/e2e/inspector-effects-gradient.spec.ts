import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

/**
 * Suite: Inspector Gradient Effects
 * Tests the Gradient sub-section in the inspector Style pane.
 */
test.describe('Suite: inspector-gradient', () => {
  /**
   * Test 1: Gradient section exists and has required controls
   */
  test('Gradient section has all required controls', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Select the shape to reveal inspector controls
    await rect.click();
    await page.waitForTimeout(500);

    // Gradient section should exist
    const gradientSection = page.locator('[data-testid="inspector-gradient-section"]');
    await expect(gradientSection).toBeAttached();

    // All gradient controls should exist in the DOM
    await expect(page.locator('[data-testid="gradient-toggle"]')).toBeAttached();
    await expect(page.locator('[data-testid="gradient-type-select"]')).toBeAttached();
    await expect(page.locator('[data-testid="gradient-angle-slider"]')).toBeAttached();
    await expect(page.locator('[data-testid="gradient-color-1"]')).toBeAttached();
    await expect(page.locator('[data-testid="gradient-color-2"]')).toBeAttached();
  });

  /**
   * Test 2: Gradient section is disabled when no shape selected
   */
  test('No selection → gradient section disabled', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Deselect via Escape key (reliable — avoids click coords hitting shape at origin)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Gradient section should be disabled
    const gradientSection = page.locator('[data-testid="inspector-gradient-section"]');
    await expect(gradientSection).toHaveClass(/disabled/);
  });

  /**
   * Test 3: Gradient toggle is unchecked initially
   */
  test('Gradient toggle unchecked initially', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(500);

    // Gradient toggle should be unchecked
    const gradientToggle = page.locator('[data-testid="gradient-toggle"]');
    await expect(gradientToggle).not.toBeChecked();
  });

  /**
   * Test 4: Gradient section body is hidden when toggle is off
   */
  test('Gradient body hidden when toggle is off', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(500);

    // Gradient body should be hidden
    const gradientControls = page.locator('#gradient-controls');
    await expect(gradientControls).toBeHidden();
  });

  /**
   * Test 5: Gradient section body is visible when toggle is on
   */
  test('Gradient body visible when toggle is on', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(500);

    // Click the gradient toggle via JS (input has pointer-events:none + may be visually hidden)
    await page.evaluate(() => {
      const toggle = document.querySelector('[data-testid="gradient-toggle"]') as HTMLInputElement;
      if (toggle) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);

    // Gradient body should now be visible
    const gradientControls = page.locator('#gradient-controls');
    await expect(gradientControls).toBeVisible();
  });

  /**
   * Test 6: Gradient type selector shows linear and radial options
   */
  test('Gradient type selector has linear and radial options', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(500);

    // Enable gradient first via JS
    await page.evaluate(() => {
      const toggle = document.querySelector('[data-testid="gradient-toggle"]') as HTMLInputElement;
      if (toggle) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);

    // Check type selector options
    const typeSelect = page.locator('[data-testid="gradient-type-select"]');
    await expect(typeSelect).toHaveValue('linear');

    // Change to radial
    await typeSelect.selectOption('radial');
    await expect(typeSelect).toHaveValue('radial');
  });

  /**
   * Test 7: Gradient angle slider updates value display
   */
  test('Gradient angle slider updates value display', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(500);

    // Enable gradient first via JS
    await page.evaluate(() => {
      const toggle = document.querySelector('[data-testid="gradient-toggle"]') as HTMLInputElement;
      if (toggle) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);

    // Change angle slider
    const slider = page.locator('[data-testid="gradient-angle-slider"]');
    await slider.fill('90');
    await page.waitForTimeout(100);

    // Value display should update
    const valueDisplay = page.locator('#gradient-angle-row .slider-value');
    await expect(valueDisplay).toHaveText('90°');
  });

  /**
   * Test 8: Gradient angle row hidden when radial is selected
   */
  test('Gradient angle row hidden when radial selected', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(500);

    // Enable gradient first via JS
    await page.evaluate(() => {
      const toggle = document.querySelector('[data-testid="gradient-toggle"]') as HTMLInputElement;
      if (toggle) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);

    // Angle row should be visible for linear
    const angleRow = page.locator('#gradient-angle-row');
    await expect(angleRow).toBeVisible();

    // Switch to radial
    const typeSelect = page.locator('[data-testid="gradient-type-select"]');
    await typeSelect.selectOption('radial');
    await page.waitForTimeout(100);

    // Angle row should now be hidden
    await expect(angleRow).toBeHidden();
  });

  /**
   * Test 9: Gradient color stops have correct default values
   */
  test('Gradient color stops have correct default values', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(500);

    // Enable gradient first via JS
    await page.evaluate(() => {
      const toggle = document.querySelector('[data-testid="gradient-toggle"]') as HTMLInputElement;
      if (toggle) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);

    // Check default color values
    const color1 = page.locator('[data-testid="gradient-color-1"]');
    const color2 = page.locator('[data-testid="gradient-color-2"]');

    await expect(color1).toHaveValue('#ffffff');
    await expect(color2).toHaveValue('#000000');
  });
});
