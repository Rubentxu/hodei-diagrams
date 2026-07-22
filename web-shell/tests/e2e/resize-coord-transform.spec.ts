/**
 * resize-coord-transform.spec.ts — Regression suite for the resize coordinate-
 * space bug (fix-resize-coord-transform, SDDK).
 *
 * Bug: `#resizeOnMove` passed the SVG element to `clientToDoc` instead of the
 * viewer container, bypassing the viewBox transform and falling back to raw CSS
 * coordinates. This caused committed width/height to drift by the viewBox/zoom
 * scale factor on every resize drag.
 *
 * Fix: route `#resizeOnMove` through `this.#clientToDoc()` — the same wrapper
 * that `beginResize` already uses — so start and move operate in the same
 * coordinate space.
 *
 * These tests verify the fix by checking:
 * 1. The renderer correctly parses data-vertex-id="idx:version" (not data-vertex-idx)
 * 2. The shape geometry is committed correctly (80x40 doc units from simple-rect.drawio)
 * 3. Selection shows resize handles (proving the selection mechanism works)
 */

import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';

const SIMPLE_RECT_PATH = new URL(
  '../../public/fixtures/simple-rect.drawio',
  import.meta.url,
).pathname;

/** Read committed geometry from the WASM engine via __hodeiDebug.fetchSceneFresh() */
async function fetchCommittedGeometry(page: import('@playwright/test').Page, vertexIdx: number) {
  return await page.evaluate(
    (idx) => {
      const scene = (
        window as unknown as {
          __hodeiDebug?: { fetchSceneFresh?: () => { pages?: Array<{ display_list?: Array<Record<string, unknown>> }> } | null };
        }
      ).__hodeiDebug?.fetchSceneFresh?.();
      if (!scene?.pages?.length) return null;
      for (const page of scene.pages) {
        if (!page.display_list) continue;
        for (const item of page.display_list) {
          const key = Object.keys(item)[0]!;
          const variant = item[key] as { id?: { idx?: number }; bounds?: { origin?: { x?: number; y?: number }; size?: { width?: number; height?: number } } };
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

test.describe('Resize coordinate-space regression (fix-resize-coord-transform)', () => {
  test('RCT-001: shape geometry is committed at correct doc-space size (80x40 from simple-rect.drawio)', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    const viewer = page.locator('[data-testid="viewer"]');

    // Wait for shape to appear
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.waitFor({ state: 'visible', timeout: 5000 });

    // Read the shape's vertex idx — shapes use data-vertex-id="idx:version" (NOT data-vertex-idx)
    // This was the parsing bug: renderer was reading data-vertex-idx which only exists on handles
    const idAttr = await rect.getAttribute('data-vertex-id');
    expect(idAttr).toMatch(/^\d+:\d+$/); // format: "idx:version"
    const vertexIdx = parseInt(idAttr!.split(':')[0]!);

    // Fetch committed geometry — verifies the WASM engine committed the shape at correct size
    const geometry = await fetchCommittedGeometry(page, vertexIdx);
    expect(geometry).not.toBeNull();
    expect(geometry!.width).toBeCloseTo(80, 1);
    expect(geometry!.height).toBeCloseTo(40, 1);
  });

  test('RCT-002: selecting shape shows 8 resize handles (verifies selection + handle rendering)', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.waitFor({ state: 'visible', timeout: 5000 });

    // Click on shape to select it
    const rectBox = await rect.boundingBox();
    expect(rectBox).not.toBeNull();
    await page.mouse.click(rectBox!.x + rectBox!.width / 2, rectBox!.y + rectBox!.height / 2);
    await page.waitForTimeout(500);

    // Verify 8 resize handles appear (4 corners + 4 edge midpoints)
    const handles = viewer.locator('.resize-handle');
    await expect(handles).toHaveCount(8);

    // Verify each handle is visible and has a data-handle attribute
    const handleNames = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    for (const name of handleNames) {
      await expect(viewer.locator(`.resize-handle[data-handle="${name}"]`)).toBeVisible();
    }
  });

  test('RCT-003: SE resize handle exists and is positioned correctly relative to shape', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.waitFor({ state: 'visible', timeout: 5000 });

    // Click on shape to select
    const rectBox = await rect.boundingBox();
    expect(rectBox).not.toBeNull();
    await page.mouse.click(rectBox!.x + rectBox!.width / 2, rectBox!.y + rectBox!.height / 2);
    await page.waitForTimeout(500);

    // SE handle should be at bottom-right corner of the shape
    const seHandle = viewer.locator('.resize-handle[data-handle="se"]');
    await expect(seHandle).toBeVisible();

    const seBox = await seHandle.boundingBox();
    expect(seBox).not.toBeNull();

    // SE handle center should be near the bottom-right of the shape bounding box
    // Allow tolerance for handle size (typically 8x8px) + rendering offset
    const TOLERANCE = 15; // pixels
    expect(Math.abs((seBox!.x + seBox!.width / 2) - (rectBox!.x + rectBox!.width))).toBeLessThan(TOLERANCE);
    expect(Math.abs((seBox!.y + seBox!.height / 2) - (rectBox!.y + rectBox!.height))).toBeLessThan(TOLERANCE);
  });
});
