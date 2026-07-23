import { test, expect, type Locator } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady } from './helpers/app-ready.js';

/**
 * Fixture with a single rectangle at (20, 20) with size 100x60.
 * The empty area around it is used to test empty-canvas drag pans.
 */
const SIMPLE_RECT_PATH = fixturePath('simple-rect.drawio');

test.describe('Suite IC: viewport-pan — empty canvas drag pans', () => {
  /**
   * Helper: parse viewBox string into { panX, panY, viewW, viewH }.
   */
  async function parseViewBox(svg: Locator): Promise<{ panX: number; panY: number; viewW: number; viewH: number }> {
    return svg.evaluate((el: SVGElement) => {
      const vb = el.getAttribute('viewBox');
      if (!vb) return { panX: 0, panY: 0, viewW: 800, viewH: 600 };
      const parts = vb.trim().split(/[\s,]+/).map(Number);
      if (parts.length !== 4 || parts.some(isNaN)) return { panX: 0, panY: 0, viewW: 800, viewH: 600 };
      return { panX: parts[0]!, panY: parts[1]!, viewW: parts[2]!, viewH: parts[3]! };
    });
  }

  /**
   * Test 1: Drag on empty canvas → SVG viewBox pan values change.
   *
   * Verifies canvas-navigation spec: "Empty-Canvas Drag Pans" requirement.
   * A pointerdown on the viewer with no shape under the pointer must start
   * a pan gesture. Moving the pointer updates panX/panY.
   */
  test('Drag on empty area → panX/panY in viewBox changes', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const svg = viewer.locator('svg');

    // Wait for initial viewport to settle
    await page.waitForTimeout(300);

    // Get initial viewBox
    const viewBoxBefore = await parseViewBox(svg);
    const panXBefore = viewBoxBefore.panX;
    const panYBefore = viewBoxBefore.panY;

    // Get viewer bounding box
    const viewerBox = await viewer.boundingBox();
    expect(viewerBox).not.toBeNull();

    // Click on the empty area (far from the shape at 20,20 size 100x60)
    // Use bottom-right corner which should be empty
    const emptyX = viewerBox!.x + viewerBox!.width - 50;
    const emptyY = viewerBox!.y + viewerBox!.height - 50;

    // Start drag
    await page.mouse.move(emptyX, emptyY);
    await page.mouse.down({ button: 'left' });

    // Drag rightward and downward
    await page.mouse.move(emptyX + 100, emptyY + 50);
    await page.waitForTimeout(50);

    // End drag
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(300);

    // Get new viewBox
    const viewBoxAfter = await parseViewBox(svg);
    const panXAfter = viewBoxAfter.panX;
    const panYAfter = viewBoxAfter.panY;

    // Pan values must have changed (dragging right should increase panX)
    // Note: direction depends on implementation, we just check something changed
    const panXChanged = panXAfter !== panXBefore || panYAfter !== panYBefore;
    expect(panXChanged).toBe(true);
  });

  /**
   * Test 2: Middle-click drag pans.
   *
   * Verifies canvas-navigation spec: "Pan via Space + Drag and Right-Click Drag"
   * — middle-click drag must pan regardless of what is under the pointer.
   */
  test('Middle-click drag → panX/panY changes', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const svg = viewer.locator('svg');

    await page.waitForTimeout(300);

    const viewBoxBefore = await parseViewBox(svg);

    // Middle-click drag on the shape itself (should still pan)
    const viewerBox = await viewer.boundingBox();
    expect(viewerBox).not.toBeNull();

    await page.mouse.move(viewerBox!.x + 70, viewerBox!.y + 50); // over the shape
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(viewerBox!.x + 170, viewerBox!.y + 100);
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(300);

    const viewBoxAfter = await parseViewBox(svg);

    // Pan must have changed
    const panXChanged = viewBoxAfter.panX !== viewBoxBefore.panX || viewBoxAfter.panY !== viewBoxBefore.panY;
    expect(panXChanged).toBe(true);
  });

  /**
   * Test 3: Space + drag pans.
   *
   * Verifies canvas-navigation spec: "Space + drag pans".
   * Holding Space then dragging must pan regardless of what is under the pointer.
   */
  test('Space + drag → panX/panY changes', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const svg = viewer.locator('svg');

    await page.waitForTimeout(300);

    const viewBoxBefore = await parseViewBox(svg);

    const viewerBox = await viewer.boundingBox();
    expect(viewerBox).not.toBeNull();

    // Press Space
    await page.keyboard.down('Space');

    // Drag over the shape
    await page.mouse.move(viewerBox!.x + 70, viewerBox!.y + 50);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(viewerBox!.x + 170, viewerBox!.y + 100);
    await page.mouse.up({ button: 'left' });

    // Release Space
    await page.keyboard.up('Space');
    await page.waitForTimeout(300);

    const viewBoxAfter = await parseViewBox(svg);

    // Pan must have changed
    const panXChanged = viewBoxAfter.panX !== viewBoxBefore.panX || viewBoxAfter.panY !== viewBoxBefore.panY;
    expect(panXChanged).toBe(true);
  });
});
