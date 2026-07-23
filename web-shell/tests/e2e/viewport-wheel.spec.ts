import { test, expect, type Locator } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady } from './helpers/app-ready.js';

/**
 * Fixture with a single rectangle at (20, 20) with size 100x60.
 * This is large enough to test cursor-centered zoom.
 */
const SIMPLE_RECT_PATH = fixturePath('simple-rect.drawio');

test.describe('Suite IC: viewport-wheel — cursor-centered zoom', () => {
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
   * Compute doc point from client point using viewBox.
   * boundingBox returns {x, y, width, height} where x=left, y=top in viewport coords.
   */
  function clientToDoc(
    clientX: number,
    clientY: number,
    vb: { panX: number; panY: number; viewW: number; viewH: number },
    svgRect: { x: number; y: number; width: number; height: number },
  ): { x: number; y: number } {
    const scaleX = vb.viewW / svgRect.width;
    const scaleY = vb.viewH / svgRect.height;
    return {
      x: vb.panX + (clientX - svgRect.x) * scaleX,
      y: vb.panY + (clientY - svgRect.y) * scaleY,
    };
  }

  /**
   * Test 1: Wheel zoom keeps the document point under cursor fixed.
   *
   * Verifies canvas-navigation spec: "Cursor-Centered Wheel Zoom" requirement.
   * Formula: cursorDoc = clientToDoc(clientX, clientY, viewport) must be identical
   * before and after zoom.
   */
  test('Ctrl+wheel at cursor → doc point under cursor unchanged', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const svg = viewer.locator('svg');

    // Hover over the shape first to position cursor
    const shape = viewer.locator('[data-vertex-id]').first();
    await shape.hover();

    // Wait for initial viewport to settle
    await page.waitForTimeout(300);

    // Get the cursor position in client coordinates
    const cursorX = 400;
    const cursorY = 200;

    // Get initial state
    const svgRectBefore = await svg.boundingBox();
    expect(svgRectBefore).not.toBeNull();
    const viewBoxBefore = await parseViewBox(svg);
    const docPointBefore = clientToDoc(cursorX, cursorY, viewBoxBefore, svgRectBefore!);

    // Zoom in with Ctrl+wheel at cursor position
    // Use evaluate + WheelEvent like the existing tests do
    await viewer.hover({ position: { x: cursorX, y: cursorY } });
    await viewer.evaluate((el, { clientX, clientY }) => {
      el.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
      }));
    }, { clientX: cursorX, clientY: cursorY });

    // Wait for zoom to settle
    await page.waitForTimeout(300);

    // Get new state
    const svgRectAfter = await svg.boundingBox();
    expect(svgRectAfter).not.toBeNull();
    const viewBoxAfter = await parseViewBox(svg);
    const docPointAfter = clientToDoc(cursorX, cursorY, viewBoxAfter, svgRectAfter!);

    // The doc point under cursor must be the same (tolerance 1px for rounding)
    expect(docPointAfter.x).toBeCloseTo(docPointBefore.x, 0);
    expect(docPointAfter.y).toBeCloseTo(docPointBefore.y, 0);
  });

  /**
   * Test 2: Zoom clamps at MAX_ZOOM (10.0).
   *
   * Verifies canvas-navigation spec: "Zoom clamps at MAX_ZOOM" scenario.
   */
  test('Huge wheel-up → zoom clamps at MAX_ZOOM (10)', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const svg = viewer.locator('svg');

    // Get current zoom from viewBox
    const getZoom = async (): Promise<number> => {
      return svg.evaluate((el: SVGElement) => {
        const vb = el.getAttribute('viewBox');
        if (!vb) return 1;
        const parts = vb.trim().split(/[\s,]+/).map(Number);
        if (parts.length !== 4) return 1;
        const viewW = parts[2]!;
        const svgRect = el.getBoundingClientRect();
        return svgRect.width / viewW;
      });
    };

    // Zoom in many times to reach max
    await viewer.hover({ position: { x: 400, y: 200 } });
    for (let i = 0; i < 50; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(10);
    }
    await page.waitForTimeout(300);

    const zoom = await getZoom();
    expect(zoom).toBeLessThanOrEqual(10.0);
    expect(zoom).toBeGreaterThan(0);
  });

  /**
   * Test 3: Zoom clamps at MIN_ZOOM (0.1).
   *
   * Verifies canvas-navigation spec: "Zoom clamps at MIN_ZOOM" scenario.
   */
  test('Huge wheel-down → zoom clamps at MIN_ZOOM (0.1)', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const svg = viewer.locator('svg');

    // Get current zoom from viewBox
    const getZoom = async (): Promise<number> => {
      return svg.evaluate((el: SVGElement) => {
        const vb = el.getAttribute('viewBox');
        if (!vb) return 1;
        const parts = vb.trim().split(/[\s,]+/).map(Number);
        if (parts.length !== 4) return 1;
        const viewW = parts[2]!;
        const svgRect = el.getBoundingClientRect();
        return svgRect.width / viewW;
      });
    };

    // Zoom out many times to reach min
    await viewer.hover({ position: { x: 400, y: 200 } });
    for (let i = 0; i < 50; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(10);
    }
    await page.waitForTimeout(300);

    const zoom = await getZoom();
    expect(zoom).toBeGreaterThanOrEqual(0.1);
    expect(zoom).toBeLessThan(1);
  });
});
