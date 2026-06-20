import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';

test.describe('Suite F: text-editing', () => {
  /**
   * Test 1: Double click on a shape enters inline edit mode.
   * An .label-editor input overlay appears positioned over the shape.
   * Note: Playwright's locator.dblclick() doesn't fire a native dblclick event on
   * SVG elements, so we use dispatchEvent('dblclick') instead.
   */
  test('Double click on shape enters inline edit mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');

    // Find the first shape (has data-vertex-id)
    const shape = viewer.locator('[data-vertex-id]').first();
    await expect(shape).toBeVisible();

    // Dispatch native dblclick event on the shape
    await shape.dispatchEvent('dblclick');

    // The .label-editor input should appear
    const labelEditor = page.locator('.label-editor');
    await expect(labelEditor).toBeVisible();

    // Input should be focused
    await expect(labelEditor).toBeFocused();
  });

  /**
   * Test 2: Enter commits text change and exits edit mode.
   */
  test('Enter commits text change', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const shape = viewer.locator('[data-vertex-id]').first();

    await shape.dispatchEvent('dblclick');

    const labelEditor = page.locator('.label-editor');
    await expect(labelEditor).toBeVisible();

    // Type new text
    await labelEditor.fill('New Label');

    // Press Enter to commit
    await page.keyboard.press('Enter');

    // Editor should be gone (overlay removed)
    await expect(page.locator('.label-editor')).not.toBeVisible();

    // Re-render happened — shape still visible
    await expect(shape).toBeVisible();
  });

  /**
   * Test 3: Escape cancels text edit without committing.
   * The input overlay closes and no EditVertexLabel command is dispatched.
   */
  test('Escape cancels text edit', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const shape = viewer.locator('[data-vertex-id]').first();
    await expect(shape).toBeVisible();

    // Enter edit mode
    await shape.dispatchEvent('dblclick');

    const labelEditor = page.locator('.label-editor');
    await expect(labelEditor).toBeVisible();

    // Type something (do NOT commit — Escape should cancel)
    await labelEditor.fill('Modified');

    // Press Escape to cancel — no dispatch, just close
    await page.keyboard.press('Escape');

    // Editor should be gone
    await expect(page.locator('.label-editor')).not.toBeVisible();

    // Shape still visible (no re-render since no command was dispatched)
    await expect(shape).toBeVisible();
  });

  /**
   * Test 4: Blur (click outside) commits text change.
   */
  test('Click outside commits text change', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const shape = viewer.locator('[data-vertex-id]').first();

    await shape.dispatchEvent('dblclick');

    const labelEditor = page.locator('.label-editor');
    await expect(labelEditor).toBeVisible();

    // Type new text
    await labelEditor.fill('New Text');

    // Click outside (on canvas container) to blur
    const canvasContainer = page.locator('[data-testid="canvas-container"]');
    const canvasBox = await canvasContainer.boundingBox();
    await page.mouse.click(canvasBox!.x + 10, canvasBox!.y + 10);

    // Editor should be gone
    await expect(page.locator('.label-editor')).not.toBeVisible();

    // Shape still visible
    await expect(shape).toBeVisible();
  });

  /**
   * Test 5: Empty text can be committed (no crash).
   */
  test('Empty label allowed', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const shape = viewer.locator('[data-vertex-id]').first();

    await shape.dispatchEvent('dblclick');

    const labelEditor = page.locator('.label-editor');
    await expect(labelEditor).toBeVisible();

    // Clear all text
    await labelEditor.fill('');

    // Commit by pressing Enter
    await page.keyboard.press('Enter');

    // App should not crash — editor gone and SVG still visible
    await expect(page.locator('.label-editor')).not.toBeVisible();
    await expect(viewer.locator('svg')).toBeVisible();
  });

  /**
   * Test 6: Edited text persists after re-render.
   * After committing with Enter, the shape still has the label in the DOM.
   */
  test('Edited text persists after re-render', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const shape = viewer.locator('[data-vertex-id]').first();

    // Enter edit mode and type
    await shape.dispatchEvent('dblclick');
    const labelEditor = page.locator('.label-editor');
    await expect(labelEditor).toBeVisible();
    await labelEditor.fill('Persisted Text');

    // Commit
    await page.keyboard.press('Enter');
    await expect(page.locator('.label-editor')).not.toBeVisible();

    // Trigger re-render by double-clicking empty canvas area
    await page.locator('[data-testid="canvas-container"]').dispatchEvent('dblclick');
    await page.waitForTimeout(300);

    // Shape still visible with data-vertex-id intact (re-render succeeded)
    await expect(shape).toBeVisible();

    // The text element for this vertex should contain the persisted text.
    // The SVG text element is a sibling of the rect, not a child, so we query
    // the viewer directly.
    const vid = await shape.getAttribute('data-vertex-id');
    const textSelector = `[data-vertex-id="${vid}"] ~ text`;
    const textEl = viewer.locator('text').filter({ hasText: 'Persisted Text' }).first();
    await expect(textEl).toBeVisible();
  });
});
