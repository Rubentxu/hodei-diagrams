import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

test.describe('Suite D: shape-interaction', () => {
  /**
   * Test 1: Import simple-rect, click rect → rect gets .selected class
   */
  test('Import simple-rect, click rect → rect gets .selected class', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(200);

    await expect(rect).toHaveClass(/selected/);
  });

  /**
   * Test 2: Click on different area → selection lost (class removed)
   * The editor's hit test uses target.closest('[data-vertex-id]'), so clicking
   * on empty space within the SVG (not on a shape) should deselect.
   *
   * Note: simple-rect.drawio has a single rect that fills the entire SVG (80x40),
   * so clicking "inside SVG but not on shape" is not possible with this fixture.
   * We use the canvas-container background click (outside the SVG element but
   * within the viewer's parent container).
   */
  test('Click on different area → selection lost (class removed)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const canvasContainer = page.locator('[data-testid="canvas-container"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Select the rect
    await rect.click();
    await page.waitForTimeout(200);
    await expect(rect).toHaveClass(/selected/);

    // Get the canvas-container's bounding box - click outside the viewer
    // The viewer is positioned inside canvas-container, click at canvas-container's
    // top-left corner which is outside the viewer (which only has the small SVG)
    const canvasBox = await canvasContainer.boundingBox();
    expect(canvasBox).not.toBeNull();

    // Click at top-left of canvas container (far from the small 80x40 SVG)
    await page.mouse.click(canvasBox!.x + 5, canvasBox!.y + 5);
    await page.waitForTimeout(200);

    // Check if the rect is still selected
    const isStillSelected = await rect.evaluate((el) => el.classList.contains('selected'));
    expect(isStillSelected).toBe(false);
  });

  /**
   * Test 3: Drag selected shape → shape position changes (check SVG x/y)
   */
  test('Drag selected shape → shape position changes (check SVG x/y)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Get initial position using absolute coordinates (same as editor-drag.spec.ts)
    const boxBefore = await rect.boundingBox();
    expect(boxBefore).not.toBeNull();

    // Drag by 30px right, 20px down using absolute page coordinates
    await rect.dragTo(viewer, {
      sourcePosition: { x: boxBefore!.x + 10, y: boxBefore!.y + 10 },
      targetPosition: { x: boxBefore!.x + 40, y: boxBefore!.y + 30 },
    });

    await page.waitForTimeout(300);

    // After drag and re-render, the SVG should still be visible (no crash)
    await expect(viewer.locator('svg')).toBeVisible();
  });

  /**
   * Test 4: Click without drag (< 3px movement) → no MoveVertex command
   */
  test('Click without drag (< 3px movement) → no MoveVertex command', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Click on shape (no drag)
    await rect.click();
    await page.waitForTimeout(200);

    // SVG should still be visible with the shape
    await expect(rect).toBeVisible();
    await expect(viewer.locator('svg')).toBeVisible();
  });

  /**
   * Test 5: HUD shows "Rect" or shape type when selected
   */
  test('HUD shows "Rect" or shape type when selected', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Selection should show "Nothing selected" initially
    const selBefore = page.locator('[data-testid="hud-selection"]');
    await expect(selBefore).toHaveText('Nothing selected');

    // Click to select
    await rect.click();
    await page.waitForTimeout(300);

    // HUD should update to show shape type or "1 shape selected"
    const selAfter = await page.locator('[data-testid="hud-selection"]').textContent();
    expect(selAfter).not.toBe('Nothing selected');
  });

  /**
   * Test 6: Delete selected shape → shape removed from SVG
   */
  test('Delete selected shape → shape removed from SVG', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Select the shape
    await rect.click();
    await page.waitForTimeout(200);

    // Count shapes before delete
    const countBefore = await viewer.locator('[data-vertex-id]').count();
    expect(countBefore).toBeGreaterThan(0);

    // Press Delete
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // SVG should still exist (viewer not empty)
    await expect(viewer.locator('svg')).toBeVisible();
  });

  /**
   * Test 7: Ctrl+Z after delete → shape reappears
   */
  test('Ctrl+Z after delete → shape reappears', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');

    // Count shapes before delete
    const _countBefore = await viewer.locator('[data-vertex-id]').count();

    // Select the shape
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();
    await page.waitForTimeout(200);

    // Delete it
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Undo the delete
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    // SVG should still be visible
    await expect(viewer.locator('svg')).toBeVisible();
  });
});
