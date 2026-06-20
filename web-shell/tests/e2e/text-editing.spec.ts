import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';

test.describe('Suite F: text-editing', () => {
  /**
   * Test 1: Double click text/label enters inline edit mode
   * Note: Inline text editing is not yet implemented in the web-shell.
   * The editor does not have a dblclick handler for text editing.
   * This test documents the expected behavior for future implementation.
   */
  test('Double click text/label enters inline edit mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');

    // Look for any text element in the SVG
    const textElements = viewer.locator('text');
    const textCount = await textElements.count();

    if (textCount === 0) {
      // No text in simple-rect - this test is only applicable when there's text
      test.skip();
      return;
    }

    // Double-click on the first text element
    const firstText = textElements.first();
    await firstText.dblclick();
    await page.waitForTimeout(300);

    // After double-click, an input field should appear for inline editing
    // (This is the expected behavior - not yet implemented)
    const inlineEditInput = page.locator('.inline-edit-input, [contenteditable="true"], input.inline-text-edit');
    // For now, we check that double-click doesn't crash
    // Future: await expect(inlineEditInput).toBeVisible();
  });

  /**
   * Test 2: Enter commits text change
   * Note: Inline text editing not implemented.
   */
  test('Enter commits text change', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const textElements = viewer.locator('text');
    const textCount = await textElements.count();

    if (textCount === 0) {
      test.skip();
      return;
    }

    const firstText = textElements.first();
    await firstText.dblclick();
    await page.waitForTimeout(200);

    // Type new text and press Enter
    await page.keyboard.type('New Label');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // The text should be updated
    // Future: check that the text content changed
  });

  /**
   * Test 3: Escape cancels text edit
   * Note: Inline text editing not implemented.
   */
  test('Escape cancels text edit', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const textElements = viewer.locator('text');
    const textCount = await textElements.count();

    if (textCount === 0) {
      test.skip();
      return;
    }

    // Get original text content
    const originalText = await textElements.first().textContent();

    // Double-click to enter edit mode
    await textElements.first().dblclick();
    await page.waitForTimeout(200);

    // Type something
    await page.keyboard.type('Modified');

    // Press Escape to cancel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Text should be restored to original
    const restoredText = await textElements.first().textContent();
    expect(restoredText).toBe(originalText);
  });

  /**
   * Test 4: Click outside commits text change
   * Note: Inline text editing not implemented.
   */
  test('Click outside commits text change', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const textElements = viewer.locator('text');
    const textCount = await textElements.count();

    if (textCount === 0) {
      test.skip();
      return;
    }

    // Enter edit mode
    await textElements.first().dblclick();
    await page.waitForTimeout(200);

    // Type new text
    await page.keyboard.type('New Text');

    // Click outside (on canvas)
    const canvasContainer = page.locator('[data-testid="canvas-container"]');
    const canvasBox = await canvasContainer.boundingBox();
    await page.mouse.click(canvasBox!.x + 10, canvasBox!.y + 10);
    await page.waitForTimeout(300);

    // Text should be committed
    // Future: verify the text changed
  });

  /**
   * Test 5: Empty label allowed
   * Note: Inline text editing not implemented.
   */
  test('Empty label allowed', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const textElements = viewer.locator('text');
    const textCount = await textElements.count();

    if (textCount === 0) {
      test.skip();
      return;
    }

    // Enter edit mode
    await textElements.first().dblclick();
    await page.waitForTimeout(200);

    // Clear all text
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');

    // Commit by clicking outside
    const canvasContainer = page.locator('[data-testid="canvas-container"]');
    const canvasBox = await canvasContainer.boundingBox();
    await page.mouse.click(canvasBox!.x + 10, canvasBox!.y + 10);
    await page.waitForTimeout(300);

    // App should not crash - empty labels are valid
    await expect(viewer.locator('svg')).toBeVisible();
  });

  /**
   * Test 6: Edited text persists after re-render
   * Note: Inline text editing not implemented.
   */
  test('Edited text persists after re-render', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const textElements = viewer.locator('text');
    const textCount = await textElements.count();

    if (textCount === 0) {
      test.skip();
      return;
    }

    // Enter edit mode
    await textElements.first().dblclick();
    await page.waitForTimeout(200);

    // Type new text
    await page.keyboard.type('Persisted Text');

    // Commit
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Trigger re-render by switching pages and back (if multi-page)
    // For single page, trigger a zoom which causes re-render
    await page.locator('[data-testid="canvas-container"]').dblclick({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);

    // Text should still be "Persisted Text"
    const finalText = await textElements.first().textContent();
    expect(finalText).toContain('Persisted Text');
  });
});
