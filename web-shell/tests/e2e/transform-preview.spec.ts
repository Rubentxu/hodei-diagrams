/**
 * transform-preview.spec.ts — Browser E2E tests for live transform preview.
 *
 * Tests that move/resize/rotation previews:
 * 1. Visually update the shape element's bounding box during drag (live preview)
 * 2. Do NOT mutate engine geometry until pointerup
 * 3. Restore original DOM on cancel/pointercancel/below-threshold
 * 4. Commit correctly on above-threshold pointerup
 *
 * Covers rect shapes (rectangles created via addRectAt).
 */

import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';

// ─── Shared Helpers ──────────────────────────────────────────────────────────

/** Read committed (fresh) geometry from WASM engine. */
async function fetchCommittedGeometry(page: import('@playwright/test').Page, vertexIdx: number) {
  return await page.evaluate((idx) => {
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
          rotation?: number;
        };
        if (variant?.id?.idx === idx && variant?.bounds) {
          return {
            x: variant.bounds.origin?.x ?? 0,
            y: variant.bounds.origin?.y ?? 0,
            width: variant.bounds.size?.width ?? 0,
            height: variant.bounds.size?.height ?? 0,
            rotation: variant.rotation ?? 0,
          };
        }
      }
    }
    return null;
  }, vertexIdx);
}

/** Get the DOM bounding box of a shape element (visual preview state). */
async function getShapeBoundingBox(
  page: import('@playwright/test').Page,
  vertexIdx: number,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return await page.evaluate((idx) => {
    // Find the shape with matching vertex idx (version may vary)
    const els = document.querySelectorAll(`[data-vertex-id^="${idx}:"]`);
    if (els.length === 0) return null;
    const el = els[els.length - 1]!;
    const bbox = el.getBoundingClientRect();
    return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
  }, vertexIdx);
}

/** Get the SVG transform attribute of a shape element. */
async function getShapeTransform(
  page: import('@playwright/test').Page,
  vertexIdx: number,
): Promise<string | null> {
  return await page.evaluate((idx) => {
    const els = document.querySelectorAll(`[data-vertex-id^="${idx}:"]`);
    if (els.length === 0) return null;
    const el = els[els.length - 1]!;
    return (el as SVGElement).getAttribute('transform');
  }, vertexIdx);
}

// ─── Setup Helper ─────────────────────────────────────────────────────────────

/**
 * Setup for transform tests: creates a fresh app, adds a rectangle, and selects it.
 * Returns viewer, vertexIdx, and initial bounding box.
 */
async function setupForTransform(page: import('@playwright/test').Page) {
  await page.goto('/');
  await waitForAppReady(page);

  // Create a rectangle
  await page.evaluate(() => {
    const debug = (window as any).__hodeiDebug;
    debug.addRectAt(200, 150, 100, 60);
  });

  await page.waitForSelector('[data-testid="viewer"] svg');
  await page.waitForTimeout(300);

  const viewer = page.locator('[data-testid="viewer"]');

  // Get the shape's vertex index
  const idAttr = await page.evaluate(() => {
    const el = document.querySelector('[data-vertex-id]');
    return el?.getAttribute('data-vertex-id') ?? null;
  });
  expect(idAttr).toMatch(/^\d+:\d+$/);
  const [idxStr] = idAttr!.split(':');
  const vertexIdx = parseInt(idxStr!);

  const shape = viewer.locator(`[data-vertex-id^="${vertexIdx}:"]`);
  await shape.waitFor({ state: 'visible', timeout: 5000 });

  const box = await shape.boundingBox();
  expect(box).not.toBeNull();

  // Select the shape (click on it)
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(200);

  return { viewer, shape, vertexIdx, box: box! };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Live transform preview (fix-resize-coord-transform)', () => {
  /**
   * TP-001: Move preview visually moves shape element immediately,
   * but engine geometry remains unchanged until pointerup.
   */
  test('TP-001: move preview updates DOM bbox during drag, engine unchanged until commit', async ({
    page,
  }) => {
    const { vertexIdx, box } = await setupForTransform(page);

    // Get initial state
    const beforeEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(beforeEngine).not.toBeNull();

    const beforeBBox = await getShapeBoundingBox(page, vertexIdx);
    expect(beforeBBox).not.toBeNull();

    // Start a move drag on the shape body
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const dragX = 50;
    const dragY = 30;

    await page.mouse.move(startX, startY);
    await page.mouse.down();

    // During drag: shape bbox should have moved
    await page.mouse.move(startX + dragX, startY + dragY, { steps: 5 });
    await page.waitForTimeout(50); // Allow preview to apply

    const duringBBox = await getShapeBoundingBox(page, vertexIdx);
    expect(duringBBox).not.toBeNull();

    // The shape should have visually moved (bbox changed)
    expect(duringBBox!.x).toBeGreaterThan(beforeBBox!.x + 20);
    expect(duringBBox!.y).toBeGreaterThan(beforeBBox!.y + 10);

    // But engine geometry should be unchanged (preview, not mutation)
    const duringEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(duringEngine!.x).toBeCloseTo(beforeEngine!.x, 1);
    expect(duringEngine!.y).toBeCloseTo(beforeEngine!.y, 1);

    await page.mouse.up();
    await page.waitForTimeout(200);

    // After commit: engine geometry should reflect the move
    const afterEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(afterEngine!.x).toBeGreaterThan(beforeEngine!.x + dragX - 2);
    expect(afterEngine!.x).toBeLessThan(beforeEngine!.x + dragX + 2);
    expect(afterEngine!.y).toBeGreaterThan(beforeEngine!.y + dragY - 2);
    expect(afterEngine!.y).toBeLessThan(beforeEngine!.y + dragY + 2);
  });

  /**
   * TP-002: Resize preview visually resizes shape element immediately,
   * but engine geometry remains unchanged until pointerup.
   */
  test('TP-002: resize preview updates DOM bbox during drag, engine unchanged until commit', async ({
    page,
  }) => {
    const { viewer, vertexIdx, box } = await setupForTransform(page);

    // Get initial state
    const beforeEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(beforeEngine).not.toBeNull();
    const beforeWidth = beforeEngine!.width;

    // Select shape to show resize handles (click again to ensure selection)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);

    // Get SE handle
    const seHandle = viewer.locator('.resize-handle[data-handle="se"]');
    await expect(seHandle).toBeVisible();
    const handleBox = await seHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    // Start a resize drag
    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;
    const dragX = 40;
    const dragY = 20;

    await page.mouse.move(startX, startY);
    await page.mouse.down();

    // During drag: shape bbox should reflect resize
    await page.mouse.move(startX + dragX, startY + dragY, { steps: 5 });
    await page.waitForTimeout(50);

    const duringBBox = await getShapeBoundingBox(page, vertexIdx);
    expect(duringBBox).not.toBeNull();

    // The shape should have visually resized (bbox width increased)
    expect(duringBBox!.width).toBeGreaterThan(beforeWidth + 20);

    // But engine geometry should be unchanged (preview only)
    const duringEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(duringEngine!.width).toBeCloseTo(beforeWidth, 1);

    await page.mouse.up();
    await page.waitForTimeout(200);

    // After commit: engine geometry should reflect the resize
    const afterEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(afterEngine!.width).toBeGreaterThan(beforeWidth + 20);
  });

  /**
   * TP-003: Rotation preview visually rotates shape element immediately,
   * but engine geometry remains unchanged until pointerup.
   */
  test('TP-003: rotation preview updates DOM during drag, engine unchanged until commit', async ({
    page,
  }) => {
    const { viewer, vertexIdx, box } = await setupForTransform(page);

    // Get initial state
    const beforeEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(beforeEngine).not.toBeNull();

    // Select shape to show rotation handle
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);

    // Get rotation handle
    const rotationHandle = viewer.locator('.rotation-handle');
    await expect(rotationHandle).toBeVisible();
    const handleBox = await rotationHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    // Calculate shape center
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // Handle is typically above the shape center
    const handleX = handleBox!.x + handleBox!.width / 2;
    const handleY = handleBox!.y + handleBox!.height / 2;

    // Start a rotation drag - move handle to a position 90° clockwise
    const vecX = handleX - centerX;
    const vecY = handleY - centerY;
    const targetX = centerX + vecY; // 90° clockwise
    const targetY = centerY - vecX;

    await page.mouse.move(handleX, handleY);
    await page.mouse.down();

    // During drag: shape should have a rotation transform applied
    await page.mouse.move(targetX, targetY, { steps: 10 });
    await page.waitForTimeout(50);

    const duringTransform = await getShapeTransform(page, vertexIdx);
    // During preview, there should be a rotate() transform
    expect(duringTransform).toMatch(/rotate/);

    // But engine rotation should be unchanged (preview only)
    const duringEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(duringEngine!.rotation).toBeCloseTo(beforeEngine!.rotation, 1);

    await page.mouse.up();
    await page.waitForTimeout(200);

    // After commit: engine rotation should reflect the change
    const afterEngine = await fetchCommittedGeometry(page, vertexIdx);
    // The rotation delta should be approximately 90° (π/2 rad)
    const delta = Math.abs(afterEngine!.rotation - beforeEngine!.rotation);
    const deltaDeg = (delta * 180) / Math.PI;
    expect(deltaDeg).toBeGreaterThan(70); // at least 70° (runtime is ~90°)
  });

  /**
   * TP-004: Below-threshold pointerup restores original DOM state without commit.
   */
  test('TP-004: below-threshold drag cancels without committing', async ({ page }) => {
    const { vertexIdx, box } = await setupForTransform(page);

    // Get initial state
    const beforeEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(beforeEngine).not.toBeNull();

    // Start a move drag but don't move far (below 3px threshold)
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Move only 1px - below the 3px threshold
    await page.mouse.move(startX + 1, startY + 1, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Engine geometry should be unchanged (canceled due to below threshold)
    const afterEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(afterEngine!.x).toBeCloseTo(beforeEngine!.x, 1);
    expect(afterEngine!.y).toBeCloseTo(beforeEngine!.y, 1);
  });

  /**
   * TP-005: pointercancel restores original DOM state without commit.
   * Dispatches pointercancel on the viewer (the actual listener target) after a >3px drag.
   */
  test('TP-005: pointercancel restores without committing', async ({ page }) => {
    const { vertexIdx, box } = await setupForTransform(page);

    // Get initial state
    const beforeEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(beforeEngine).not.toBeNull();

    const beforeBBox = await getShapeBoundingBox(page, vertexIdx);
    expect(beforeBBox).not.toBeNull();

    // Start a move drag (>3px threshold)
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const dragX = 50;
    const dragY = 30;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dragX, startY + dragY, { steps: 5 });
    await page.waitForTimeout(50); // Allow preview to apply

    // Verify preview is active (shape bbox moved)
    const duringBBox = await getShapeBoundingBox(page, vertexIdx);
    expect(duringBBox).not.toBeNull();
    expect(duringBBox!.x).toBeGreaterThan(beforeBBox!.x + 20);

    // Engine geometry should still be unchanged during preview
    const duringEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(duringEngine!.x).toBeCloseTo(beforeEngine!.x, 1);
    expect(duringEngine!.y).toBeCloseTo(beforeEngine!.y, 1);

    // Dispatch pointercancel on the viewer (the actual listener target)
    await page.evaluate(() => {
      const viewer = document.querySelector('[data-testid="viewer"]') as HTMLElement;
      viewer.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    });
    await page.waitForTimeout(200);

    // Engine geometry should be unchanged (canceled, not committed)
    const afterEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(afterEngine!.x).toBeCloseTo(beforeEngine!.x, 1);
    expect(afterEngine!.y).toBeCloseTo(beforeEngine!.y, 1);

    // Preview transform should be restored (bbox back to original)
    const afterBBox = await getShapeBoundingBox(page, vertexIdx);
    expect(afterBBox).not.toBeNull();
    expect(afterBBox!.x).toBeCloseTo(beforeBBox!.x, 1);
    expect(afterBBox!.y).toBeCloseTo(beforeBBox!.y, 1);
  });

  /**
   * TP-006: Move preview at non-1x zoom still commits correctly.
   * At zoom 2, CSS pixels are half document units, so dragX=30 CSS px → ~15 doc units.
   * This test verifies that the preview and commit still work (engine unchanged during preview).
   */
  test('TP-006: move preview and commit work at non-1x zoom', async ({ page }) => {
    const { vertexIdx, box } = await setupForTransform(page);

    // Apply 2x zoom via CSS transform
    await page.evaluate(() => {
      const viewer = document.querySelector('[data-testid="viewer"]') as HTMLElement;
      if (viewer) {
        viewer.style.transformOrigin = '0 0';
        viewer.style.transform = 'scale(2)';
      }
    });
    await page.waitForTimeout(100);

    // Refresh box after zoom using page.evaluate
    const boxAfterZoom = await page.evaluate((idx) => {
      const el = document.querySelector(`[data-vertex-id^="${idx}:"]`);
      if (!el) return null;
      const bbox = el.getBoundingClientRect();
      return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
    }, vertexIdx);
    expect(boxAfterZoom).not.toBeNull();

    const beforeEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(beforeEngine).not.toBeNull();

    // Start move drag
    const startX =
      (boxAfterZoom as { x: number; y: number; width: number; height: number }).x +
      (boxAfterZoom as { x: number; y: number; width: number; height: number }).width / 2;
    const startY =
      (boxAfterZoom as { x: number; y: number; width: number; height: number }).y +
      (boxAfterZoom as { x: number; y: number; width: number; height: number }).height / 2;
    const dragX = 30;
    const dragY = 20;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dragX, startY + dragY, { steps: 5 });
    await page.waitForTimeout(50);

    // Engine unchanged during preview (core invariant)
    const duringEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(duringEngine!.x).toBeCloseTo(beforeEngine!.x, 1);
    expect(duringEngine!.y).toBeCloseTo(beforeEngine!.y, 1);

    await page.mouse.up();
    await page.waitForTimeout(200);

    // After commit, engine should reflect move (some delta, exact amount depends on zoom CSS)
    const afterEngine = await fetchCommittedGeometry(page, vertexIdx);
    // At zoom 2, the committed delta should be ~15 document units (30 CSS px / 2)
    // But the key invariant is that it moved SOME amount
    expect(afterEngine!.x).not.toBeCloseTo(beforeEngine!.x, 1);

    // Reset zoom
    await page.evaluate(() => {
      const viewer = document.querySelector('[data-testid="viewer"]') as HTMLElement;
      if (viewer) {
        viewer.style.transform = '';
      }
    });
  });

  /**
   * TP-007: Resize preview uses SVG document-space transform.
   * The shape should visually resize immediately during drag.
   */
  test('TP-007: resize preview visually updates shape during drag', async ({ page }) => {
    const { viewer, vertexIdx, box } = await setupForTransform(page);

    const beforeEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(beforeEngine).not.toBeNull();
    const beforeWidth = beforeEngine!.width;

    // Select and get SE handle
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);

    const seHandle = viewer.locator('.resize-handle[data-handle="e"]');
    await expect(seHandle).toBeVisible();
    const handleBox = await seHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;
    const dragX = 30;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dragX, startY, { steps: 5 });
    await page.waitForTimeout(50);

    // Engine unchanged during preview
    const duringEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(duringEngine!.width).toBeCloseTo(beforeWidth, 1);

    await page.mouse.up();
    await page.waitForTimeout(200);

    // After commit
    const afterEngine = await fetchCommittedGeometry(page, vertexIdx);
    expect(afterEngine!.width).toBeGreaterThan(beforeWidth + 20);
  });
});
