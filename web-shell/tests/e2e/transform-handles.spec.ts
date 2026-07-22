/**
 * transform-handles.spec.ts — browser-backed coverage for the visible transform
 * handles contract. These tests guard the real user workflow, not only the
 * persisted MoveVertex payload.
 */
import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';

const GROUP_NESTED_PATH = new URL(
  '../../public/fixtures/group-nested-e2e.drawio',
  import.meta.url,
).pathname;

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
 * Compute CSS→doc scale from the live SVG viewBox and svgRect.
 * Throws if data is missing (fail-closed oracle).
 */
async function getCssToDocScale(
  page: import('@playwright/test').Page,
): Promise<{ scaleX: number; scaleY: number }> {
  return await page.evaluate(() => {
    const viewer = document.querySelector('[data-testid="viewer"]') as HTMLElement;
    const svg = viewer?.querySelector('svg') as SVGSVGElement | null;
    if (!viewer || !svg) throw new Error('viewer or svg not found');
    const viewBox = svg.getAttribute('viewBox');
    if (!viewBox) throw new Error('viewBox not found');
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4) throw new Error(`Invalid viewBox: ${viewBox}`);
    const [vbX, vbY, vbW, vbH] = parts as [number, number, number, number];
    const svgRect = svg.getBoundingClientRect();
    if (svgRect.width === 0 || svgRect.height === 0)
      throw new Error('SVG bounding rect has zero size');
    void vbX;
    void vbY;
    return { scaleX: vbW / svgRect.width, scaleY: vbH / svgRect.height };
  });
}

async function loadAndSelectSimpleRect(page: import('@playwright/test').Page) {
  await page.goto('/');
  await waitForAppReady(page);
  await page.evaluate(() => {
    const debug = (
      window as unknown as {
        __hodeiDebug?: {
          addRectAt?: (_x: number, _y: number, _width: number, _height: number) => boolean | null;
        };
      }
    ).__hodeiDebug;
    if (!debug?.addRectAt) throw new Error('__hodeiDebug.addRectAt is not available');
    debug.addRectAt(120, 100, 80, 40);
    // A second rectangle expands the viewBox so the selected rect's transform
    // handles are inside the SVG viewport instead of sitting on its edges.
    debug.addRectAt(420, 20, 60, 40);
  });
  await page.waitForSelector('[data-testid="viewer"] svg');
  await page.waitForTimeout(250);

  const viewer = page.locator('[data-testid="viewer"]');
  const rect = viewer.locator('[data-vertex-id]').first();
  const box = await rect.boundingBox();
  if (!box) throw new Error('simple rect not visible');

  // Extract vertex index for committed geometry checks
  const idAttr = await rect.getAttribute('data-vertex-id');
  expect(idAttr).toMatch(/^\d+:\d+$/);
  const [idxStr] = idAttr!.split(':');
  const vertexIdx = parseInt(idxStr!);

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(rect).toHaveClass(/selected/);
  await expect(viewer.locator('.resize-handle')).toHaveCount(8);
  return { viewer, rect, vertexIdx };
}

test.describe('Transform handles visual contract', () => {
  test('drag preview moves selected shape and transform handles together before mouseup', async ({
    page,
  }) => {
    const { viewer, rect } = await loadAndSelectSimpleRect(page);
    const nwHandle = viewer.locator('.resize-handle[data-handle="nw"]');

    const rectBefore = await rect.boundingBox();
    const handleBefore = await nwHandle.boundingBox();
    if (!rectBefore || !handleBefore) throw new Error('shape or handle not visible before drag');

    await page.mouse.move(
      rectBefore.x + rectBefore.width / 2,
      rectBefore.y + rectBefore.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      rectBefore.x + rectBefore.width / 2 + 45,
      rectBefore.y + rectBefore.height / 2 + 25,
      {
        steps: 5,
      },
    );

    const rectDuring = await rect.boundingBox();
    const handleDuring = await nwHandle.boundingBox();
    await page.mouse.up();

    if (!rectDuring || !handleDuring) throw new Error('shape or handle not visible during drag');
    expect(rectDuring.x).toBeGreaterThan(rectBefore.x + 20);
    expect(handleDuring.x).toBeGreaterThan(handleBefore.x + 20);
    expect(handleDuring.y).toBeGreaterThan(handleBefore.y + 10);
  });

  test('dragging a resize handle keeps transform handles visible and commits size change', async ({
    page,
  }) => {
    const { viewer, rect, vertexIdx } = await loadAndSelectSimpleRect(page);

    // Resize handles should be visible when shape is selected
    await expect(viewer.locator('.resize-handle')).toHaveCount(8);

    // East handle should be visible
    const eastHandle = viewer.locator('.resize-handle[data-handle="e"]');
    await expect(eastHandle).toBeVisible();

    const handleBox = await eastHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    // Get CSS→doc scale for computing expected delta
    const { scaleX } = await getCssToDocScale(page);
    expect(scaleX).toBeGreaterThan(0);

    // Read committed geometry BEFORE drag
    const before = await fetchCommittedGeometry(page, vertexIdx);
    expect(before).not.toBeNull();
    expect(before!.width).toBeCloseTo(80, 1);

    // Drag the east handle rightward by 35px
    const CSS_DRAG_PX = 35;
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2 + CSS_DRAG_PX,
      handleBox!.y + handleBox!.height / 2,
      { steps: 5 },
    );
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Read committed geometry AFTER drag
    const after = await fetchCommittedGeometry(page, vertexIdx);
    expect(after).not.toBeNull();

    // Assert the committed width delta matches the expected doc-space delta
    const expectedWidthDelta = CSS_DRAG_PX * scaleX;
    const actualWidthDelta = after!.width - before!.width;
    expect(actualWidthDelta).toBeCloseTo(expectedWidthDelta, 1);

    // Height should be unchanged for an east (horizontal) handle
    expect(after!.height).toBeCloseTo(before!.height, 1);

    // After drag, resize handles should still be visible (shape stayed selected)
    await expect(viewer.locator('.resize-handle')).toHaveCount(8);
  });

  test('single-shape selection shows a rotation handle and dragging it rotates the shape', async ({
    page,
  }) => {
    const { viewer, rect } = await loadAndSelectSimpleRect(page);
    const rotationHandle = viewer.locator('.rotation-handle');
    await expect(rotationHandle).toHaveCount(1);

    const rectBox = await rect.boundingBox();
    const handleBox = await rotationHandle.boundingBox();
    if (!rectBox || !handleBox)
      throw new Error('shape or rotation handle not visible before rotate');

    const rectCenterX = rectBox.x + rectBox.width / 2;
    const handleCenterX = handleBox.x + handleBox.width / 2;
    expect(Math.abs(handleCenterX - rectCenterX)).toBeLessThan(3);

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(rectBox.x + rectBox.width + 30, rectBox.y + rectBox.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await page.waitForTimeout(250);

    const outerHTML = await viewer
      .locator('svg')
      .first()
      .evaluate((el) => el.outerHTML);
    expect(outerHTML).toMatch(/rotate\((?!0(?:\.0+)?(?:\s|\)))/);
  });
});

test.describe('Group handles (SCENARIO-20 latent bug regression)', () => {
  // SCENARIO-20: Group was missing from overlay SHAPE_KEYS (F5 latent bug).
  // After the fix, Groups appear in the scene and sceneBounds() resolves their bounds.
  // The full E2E (click Group → handles appear) requires app-level group-drill-down
  // selection behavior (ADR-0082) which is outside r107 scope.
  // The unit test in scene-bounds.test.ts covers the Group regression.

  test('Group renders in the scene via sceneBounds (Group regression)', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.setInputFiles('[data-testid="file-input"]', GROUP_NESTED_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg');
    await page.waitForTimeout(300);

    const viewer = page.locator('[data-testid="viewer"]');
    // Verify a Group element is present in the rendered SVG
    const groupCount = await viewer.locator('g[data-group-id]').count();
    expect(groupCount).toBeGreaterThan(0);
  });

  // Verifies __hodeiDebug.addGroupAt works correctly (T21 correction).
  // The hook was implemented but unused — this test exercises it directly.
  test('addGroupAt creates a Group that sceneBounds resolves (API regression)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const debug = (
        window as unknown as {
          __hodeiDebug?: {
            addGroupAt?: (
              _x: number,
              _y: number,
              _width: number,
              _height: number,
            ) => boolean | null;
          };
        }
      ).__hodeiDebug;
      if (!debug?.addGroupAt) throw new Error('__hodeiDebug.addGroupAt is not available');
      // Create a group at doc-space coordinates
      const result = debug.addGroupAt(100, 100, 200, 150);
      if (!result) throw new Error('addGroupAt returned null');
    });
    await page.waitForSelector('[data-testid="viewer"] svg');
    await page.waitForTimeout(250);

    const viewer = page.locator('[data-testid="viewer"]');
    // Verify the Group element exists in the rendered SVG
    const groupCount = await viewer.locator('g[data-group-id]').count();
    expect(groupCount).toBeGreaterThan(0);
  });
});
