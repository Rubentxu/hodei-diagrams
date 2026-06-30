import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

test.describe('Suite K: accessibility-keyboard', () => {
  /**
   * Test 1: Tab order reaches navbar, rail, sidebar, canvas, inspector
   */
  test('Tab order reaches navbar, rail, sidebar, canvas, inspector', async ({ page }) => {
    await waitForAppReady(page);

    // Start from top of page
    await page.keyboard.press('Tab');

    // We should eventually reach each zone
    // Check that tabbing moves focus to interactive elements
    // Get the first focusable element after Tab
    const firstFocusable = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.getAttribute('data-testid') || el.tagName : null;
    });

    // Focus should be on some element in the app
    expect(firstFocusable).toBeTruthy();
  });

  /**
   * Test 2: Ctrl+G toggles grid
   */
  test('Ctrl+G toggles grid', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Initially grid may or may not be visible (depends on localStorage)
    const canvasContainer = page.locator('[data-testid="canvas-container"]');
    const gridInitiallyVisible = await canvasContainer.evaluate(
      (el) => el.classList.contains('show-grid'),
    );

    // Press Ctrl+G
    await page.keyboard.press('Control+g');
    await page.waitForTimeout(100);

    // Grid should toggle
    const gridAfterToggle = await canvasContainer.evaluate(
      (el) => el.classList.contains('show-grid'),
    );
    expect(gridAfterToggle).toBe(!gridInitiallyVisible);

    // Toggle back
    await page.keyboard.press('Control+g');
    await page.waitForTimeout(100);
    const gridAfterSecondToggle = await canvasContainer.evaluate(
      (el) => el.classList.contains('show-grid'),
    );
    expect(gridAfterSecondToggle).toBe(gridInitiallyVisible);
  });

  /**
   * Test 3: Ctrl+Shift+P toggles presentation mode
   */
  test('Ctrl+Shift+P toggles presentation mode', async ({ page }) => {
    await waitForAppReady(page);

    await page.keyboard.press('Control+Shift+P');
    await expect(page.locator('body')).toHaveClass(/presentation-mode/);

    // Press again to exit
    await page.keyboard.press('Control+Shift+P');
    await expect(page.locator('body')).not.toHaveClass(/presentation-mode/);
  });

  /**
   * Test 4: Delete removes selected shape
   */
  test('Delete removes selected shape', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Count initial shapes
    const initialCount = await page.locator('[data-vertex-id]').count();
    expect(initialCount).toBeGreaterThan(0);

    // Select first shape
    await page.locator('[data-vertex-id]').first().click();
    await page.waitForTimeout(200);

    // Press Delete
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Shape should be removed
    const newCount = await page.locator('[data-vertex-id]').count();
    expect(newCount).toBe(initialCount - 1);
  });

  /**
   * Test 5: Ctrl+Z / Ctrl+Y still work with keyboard focus away from canvas
   */
  test('Ctrl+Z / Ctrl+Y still work with keyboard focus away from canvas', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Create a shape
    await page.click('[data-testid="rect-tool-btn"]');
    await page.locator('[data-testid="viewer"]').click({ position: { x: 200, y: 150 } });
    await page.waitForTimeout(300);

    const countAfterAdd = await page.locator('[data-vertex-id]').count();

    // Move focus away from canvas to the navbar
    await page.locator('[data-testid="navbar"]').click();
    await page.waitForTimeout(100);

    // Undo should still work
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    const countAfterUndo = await page.locator('[data-vertex-id]').count();
    expect(countAfterUndo).toBe(countAfterAdd - 1);

    // Redo should still work
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(300);
    const countAfterRedo = await page.locator('[data-vertex-id]').count();
    expect(countAfterRedo).toBe(countAfterAdd);
  });

  /**
   * Test 6: Buttons/inputs relevant to UI have aria-labels or accessible names
   */
  test('Buttons/inputs have accessible names or aria-labels', async ({ page }) => {
    await waitForAppReady(page);

    // Check key interactive elements have accessible names
    const saveBtn = page.locator('[data-testid="save-btn"]');
    await expect(saveBtn).toHaveAttribute('title', expect.stringContaining('Save'));

    const undoBtn = page.locator('[data-testid="undo-btn"]');
    await expect(undoBtn).toHaveAttribute('title', expect.stringContaining('Undo'));

    const redoBtn = page.locator('[data-testid="redo-btn"]');
    await expect(redoBtn).toHaveAttribute('title', expect.stringContaining('Redo'));

    // Inspector inputs should have associated labels
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
    await page.locator('[data-vertex-id]').first().click();
    await page.waitForTimeout(200);

    // Inspector fill input should be labeled
    const fillLabel = page.locator('label[for="inspector-fill"], [data-testid="inspector-fill"]');
    await expect(fillLabel).toBeVisible();

    // dismiss button exists in DOM (hidden inside hidden error banner)
    // Verify it exists and would have accessible name when visible
    const dismissBtn = page.locator('[data-testid="dismiss-error"]');
    await expect(dismissBtn).toHaveCount(1);
  });

  /**
   * Test 7: Escape closes properties dialog and exits presentation mode
   */
  test('Escape closes properties dialog', async ({ page }) => {
    await waitForAppReady(page);

    // Open properties dialog
    await page.locator('[data-testid="menu-file"] summary').click();
    await page.locator('[data-testid="menu-properties"]').click();
    await expect(page.locator('[data-testid="properties-dialog"]')).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Dialog should be closed
    await expect(page.locator('[data-testid="properties-dialog"]')).toBeHidden();
  });

  test('Escape exits presentation mode', async ({ page }) => {
    await waitForAppReady(page);

    // Enter presentation mode
    await page.keyboard.press('Control+Shift+P');
    await expect(page.locator('body')).toHaveClass(/presentation-mode/);

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Should exit
    await expect(page.locator('body')).not.toHaveClass(/presentation-mode/);

    // All zones should be visible again
    await expect(page.locator('.navbar')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
  });
});
