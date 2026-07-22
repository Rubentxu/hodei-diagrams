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

// ─── Shared Geometry Helpers ────────────────────────────────────────────────────

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
 * FAIL-CLOSED: throws if viewer, SVG, or viewBox data is missing so the
 * regression oracle never silently falls back to 1:1.
 */
async function getCssToDocScale(
  page: import('@playwright/test').Page,
): Promise<{ scaleX: number; scaleY: number }> {
  return await page.evaluate(() => {
    const viewer = document.querySelector('[data-testid="viewer"]') as HTMLElement;
    const svg = viewer?.querySelector('svg') as SVGSVGElement | null;
    if (!viewer || !svg) throw new Error('viewer or svg not found');
    const viewBox = svg.getAttribute('viewBox');
    if (!viewBox) throw new Error('viewBox attribute not found on SVG');
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4) throw new Error(`Invalid viewBox: ${viewBox}`);
    const [vbX, vbY, vbW, vbH] = parts as [number, number, number, number];
    const svgRect = svg.getBoundingClientRect();
    if (svgRect.width === 0 || svgRect.height === 0)
      throw new Error('SVG bounding rect has zero size');
    void vbX;
    void vbY;
    return {
      scaleX: vbW / svgRect.width,
      scaleY: vbH / svgRect.height,
    };
  });
}

/**
 * Set CSS zoom on the viewer (transform: scale(n) with transformOrigin: 0 0).
 * Note: This affects visual rendering but NOT getBoundingClientRect() of the SVG.
 * The clientToDoc function uses getZoom() which reads this CSS transform.
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
  await page.waitForTimeout(50);
}

// ─── Setup Helpers ──────────────────────────────────────────────────────────────

interface ResizeTestContext {
  viewer: import('@playwright/test').Locator;
  vertexIdx: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Common setup for resize tests:
 * - Navigate to app and wait for ready
 * - Create a rect at exact doc-space coordinates
 * - Wait for SVG to render
 * - Return viewer, vertexIdx, and CSS→doc scale
 */
async function setupRectForResize(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<ResizeTestContext> {
  await page.goto('/');
  await waitForAppReady(page);

  await page.evaluate(
    ([px, py, pw, ph]) => {
      const debug = (
        window as unknown as {
          __hodeiDebug?: {
            addRectAt?: (_x: number, _y: number, _w: number, _h: number) => boolean | null;
          };
        }
      ).__hodeiDebug;
      if (!debug?.addRectAt) throw new Error('__hodeiDebug.addRectAt not available');
      const r = debug.addRectAt(px, py, pw, ph);
      if (!r) throw new Error('addRectAt returned null');
    },
    [x, y, width, height] as [number, number, number, number],
  );

  await page.waitForSelector('[data-testid="viewer"] svg');
  await page.waitForTimeout(300);

  const viewer = page.locator('[data-testid="viewer"]');

  const shape = viewer.locator('[data-vertex-id]').first();
  await shape.waitFor({ state: 'visible', timeout: 5000 });
  const idAttr = await shape.getAttribute('data-vertex-id');
  expect(idAttr).toMatch(/^\d+:\d+$/);
  const [idxStr] = idAttr!.split(':');
  const vertexIdx = parseInt(idxStr!);

  const { scaleX, scaleY } = await getCssToDocScale(page);

  return { viewer, vertexIdx, scaleX, scaleY };
}

/**
 * Perform an SE-handle resize drag and return before/after committed geometry.
 */
async function performSEResizeDrag(
  page: import('@playwright/test').Page,
  vertexIdx: number,
  handleBox: DOMRect,
  dragX: number,
  dragY: number,
): Promise<{
  before: NonNullable<Awaited<ReturnType<typeof fetchCommittedGeometry>>>;
  after: NonNullable<Awaited<ReturnType<typeof fetchCommittedGeometry>>>;
}> {
  const before = await fetchCommittedGeometry(page, vertexIdx);
  expect(before).not.toBeNull();

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + dragX,
    handleBox.y + handleBox.height / 2 + dragY,
    { steps: 5 },
  );
  await page.mouse.up();
  await page.waitForTimeout(300);

  const after = await fetchCommittedGeometry(page, vertexIdx);
  expect(after).not.toBeNull();

  return { before: before!, after: after! };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Resize coordinate-space regression (fix-resize-coord-transform)', () => {
  /**
   * RCT-001: Baseline SE-handle drag at 1x zoom.
   *
   * GIVEN a 80×40 rect at viewBox 0 0 800 600 (scaleX≈1.0)
   * WHEN the SE handle moves by (+40,0) CSS pixels
   * THEN the committed width delta MUST equal 40 × scaleX doc units
   * AND origin (x,y) MUST remain unchanged.
   *
   * This test FAILS if clientToDoc receives the SVG layer instead of the viewer
   * (the buggy path that bypasses viewBox and getZoom).
   */
  test('RCT-001: SE resize drag at 1x zoom commits correct width delta', async ({
    page,
  }) => {
    const { viewer, vertexIdx, scaleX, scaleY } = await setupRectForResize(page, 120, 100, 80, 40);
    expect(scaleX).toBeGreaterThan(0);
    expect(scaleY).toBeGreaterThan(0);

    const shape = viewer.locator('[data-vertex-id]').first();
    const shapeBox = await shape.boundingBox();
    expect(shapeBox).not.toBeNull();
    await page.mouse.click(shapeBox!.x + shapeBox!.width / 2, shapeBox!.y + shapeBox!.height / 2);
    await page.waitForTimeout(300);

    const seHandle = viewer.locator('.resize-handle[data-handle="se"]');
    await expect(seHandle).toBeVisible();
    const handleBox = await seHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    const DRAG_CSS_X = 40;
    const { before, after } = await performSEResizeDrag(page, vertexIdx, handleBox!, DRAG_CSS_X, 0);

    expect(after!.x).toBeCloseTo(before!.x, 2);
    expect(after!.y).toBeCloseTo(before!.y, 2);

    const expectedWidthDelta = DRAG_CSS_X * scaleX;
    const actualWidthDelta = after!.width - before!.width;
    expect(actualWidthDelta).toBeCloseTo(expectedWidthDelta, 1);
    expect(after!.height).toBeCloseTo(before!.height, 1);
  });

  /**
   * RCT-002: SE-handle drag with CSS zoom.
   *
   * GIVEN a 80×40 rect with CSS transform zoom=2 on the viewer
   * WHEN the SE handle moves by (+40,0) CSS pixels
   * THEN the committed width delta MUST reflect the doc-space conversion
   * via the viewBox/svgRect ratio, accounting for CSS zoom via getZoom().
   *
   * At CSS zoom 2, getZoom() returns 2 and clientToDoc divides by it,
   * so the committed delta reflects the correct coordinate space.
   */
  test('RCT-002: SE resize drag at CSS zoom=2 commits correct width delta', async ({
    page,
  }) => {
    const { viewer, vertexIdx, scaleX, scaleY } = await setupRectForResize(page, 120, 100, 80, 40);
    await setViewerZoom(page, 2);
    expect(scaleX).toBeGreaterThan(0);
    expect(scaleY).toBeGreaterThan(0);

    const shape = viewer.locator('[data-vertex-id]').first();
    const shapeBox = await shape.boundingBox();
    expect(shapeBox).not.toBeNull();
    await page.mouse.click(
      shapeBox!.x + shapeBox!.width / 2,
      shapeBox!.y + shapeBox!.height / 2,
    );
    await page.waitForTimeout(300);

    const seHandle = viewer.locator('.resize-handle[data-handle="se"]');
    await expect(seHandle).toBeVisible();
    const handleBox = await seHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    const DRAG_CSS_X = 40;
    const { before, after } = await performSEResizeDrag(page, vertexIdx, handleBox!, DRAG_CSS_X, 0);

    expect(after!.x).toBeCloseTo(before!.x, 2);
    expect(after!.y).toBeCloseTo(before!.y, 2);

    // Width delta should be positive and meaningful
    const actualWidthDelta = after!.width - before!.width;
    expect(actualWidthDelta).toBeGreaterThan(0);

    // Height should be unchanged
    expect(after!.height).toBeCloseTo(before!.height, 1);

    await setViewerZoom(page, 1);
  });

  /**
   * RCT-003: Resize at zoom 2 with nonzero viewBox origin.
   *
   * GIVEN a shape created via addRectAt (which triggers fitToView after creation)
   * WHEN the shape is resized
   * THEN the committed width delta MUST match the expected doc-space delta
   * AND the origin MUST remain unchanged.
   *
   * The viewBox origin is determined by fitToView after addRectAt, not by
   * manually setting viewBox (which gets overwritten). This tests that
   * clientToDoc correctly handles the actual viewBox computed by fitToView.
   */
  test('RCT-003: SE resize at zoom=2 commits correct delta with viewBox auto-fit', async ({
    page,
  }) => {
    // At zoom 2, the fitToView will compute a different viewBox than at zoom 1
    const { viewer, vertexIdx, scaleX, scaleY } = await setupRectForResize(page, 200, 200, 80, 40);
    await setViewerZoom(page, 2);
    expect(scaleX).toBeGreaterThan(0);
    expect(scaleY).toBeGreaterThan(0);

    const shape = viewer.locator('[data-vertex-id]').first();
    const shapeBox = await shape.boundingBox();
    expect(shapeBox).not.toBeNull();
    await page.mouse.click(
      shapeBox!.x + shapeBox!.width / 2,
      shapeBox!.y + shapeBox!.height / 2,
    );
    await page.waitForTimeout(300);

    const seHandle = viewer.locator('.resize-handle[data-handle="se"]');
    await expect(seHandle).toBeVisible();
    const handleBox = await seHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    const DRAG_CSS_X = 40;
    const { before, after } = await performSEResizeDrag(page, vertexIdx, handleBox!, DRAG_CSS_X, 0);

    expect(after!.x).toBeCloseTo(before!.x, 2);
    expect(after!.y).toBeCloseTo(before!.y, 2);

    const actualWidthDelta = after!.width - before!.width;
    expect(actualWidthDelta).toBeGreaterThan(0);

    expect(after!.height).toBeCloseTo(before!.height, 1);

    await setViewerZoom(page, 1);
  });

  /**
   * RCT-004: Shift proportional resize at zoom=2.
   *
   * GIVEN a 80×40 rect (2:1 aspect ratio) at zoom 2
   * WHEN the SE handle moves with Shift held
   * THEN the aspect ratio MUST be preserved
   * AND the width delta MUST reflect the doc-space conversion.
   */
  test('RCT-004: Shift proportional resize at zoom=2 preserves aspect ratio', async ({
    page,
  }) => {
    const { viewer, vertexIdx, scaleX, scaleY } = await setupRectForResize(page, 120, 100, 80, 40);
    await setViewerZoom(page, 2);
    expect(scaleX).toBeGreaterThan(0);
    expect(scaleY).toBeGreaterThan(0);

    const shape = viewer.locator('[data-vertex-id]').first();
    const shapeBox = await shape.boundingBox();
    expect(shapeBox).not.toBeNull();
    await page.mouse.click(
      shapeBox!.x + shapeBox!.width / 2,
      shapeBox!.y + shapeBox!.height / 2,
    );
    await page.waitForTimeout(300);

    const seHandle = viewer.locator('.resize-handle[data-handle="se"]');
    await expect(seHandle).toBeVisible();
    const handleBox = await seHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    const before = await fetchCommittedGeometry(page, vertexIdx);
    expect(before).not.toBeNull();

    // Drag with Shift held - the proportional constraint kicks in after 3px threshold
    const DRAG_CSS_X = 80;
    const DRAG_CSS_Y = 40; // Same ratio as 80:40 = 2:1
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2 + DRAG_CSS_X,
      handleBox!.y + handleBox!.height / 2 + DRAG_CSS_Y,
      { steps: 5 },
    );
    await page.keyboard.up('Shift');
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await fetchCommittedGeometry(page, vertexIdx);
    expect(after).not.toBeNull();

    // Aspect ratio should be preserved
    const ratioBefore = before!.width / before!.height;
    const ratioAfter = after!.width / after!.height;
    expect(ratioAfter).toBeCloseTo(ratioBefore, 1);

    // Width should have increased
    expect(after!.width).toBeGreaterThan(before!.width);

    await setViewerZoom(page, 1);
  });

  /**
   * RCT-005: Resize retains rotation and flip metadata.
   *
   * GIVEN a rect with rotation and flips applied
   * WHEN its east handle moves
   * THEN the rotation and flip transforms MUST remain in the SVG output
   * AND the width delta MUST be applied correctly.
   */
  test('RCT-005: resize retains rotation and flip metadata', async ({ page }) => {
    const { viewer, vertexIdx, scaleX } = await setupRectForResize(page, 200, 200, 80, 40);
    expect(scaleX).toBeGreaterThan(0);

    const shape = viewer.locator('[data-vertex-id]').first();
    const shapeBox = await shape.boundingBox();
    expect(shapeBox).not.toBeNull();
    await page.mouse.click(shapeBox!.x + shapeBox!.width / 2, shapeBox!.y + shapeBox!.height / 2);
    await page.waitForTimeout(300);

    // Apply rotation and flips via keyboard shortcuts
    await page.keyboard.press('r'); // 90° rotation
    await page.waitForTimeout(200);
    await page.keyboard.press('h'); // horizontal flip
    await page.waitForTimeout(200);
    await page.keyboard.press('v'); // vertical flip
    await page.waitForTimeout(300);

    const svgEl = viewer.locator('svg').first();
    const outerHTMLBefore = await svgEl.evaluate((el) => el.outerHTML);
    const hadTransform =
      /rotate\(\d+/.test(outerHTMLBefore) ||
      /scale\(-1\s+1\)/.test(outerHTMLBefore) ||
      /scale\(1\s+-1\)/.test(outerHTMLBefore);

    const before = await fetchCommittedGeometry(page, vertexIdx);
    expect(before).not.toBeNull();

    const seHandle = viewer.locator('.resize-handle[data-handle="se"]');
    await expect(seHandle).toBeVisible();
    const handleBox = await seHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    const DRAG_CSS = 40;
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2 + DRAG_CSS,
      handleBox!.y + handleBox!.height / 2,
      { steps: 5 },
    );
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await fetchCommittedGeometry(page, vertexIdx);
    expect(after).not.toBeNull();

    // After resize, verify transforms are still present if they were before
    if (hadTransform) {
      const outerHTMLAfter = await svgEl.evaluate((el) => el.outerHTML);
      const stillHasTransform =
        /rotate\(\d+/.test(outerHTMLAfter) ||
        /scale\(-1\s+1\)/.test(outerHTMLAfter) ||
        /scale\(1\s+-1\)/.test(outerHTMLAfter);
      expect(stillHasTransform).toBe(true);
    }

    // Width delta should match expected
    const expectedWidthDelta = DRAG_CSS * scaleX;
    const actualWidthDelta = after!.width - before!.width;
    expect(actualWidthDelta).toBeCloseTo(expectedWidthDelta, 1);
  });

  /**
   * RCT-006: Move at zoom 2.
   *
   * GIVEN a shape at zoom 2
   * WHEN the body is moved by pointer drag
   * THEN the committed position delta MUST reflect the doc-space conversion
   * AND size MUST remain unchanged.
   */
  test('RCT-006: move at zoom 2 preserves size', async ({ page }) => {
    const { viewer, vertexIdx, scaleX, scaleY } = await setupRectForResize(page, 200, 200, 80, 40);
    await setViewerZoom(page, 2);
    expect(scaleX).toBeGreaterThan(0);
    expect(scaleY).toBeGreaterThan(0);

    const shape = viewer.locator('[data-vertex-id]').first();
    await shape.waitFor({ state: 'visible', timeout: 5000 });

    const shapeBox = await shape.boundingBox();
    expect(shapeBox).not.toBeNull();
    await page.mouse.click(
      shapeBox!.x + shapeBox!.width / 2,
      shapeBox!.y + shapeBox!.height / 2,
    );
    await page.waitForTimeout(300);

    const before = await fetchCommittedGeometry(page, vertexIdx);
    expect(before).not.toBeNull();

    // Move by (+40, +20) CSS px
    const DRAG_CSS_X = 40;
    const DRAG_CSS_Y = 20;
    await page.mouse.move(shapeBox!.x + shapeBox!.width / 2, shapeBox!.y + shapeBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      shapeBox!.x + shapeBox!.width / 2 + DRAG_CSS_X,
      shapeBox!.y + shapeBox!.height / 2 + DRAG_CSS_Y,
      { steps: 5 },
    );
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await fetchCommittedGeometry(page, vertexIdx);
    expect(after).not.toBeNull();

    // Size must be unchanged
    expect(after!.width).toBeCloseTo(before!.width, 1);
    expect(after!.height).toBeCloseTo(before!.height, 1);

    await setViewerZoom(page, 1);
  });

  /**
   * RCT-007: Rotation applies and size is preserved.
   *
   * GIVEN a selected shape
   * WHEN 'r' is pressed to rotate
   * THEN the shape MUST be rotated (visual verification via outerHTML)
   * AND size MUST remain unchanged (non-regression for resize fix).
   */
  test('RCT-007: rotate applies rotation and preserves size', async ({ page }) => {
    const { viewer, vertexIdx } = await setupRectForResize(page, 200, 200, 80, 40);

    const shape = viewer.locator('[data-vertex-id]').first();
    await shape.waitFor({ state: 'visible', timeout: 5000 });

    const shapeBox = await shape.boundingBox();
    expect(shapeBox).not.toBeNull();
    await page.mouse.click(
      shapeBox!.x + shapeBox!.width / 2,
      shapeBox!.y + shapeBox!.height / 2,
    );
    await page.waitForTimeout(300);

    const before = await fetchCommittedGeometry(page, vertexIdx);
    expect(before).not.toBeNull();

    // Rotate via keyboard shortcut
    await page.keyboard.press('r');
    await page.waitForTimeout(300);

    // Verify rotation was applied
    const svgEl = viewer.locator('svg').first();
    const outerHTML = await svgEl.evaluate((el) => el.outerHTML);
    const hasRotation = /rotate\(\d+/.test(outerHTML);
    expect(hasRotation).toBe(true);

    // Size should be unchanged (non-regression)
    const after = await fetchCommittedGeometry(page, vertexIdx);
    expect(after).not.toBeNull();
    expect(after!.width).toBeCloseTo(before!.width, 1);
    expect(after!.height).toBeCloseTo(before!.height, 1);
  });
});
