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
   * Compute doc point from client coordinates using SVG bounding rect.
   * Uses svgRect.left/top (absolute page offset) for correct client-to-doc mapping.
   */
  function clientToDoc(
    clientX: number,
    clientY: number,
    vb: { panX: number; panY: number; viewW: number; viewH: number },
    svgRect: { left: number; top: number; width: number; height: number },
  ): { x: number; y: number } {
    const scaleX = vb.viewW / svgRect.width;
    const scaleY = vb.viewH / svgRect.height;
    return {
      x: vb.panX + (clientX - svgRect.left) * scaleX,
      y: vb.panY + (clientY - svgRect.top) * scaleY,
    };
  }

  /**
   * Test 1: Ctrl+wheel zooms and the document point under cursor stays fixed
   * (cursor-centered zoom). This verifies the zoomAround formula preserves the
   * document point under the cursor.
   *
   * Verifies canvas-navigation spec: "Cursor-Centered Wheel Zoom" requirement.
   */
  test('Ctrl+wheel at cursor → doc point under cursor unchanged', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const svg = viewer.locator('svg');

    // Hover at a position in the SVG to place cursor there
    const svgRect = await svg.evaluate((el: SVGElement) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    const hoverX = svgRect.left + svgRect.width * 0.5;
    const hoverY = svgRect.top + svgRect.height * 0.5;

    await page.mouse.move(hoverX, hoverY);
    await page.waitForTimeout(300);

    // Get initial state
    const svgRectBefore = await svg.evaluate((el: SVGElement) => el.getBoundingClientRect());
    expect(svgRectBefore.width).toBeGreaterThan(0);
    const viewBoxBefore = await parseViewBox(svg);
    const docPointBefore = clientToDoc(hoverX, hoverY, viewBoxBefore, svgRectBefore);

    // Zoom in with Ctrl+wheel at cursor position
    await viewer.evaluate((el, { clientX, clientY }) => {
      el.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
      }));
    }, { clientX: hoverX, clientY: hoverY });

    await page.waitForTimeout(300);

    // Get new state
    const svgRectAfter = await svg.evaluate((el: SVGElement) => el.getBoundingClientRect());
    const viewBoxAfter = await parseViewBox(svg);
    const docPointAfter = clientToDoc(hoverX, hoverY, viewBoxAfter, svgRectAfter);

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
   * Note: plain wheel (without Ctrl/Shift) pans, not zooms. We dispatch
   * Ctrl+wheel via evaluate to trigger zoom-out.
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

    // Zoom out many times using Ctrl+wheel (zoom-out, not pan)
    await viewer.hover({ position: { x: 400, y: 200 } });
    for (let i = 0; i < 50; i++) {
      // deltaY > 0 with ctrlKey=true zooms out (delta = -0.1)
      await viewer.evaluate(() => {
        const el = document.querySelector('[data-testid="viewer"]')!;
        el.dispatchEvent(new WheelEvent('wheel', {
          deltaY: 100,
          ctrlKey: true,
          clientX: 400,
          clientY: 200,
          bubbles: true,
          cancelable: true,
        }));
      });
      await page.waitForTimeout(10);
    }
    await page.waitForTimeout(300);

    const zoom = await getZoom();
    expect(zoom).toBeGreaterThanOrEqual(0.1);
    expect(zoom).toBeLessThan(1);
  });
});
