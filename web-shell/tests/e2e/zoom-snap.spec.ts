import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady } from './helpers/app-ready.js';
import { getZoomLevel } from './helpers/viewport-helpers.js';

const SIMPLE_RECT_PATH = fixturePath('simple-rect.drawio');

/**
 * E2E tests for zoom snap functionality.
 * Tests: REQ-ZOOMSNAP-001, REQ-ZOOMSNAP-002, REQ-ZOOMSNAP-003
 */

test.describe('Suite: zoom-snap', () => {
  /**
   * Test 1: Ctrl++ increases zoom by 0.2 (no artificial snap)
   * REQ-ZOOMSNAP-001: target 1.04 snaps to 1.0, target 1.06 stays 1.06
   * We test that Ctrl++ from 1.0 goes to 1.2 (since 1.2 is outside threshold)
   */
  test('Ctrl++ from 1.0 goes to 1.2 (does not artificially snap)', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Press Ctrl+= (zoom in by 0.2 from 1.0 = 1.2, doesn't snap because 1.2 - 1.0 = 0.2 > 0.05)
    await page.keyboard.press('Control+=');
    await page.waitForTimeout(200);

    const zoomAfterCtrlPlus = await getZoomLevel(page);

    // 1.0 + 0.2 = 1.2, and 1.2 is NOT within 0.05 of any snap point, so it stays at 1.2
    expect(zoomAfterCtrlPlus).toBeCloseTo(1.2, 1);
  });

  /**
   * Test 2: wheel zoom does NOT snap (Ctrl+wheel from 1.0 → 1.1)
   * REQ-ZOOMSNAP-003 free wheel scenario
   */
  test('wheel zoom does NOT snap (Ctrl+wheel from 1.0 → 1.1)', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const canvas = page.locator('[data-testid="canvas-container"]');

    // Get initial zoom
    const zoomBefore = await getZoomLevel(page);

    // Zoom with Ctrl+wheel (draw.io parity: ctrlKey + wheel = zoom)
    await canvas.hover({ position: { x: 400, y: 300 } });
    await canvas.evaluate((el) => {
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(200);

    // Zoom should change and NOT be snapped to a canonical value
    const zoomAfter = await getZoomLevel(page);

    // The wheel zoom should NOT be snapped to the nearest snap point
    // It should be a continuous value, not one of [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0]
    const snapPoints = [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0];
    const isSnapPoint = snapPoints.some((p) => Math.abs(zoomAfter! - p) < 0.01);

    // Zoom should have changed (wheel zoom was applied)
    expect(zoomAfter).not.toBeCloseTo(zoomBefore!, 1);
    // But should NOT be snapped to a canonical value (since wheel zoom is free)
    expect(isSnapPoint).toBe(false);
  });

  /**
   * Test 3: Ctrl+0 resets to exactly 1.0
   * REQ-ZOOMSNAP-003 reset scenario
   */
  test('Ctrl+0 resets to exactly 1.0', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Zoom in first
    await page.keyboard.press('Control+=');
    await page.keyboard.press('Control+=');
    await page.waitForTimeout(200);

    // Reset zoom with Ctrl+0
    await page.keyboard.press('Control+0');
    await page.waitForTimeout(200);

    // Zoom should be exactly 1.0
    const zoomAfter = await getZoomLevel(page);
    expect(zoomAfter).toBeCloseTo(1.0, 2);
  });

  /**
   * Test 4: Ctrl++ from 0.8 snaps to 1.0 (keyboard zoom snaps to nearest canonical)
   * REQ-ZOOMSNAP-001 keyboard zoom snap scenario
   */
  test('Ctrl++ from 0.8 snaps to 1.0 (keyboard zoom snaps)', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Set initial zoom to 0.8 via debug surface
    // 0.8 + 0.2 = 1.0, which is exactly a snap point
    await page.evaluate(() => {
      const editor = (window as unknown as { __hodeiDebug: { getEditor: () => { viewport: { setZoom: (z: number) => void } } } }).__hodeiDebug.getEditor();
      if (editor && editor.viewport) {
        editor.viewport.setZoom(0.8);
      }
    });
    await page.waitForTimeout(200);

    // Press Ctrl+= (zoom in by 0.2 from 0.8 = 1.0, exactly a snap point)
    await page.keyboard.press('Control+=');
    await page.waitForTimeout(200);

    const zoomAfter = await getZoomLevel(page);

    // Should snap to 1.0 exactly
    expect(zoomAfter).toBeCloseTo(1.0, 2);
  });
});
