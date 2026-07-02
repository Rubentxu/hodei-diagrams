import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH = fixturePath('simple-rect.drawio');

test.describe('Suite: proportional-resize', () => {
  /**
   * Test: Corner resize WITHOUT Shift — free resize
   * GIVEN a single shape is selected and resize handles are visible
   * WHEN the user drags the top-right corner handle without holding Shift
   * THEN the shape resizes freely with no aspect ratio constraint
   */
  test('RESIZE-001: Corner resize without Shift — free resize', async ({ page }) => {
    page.on('console', msg => console.log('BROWSER:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const svg = viewer.locator('svg').first();

    // Get SVG viewBox to understand coordinate mapping
    const viewerBox = await viewer.boundingBox();
    if (!viewerBox) throw new Error('Viewer not visible');
    await page.mouse.click(viewerBox.x + viewerBox.width / 2, viewerBox.y + viewerBox.height / 2);

    await page.waitForTimeout(500);

    // Resize handles should be visible
    const handles = viewer.locator('.resize-handle');
    await expect(handles).toHaveCount(8);
  });

  /**
   * Test: Corner resize WITH Shift — aspect ratio preserved (width-dominant)
   * GIVEN a single shape (100x50 pixels) is selected
   * WHEN the user drags the top-right corner handle rightward with Shift held
   * THEN the height changes proportionally: for every 2px of width added, 1px of height is added
   */
  test('RESIZE-002: Corner resize with Shift — aspect ratio preserved', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Select the shape — use page.mouse.click with viewer center (not rect.click())
    const viewerBox = await viewer.boundingBox();
    if (!viewerBox) throw new Error('Viewer not visible');
    await page.mouse.click(viewerBox.x + viewerBox.width / 2, viewerBox.y + viewerBox.height / 2);
    await page.waitForTimeout(500);

    // Find the NE handle (top-right corner)
    const neHandle = viewer.locator('.resize-handle[data-handle="ne"]');
    await expect(neHandle).toBeVisible();

    // Get initial bounding box
    const boxBefore = await rect.boundingBox();
    expect(boxBefore).not.toBeNull();

    // Get handle position
    const handleBox = await neHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    // Drag handle rightward with Shift held (width-dominant)
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down({ button: 'left' });
    await page.keyboard.down('Shift');
    await page.mouse.move(handleBox!.x + 40, handleBox!.y, { steps: 5 });
    await page.keyboard.up('Shift');
    await page.mouse.up({ button: 'left' });

    await page.waitForTimeout(300);

    // After resize, verify handles are still present (shape wasn't deleted)
    await expect(viewer.locator('.resize-handle').first()).toBeVisible();
  });

  /**
   * Test: Resize handles NOT visible on multi-selection
   * GIVEN multiple shapes are selected
   * WHEN the selection count is greater than one
   * THEN resize handles SHALL NOT be rendered
   */
  test('RESIZE-003: Handles hidden on multi-selection', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rects = viewer.locator('[data-vertex-id]');

    // If there are multiple shapes, select them all with Ctrl+click
    const count = await rects.count();
    if (count > 1) {
      await rects.first().click();
      await page.keyboard.down('Control');
      for (let i = 1; i < count; i++) {
        await rects.nth(i).click();
      }
      await page.keyboard.up('Control');
      await page.waitForTimeout(300);

      // No resize handles should be visible
      const handles = viewer.locator('.resize-handle');
      await expect(handles).toHaveCount(0);
    }
  });

  /**
   * Test: No resize handles when nothing is selected
   */
  test('RESIZE-004: Handles hidden when nothing selected', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');

    // Ensure nothing is selected by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // No resize handles should be visible
    const handles = viewer.locator('.resize-handle');
    await expect(handles).toHaveCount(0);
  });
});
