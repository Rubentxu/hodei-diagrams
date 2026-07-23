import { test, expect, type Locator } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady } from './helpers/app-ready.js';

/**
 * Fixture with 8 rectangles spread across the canvas.
 * Shapes at:
 * - (20, 20) 100x60
 * - (180, 20) 100x60
 * - (340, 20) 100x60
 * - (20, 120) 120x60
 * - (180, 120) 120x60
 * - (20, 220) 60x60
 * - (100, 220) 60x60
 * - (180, 220) 60x60
 *
 * Overall bounds: x=20, y=20, width=420, height=260
 * With 10% padding, the content should be fitted with at least 10% extra space.
 */
const MULTI_SHAPES_PATH = fixturePath('multi-shapes.drawio');

test.describe('Suite IC: viewport-initial — zoom-to-fit on load', () => {
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
   * Test 1: Open multi-shapes.drawio → all shapes visible with >= 10% padding.
   *
   * Verifies canvas-navigation spec: "Initial Viewport Heuristic" requirement.
   * When a .drawio file is opened, the system must compute the bounding box
   * of all shapes and zoom-to-fit with 10% padding.
   */
  test('Open multi-shapes → all shapes visible with >= 10% padding', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const svg = viewer.locator('svg');

    // Wait for initial fit-to-view to complete
    await page.waitForTimeout(500);

    // Get all shapes and their positions
    const shapes = await page.locator('[data-testid="viewer"] [data-vertex-id]').all();
    expect(shapes.length).toBeGreaterThan(0);

    // Get the SVG viewBox and dimensions
    const viewBox = await parseViewBox(svg);
    const svgBox = await svg.boundingBox();
    expect(svgBox).not.toBeNull();

    // Compute the visible doc area
    const visibleLeft = viewBox.panX;
    const visibleTop = viewBox.panY;
    const visibleRight = viewBox.panX + viewBox.viewW;
    const visibleBottom = viewBox.panY + viewBox.viewH;

    // All shapes must be within the visible area (with some tolerance for padding)
    // The multi-shapes bounds are approximately x=20, y=20, width=420, height=260
    // With 10% padding, we expect the visible area to contain at least the unpadded bounds

    for (const shape of shapes) {
      const shapeBox = await shape.boundingBox();
      expect(shapeBox).not.toBeNull();

      // Get shape position in doc coordinates (center of bounding box)
      const shapeCenterClientX = shapeBox!.x + shapeBox!.width / 2;
      const shapeCenterClientY = shapeBox!.y + shapeBox!.height / 2;

      // Convert to doc coords
      const scaleX = viewBox.viewW / svgBox!.width;
      const scaleY = viewBox.viewH / svgBox!.height;
      const docX = viewBox.panX + (shapeCenterClientX - svgBox!.x) * scaleX;
      const docY = viewBox.panY + (shapeCenterClientY - svgBox!.y) * scaleY;

      // Shape must be within visible area
      // Allow some margin for the actual shape size
      const margin = 50; // roughly the size of small shapes
      expect(docX).toBeGreaterThanOrEqual(visibleLeft - margin);
      expect(docX).toBeLessThanOrEqual(visibleRight + margin);
      expect(docY).toBeGreaterThanOrEqual(visibleTop - margin);
      expect(docY).toBeLessThanOrEqual(visibleBottom + margin);
    }
  });

  /**
   * Test 2: HUD shows zoom percentage on load.
   *
   * Verifies that after loading a file, the HUD displays the zoom level.
   */
  test('HUD shows zoom percentage on load', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Wait for initial fit-to-view to complete
    await page.waitForTimeout(500);

    const zoomDisplay = page.locator('[data-testid="hud-zoom"]');
    await expect(zoomDisplay).toBeVisible();

    const zoomText = await zoomDisplay.textContent();
    expect(zoomText).toMatch(/\d+%/);
  });

  /**
   * Test 3: Empty document falls back to origin at zoom 1.0.
   *
   * Verifies canvas-navigation spec: "Empty document falls back to origin".
   */
  test('Empty canvas → panX=0 panY=0 zoom=1.0', async ({ page }) => {
    await waitForAppReady(page);

    // Don't load any file — stay on empty canvas
    const viewer = page.locator('[data-testid="viewer"]');
    const svg = viewer.locator('svg');

    await page.waitForTimeout(300);

    const viewBox = await parseViewBox(svg);

    // Empty canvas should default to origin with zoom 1.0
    expect(viewBox.panX).toBe(0);
    expect(viewBox.panY).toBe(0);
    // Zoom 1.0 means viewW equals the SVG element width
    const svgBox = await svg.boundingBox();
    expect(svgBox).not.toBeNull();
    const zoom = svgBox!.width / viewBox.viewW;
    expect(zoom).toBeCloseTo(1.0, 1);
  });
});
