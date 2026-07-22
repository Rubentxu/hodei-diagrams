/**
 * resize-coord-transform.spec.ts — Regression suite for the resize coordinate-
 * space bug (fix-resize-coord-transform, SDDK).
 *
 * Bug: `ResizeHandlesOverlay.#resizeOnMove` passed the SVG element to `clientToDoc`
 * instead of the viewer container, bypassing the viewBox transform and the CSS
 * zoom transform and falling back to raw CSS coordinates. This caused committed
 * width/height to drift by the viewBox/zoom scale factor on every resize drag.
 *
 * Fix: route through `clientToDoc(viewer, ...)` — the canonical implementation
 * that accounts for viewBox AND CSS zoom transform.
 *
 * These tests verify the fix by performing real SE-handle drags and asserting
 * that committed geometry deltas match the expected doc-space delta derived
 * from the live SVG viewBox and getBoundingClientRect() — never assuming
 * 1 CSS px = 1 doc unit.
 */

import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';

/** Read committed geometry from the WASM engine via __hodeiDebug.fetchSceneFresh() */
async function fetchCommittedGeometry(
  page: import('@playwright/test').Page,
  vertexIdx: number,
) {
  return await page.evaluate(
    (idx) => {
      const scene = (
        window as unknown as {
          __hodeiDebug?: {
            fetchSceneFresh?: () => {
              pages?: Array<{ display_list?: Array<Record<string, unknown>> }>;
            };
          };
        }
      ).__hodeiDebug?.fetchSceneFresh?.();
      if (!scene?.pages?.length) return null;
      for (const page of scene.pages) {
        if (!page.display_list) continue;
        for (const item of page.display_list) {
          const key = Object.keys(item)[0]!;
          const variant = item[key] as {
            id?: { idx?: number };
            bounds?: {
              origin?: { x?: number; y?: number };
              size?: { width?: number; height?: number };
            };
          };
          if (variant?.id?.idx === idx && variant?.bounds) {
            return {
              x: variant.bounds.origin?.x ?? 0,
              y: variant.bounds.origin?.y ?? 0,
              width: variant.bounds.size?.width ?? 0,
              height: variant.bounds.size?.height ?? 0,
            };
          }
        }
      }
      return null;
    },
    vertexIdx,
  );
}

/**
 * Compute the CSS-pixel-to-document-unit scale from the live SVG viewBox
 * and the SVG element's bounding rect.
 *
 * Returns { scaleX, scaleY } so callers can derive expected doc deltas
 * from arbitrary CSS-pixel drag distances.
 */
async function getCssToDocScale(
  page: import('@playwright/test').Page,
  viewer: import('@playwright/test').Locator,
): Promise<{ scaleX: number; scaleY: number }> {
  return await page.evaluate(() => {
    const viewer = document.querySelector('[data-testid="viewer"]') as HTMLElement;
    const svg = viewer?.querySelector('svg') as SVGSVGElement | null;
    if (!viewer || !svg) return { scaleX: 1, scaleY: 1 };
    const viewBox = svg.getAttribute('viewBox');
    if (!viewBox) return { scaleX: 1, scaleY: 1 };
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4) return { scaleX: 1, scaleY: 1 };
    const [vbX, vbY, vbW, vbH] = parts as [number, number, number, number];
    const svgRect = svg.getBoundingClientRect();
    if (svgRect.width === 0 || svgRect.height === 0) return { scaleX: 1, scaleY: 1 };
    // Suppress unused variable warnings
    void vbX;
    void vbY;
    return {
      scaleX: vbW / svgRect.width,
      scaleY: vbH / svgRect.height,
    };
  });
}

/**
 * Set CSS zoom on the viewer (transform: scale(n) with transformOrigin: 0 0)
 * so getZoom() returns n and clientToDoc accounts for the zoom in its fallback.
 */
async function setViewerZoom(
  page: import('@playwright/test').Page,
  scale: number,
): Promise<void> {
  await page.evaluate(
    (s) => {
      const viewer = document.querySelector('[data-testid="viewer"]') as HTMLElement;
      if (!viewer) return;
      viewer.style.transformOrigin = '0 0';
      viewer.style.transform = `scale(${s})`;
    },
    scale,
  );
  // Wait a frame for the transform to apply
  await page.waitForTimeout(50);
}

test.describe('Resize coordinate-space regression (fix-resize-coord-transform)', () => {
  /**
   * RCT-001: Baseline SE-handle drag at 1x zoom.
   *
   * Creates a rect at doc-space (120,100) with size (80,40).
   * Drags the SE handle rightward by a measured CSS-pixel distance.
   * Derives the expected doc-space delta from the live viewBox/svgRect ratio,
   * then asserts the committed width delta matches within tolerance.
   *
   * The SE handle keeps origin (x,y) fixed and only changes width/height.
   * This test MUST FAIL if clientToDoc receives the SVG layer instead of
   * the viewer (the buggy path that bypasses viewBox and getZoom).
   */
  test('RCT-001: SE resize drag at 1x zoom commits correct width delta', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // Create a rect at exact doc-space coordinates via __hodeiDebug
    await page.evaluate(() => {
      const debug = (
        window as unknown as {
          __hodeiDebug?: {
            addRectAt?: (_x: number, _y: number, _w: number, _h: number) => boolean | null;
          };
        }
      ).__hodeiDebug;
      if (!debug?.addRectAt) throw new Error('__hodeiDebug.addRectAt not available');
      const r = debug.addRectAt(120, 100, 80, 40);
      if (!r) throw new Error('addRectAt returned null');
    });

    await page.waitForSelector('[data-testid="viewer"] svg');
    await page.waitForTimeout(300);

    const viewer = page.locator('[data-testid="viewer"]');

    // ── Read vertex index from the shape's data-vertex-id ──────────────────────
    const shape = viewer.locator('[data-vertex-id]').first();
    await shape.waitFor({ state: 'visible', timeout: 5000 });
    const idAttr = await shape.getAttribute('data-vertex-id');
    expect(idAttr).toMatch(/^\d+:\d+$/); // format: "idx:version"
    const [idxStr, verStr] = idAttr!.split(':');
    const vertexIdx = parseInt(idxStr!);
    void verStr; // version unused but kept for future use

    // ── Compute CSS→doc scale from current viewBox ─────────────────────────────
    const { scaleX, scaleY } = await getCssToDocScale(page, viewer);
    expect(scaleX).toBeGreaterThan(0);
    expect(scaleY).toBeGreaterThan(0);

    // ── Select the shape ───────────────────────────────────────────────────────
    const shapeBox = await shape.boundingBox();
    expect(shapeBox).not.toBeNull();
    await page.mouse.click(shapeBox!.x + shapeBox!.width / 2, shapeBox!.y + shapeBox!.height / 2);
    await page.waitForTimeout(300);

    // ── Grab the SE resize handle ───────────────────────────────────────────────
    const seHandle = viewer.locator('.resize-handle[data-handle="se"]');
    await expect(seHandle).toBeVisible();
    const handleBox = await seHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    // ── Read committed geometry BEFORE drag ────────────────────────────────────
    const before = await fetchCommittedGeometry(page, vertexIdx);
    expect(before).not.toBeNull();
    expect(before!.width).toBeCloseTo(80, 1);
    expect(before!.height).toBeCloseTo(40, 1);
    const beforeX = before!.x;
    const beforeY = before!.y;

    // ── Drag SE handle rightward by 40 CSS px ─────────────────────────────────
    const DRAG_CSS_X = 40;
    const DRAG_CSS_Y = 0; // SE handle: only width changes horizontally
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2 + DRAG_CSS_X,
      handleBox!.y + handleBox!.height / 2 + DRAG_CSS_Y,
      { steps: 5 },
    );
    await page.mouse.up();
    await page.waitForTimeout(300); // allow commit

    // ── Verify committed geometry AFTER drag ──────────────────────────────────
    const after = await fetchCommittedGeometry(page, vertexIdx);
    expect(after).not.toBeNull();

    // Origin must be unchanged (SE handle anchors at top-left)
    expect(after!.x).toBeCloseTo(beforeX, 2);
    expect(after!.y).toBeCloseTo(beforeY, 2);

    // Expected doc-space delta = CSS drag × CSS→doc scale
    const expectedWidthDelta = DRAG_CSS_X * scaleX;
    const actualWidthDelta = after!.width - before!.width;

    // Assert width delta matches within 1 doc-unit tolerance
    expect(actualWidthDelta).toBeCloseTo(expectedWidthDelta, 1);

    // Height should be unchanged
    expect(after!.height).toBeCloseTo(before!.height, 1);
  });

  /**
   * RCT-002: SE-handle drag at 2x CSS zoom.
   *
   * Same as RCT-001 but with viewer.style.transform = 'scale(2)'.
   * The CSS zoom is detected by getZoom() inside clientToDoc, so the
   * committed delta must still match the viewBox-derived ratio (not 1:1).
   *
   * This test catches the bug where clientToDoc is called with the SVG layer
   * instead of the viewer — the SVG layer has no CSS transform, so getZoom()
   * returns 1 even when the viewer is visually zoomed 2x.
   */
  test('RCT-002: SE resize drag at 2x CSS zoom commits correct width delta', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // Create a rect at exact doc-space coordinates
    await page.evaluate(() => {
      const debug = (
        window as unknown as {
          __hodeiDebug?: {
            addRectAt?: (_x: number, _y: number, _w: number, _h: number) => boolean | null;
          };
        }
      ).__hodeiDebug;
      if (!debug?.addRectAt) throw new Error('__hodeiDebug.addRectAt not available');
      const r = debug.addRectAt(120, 100, 80, 40);
      if (!r) throw new Error('addRectAt returned null');
    });

    await page.waitForSelector('[data-testid="viewer"] svg');
    await page.waitForTimeout(300);

    const viewer = page.locator('[data-testid="viewer"]');

    // ── Apply 2x CSS zoom BEFORE selecting ────────────────────────────────────
    await setViewerZoom(page, 2);

    // ── Read vertex index from shape's data-vertex-id ─────────────────────────
    const shape = viewer.locator('[data-vertex-id]').first();
    await shape.waitFor({ state: 'visible', timeout: 5000 });
    const idAttr = await shape.getAttribute('data-vertex-id');
    expect(idAttr).toMatch(/^\d+:\d+$/);
    const [idxStr] = idAttr!.split(':');
    const vertexIdx = parseInt(idxStr!);

    // ── Compute CSS→doc scale from viewBox (same formula at any zoom) ─────────
    const { scaleX, scaleY } = await getCssToDocScale(page, viewer);
    expect(scaleX).toBeGreaterThan(0);
    expect(scaleY).toBeGreaterThan(0);

    // ── Select the shape ──────────────────────────────────────────────────────
    const shapeBox = await shape.boundingBox();
    expect(shapeBox).not.toBeNull();
    // With 2x zoom, bounding box is reported in CSS pixel space (doubled)
    // but the click must go to the correct visual position
    await page.mouse.click(
      shapeBox!.x + shapeBox!.width / 2,
      shapeBox!.y + shapeBox!.height / 2,
    );
    await page.waitForTimeout(300);

    // ── Grab the SE resize handle ──────────────────────────────────────────────
    const seHandle = viewer.locator('.resize-handle[data-handle="se"]');
    await expect(seHandle).toBeVisible();
    const handleBox = await seHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    // ── Read committed geometry BEFORE drag ────────────────────────────────────
    const before = await fetchCommittedGeometry(page, vertexIdx);
    expect(before).not.toBeNull();
    expect(before!.width).toBeCloseTo(80, 1);
    expect(before!.height).toBeCloseTo(40, 1);
    const beforeX = before!.x;
    const beforeY = before!.y;

    // ── Drag SE handle rightward by 40 CSS px ─────────────────────────────────
    const DRAG_CSS_X = 40;
    const DRAG_CSS_Y = 0;
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2 + DRAG_CSS_X,
      handleBox!.y + handleBox!.height / 2 + DRAG_CSS_Y,
      { steps: 5 },
    );
    await page.mouse.up();
    await page.waitForTimeout(300);

    // ── Verify committed geometry AFTER drag ────────────────────────────────────
    const after = await fetchCommittedGeometry(page, vertexIdx);
    expect(after).not.toBeNull();

    // Origin unchanged (SE handle anchors at top-left)
    expect(after!.x).toBeCloseTo(beforeX, 2);
    expect(after!.y).toBeCloseTo(beforeY, 2);

    // Expected doc-space delta uses the SAME viewBox-derived ratio
    // (clientToDoc internally applies getZoom to handle CSS zoom)
    const expectedWidthDelta = DRAG_CSS_X * scaleX;
    const actualWidthDelta = after!.width - before!.width;

    expect(actualWidthDelta).toBeCloseTo(expectedWidthDelta, 1);

    // Height unchanged
    expect(after!.height).toBeCloseTo(before!.height, 1);

    // ── Clean up: reset zoom ───────────────────────────────────────────────────
    await setViewerZoom(page, 1);
  });

  /**
   * RCT-003: SE handle fixes origin (top-left corner does not move).
   *
   * Verifies that an SE resize operation does not change the shape's x,y origin.
   * This is a structural invariant: SE resizes from the bottom-right corner only.
   */
  test('RCT-003: SE resize does not move shape origin', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await page.evaluate(() => {
      const debug = (
        window as unknown as {
          __hodeiDebug?: {
            addRectAt?: (_x: number, _y: number, _w: number, _h: number) => boolean | null;
          };
        }
      ).__hodeiDebug;
      if (!debug?.addRectAt) throw new Error('__hodeiDebug.addRectAt not available');
      debug.addRectAt(120, 100, 80, 40);
    });

    await page.waitForSelector('[data-testid="viewer"] svg');
    await page.waitForTimeout(300);

    const viewer = page.locator('[data-testid="viewer"]');
    const shape = viewer.locator('[data-vertex-id]').first();
    await shape.waitFor({ state: 'visible', timeout: 5000 });

    const idAttr = await shape.getAttribute('data-vertex-id');
    const [idxStr] = idAttr!.split(':');
    const vertexIdx = parseInt(idxStr!);

    // Select and resize
    const shapeBox = await shape.boundingBox();
    expect(shapeBox).not.toBeNull();
    await page.mouse.click(shapeBox!.x + shapeBox!.width / 2, shapeBox!.y + shapeBox!.height / 2);
    await page.waitForTimeout(300);

    const seHandle = viewer.locator('.resize-handle[data-handle="se"]');
    await seHandle.waitFor({ state: 'visible', timeout: 5000 });
    const handleBox = await seHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    const before = await fetchCommittedGeometry(page, vertexIdx);
    expect(before).not.toBeNull();
    const beforeX = before!.x;
    const beforeY = before!.y;

    // Drag in both X and Y to verify only size changes, not position
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2 + 30,
      handleBox!.y + handleBox!.height / 2 + 20,
      { steps: 5 },
    );
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await fetchCommittedGeometry(page, vertexIdx);
    expect(after).not.toBeNull();

    // Origin MUST be unchanged
    expect(after!.x).toBeCloseTo(beforeX, 2);
    expect(after!.y).toBeCloseTo(beforeY, 2);

    // Both width and height must have increased
    expect(after!.width).toBeGreaterThan(before!.width);
    expect(after!.height).toBeGreaterThan(before!.height);
  });
});
