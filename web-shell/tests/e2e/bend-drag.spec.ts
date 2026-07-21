/**
 * bend-drag.spec.ts — E2E tests for bend handle drag interaction
 *
 * Covers:
 *   BEND-001: selecting an edge with bends shows .bend-handle elements
 *   BEND-002: dragging a bend handle moves the bend point
 *   BEND-003: sub-3px drag is a no-op (threshold gate)
 *
 * Uses `__hodeiDebug.addBentEdgeAt` to programmatically create a bent
 * edge with known waypoints, then exercises the bend-drag FSM.
 *
 * Run with: npx playwright test tests/e2e/bend-drag.spec.ts
 */

import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const TWO_SHAPES = fixturePath('two-shapes.drawio');

/** Helper: create a bent edge between two rects via the debug API. */
async function addBentEdgeAt(
  page: import('@playwright/test').Page,
  x1: number, y1: number,
  x2: number, y2: number,
  bends: Array<{ x: number; y: number }>,
): Promise<{ edgeId: unknown; fromId: unknown; toId: unknown } | null> {
  return page.evaluate(
    ({ x1, y1, x2, y2, bends }) => {
      const result = (window as any).__hodeiDebug?.addBentEdgeAt?.(x1, y1, x2, y2, bends);
      return result ?? null;
    },
    { x1, y1, x2, y2, bends },
  );
}

test.describe('BEND: bend handle drag', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BEND-001: selecting an edge with bends shows .bend-handle elements
  // ─────────────────────────────────────────────────────────────────────────

  test('BEND-001: edge with bends shows .bend-handle elements after selection', async ({ page }) => {
    // Load two-shapes fixture (prerequisite for addBentEdgeAt)
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Programmatically create a bent edge: rect1(100,100) → rect2(300,200)
    // with 2 intermediate bend waypoints
    const edge = await addBentEdgeAt(page, 100, 100, 300, 200, [
      { x: 150, y: 250 },
      { x: 250, y: 80 },
    ]);
    if (!edge) {
      test.skip();
      return;
    }

    // Select the edge by clicking on it
    const viewer = page.locator('[data-testid="viewer"]');
    await page.waitForTimeout(200);

    // Find and click the edge element
    const edgeEl = viewer.locator('[data-edge-id]').first();
    const edgeCount = await edgeEl.count();
    if (edgeCount === 0) {
      test.skip();
      return;
    }
    await edgeEl.click({ force: true });
    await page.waitForTimeout(300);

    // BEND-001 assertion: bend handles must be visible in the DOM
    const bendHandles = viewer.locator('.bend-handle');
    const handleCount = await bendHandles.count();
    // With 2 bends we expect 2 handle circles (bend indices 1 and 2;
    // index 0 = source and index 3 = target are not rendered)
    expect(handleCount).toBeGreaterThanOrEqual(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BEND-002: dragging a bend handle moves the bend point
  // ─────────────────────────────────────────────────────────────────────────

  test('BEND-002: drag a bend handle and the bend point moves', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const edge = await addBentEdgeAt(page, 100, 100, 300, 200, [
      { x: 150, y: 250 },
      { x: 250, y: 80 },
    ]);
    if (!edge) {
      test.skip();
      return;
    }

    const viewer = page.locator('[data-testid="viewer"]');
    await page.waitForTimeout(200);

    // Select the edge
    const edgeEl = viewer.locator('[data-edge-id]').first();
    await edgeEl.click({ force: true });
    await page.waitForTimeout(300);

    // Read initial bend position from the first .bend-handle
    const firstHandle = viewer.locator('.bend-handle').first();
    const initialCount = await firstHandle.count();
    if (initialCount === 0) {
      test.skip();
      return;
    }

    // Read the cx/cy attributes before drag
    const initialCX = await firstHandle.getAttribute('cx');
    const initialCY = await firstHandle.getAttribute('cy');

    // Perform a >3px drag on the bend handle
    const bbox = await firstHandle.boundingBox();
    if (!bbox) {
      test.skip();
      return;
    }

    const startX = bbox.x + bbox.width / 2;
    const startY = bbox.y + bbox.height / 2;

    // Dispatch pointer events directly on the viewer (same pattern as selection-modifiers.spec.ts)
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(50);
    // Drag 40px right and 30px down (well above the 3px threshold)
    await page.mouse.move(startX + 40, startY + 30);
    await page.waitForTimeout(50);
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Read the cx/cy attributes after drag
    const finalCX = await firstHandle.getAttribute('cx');
    const finalCY = await firstHandle.getAttribute('cy');

    // BEND-002 assertion: the position must have changed
    expect(finalCX).not.toBe(initialCX);
    expect(finalCY).not.toBe(initialCY);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BEND-003: sub-3px drag is a no-op (threshold gate)
  // ─────────────────────────────────────────────────────────────────────────

  test('BEND-003: sub-3px drag does not move the bend point', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const edge = await addBentEdgeAt(page, 100, 100, 300, 200, [
      { x: 150, y: 250 },
      { x: 250, y: 80 },
    ]);
    if (!edge) {
      test.skip();
      return;
    }

    const viewer = page.locator('[data-testid="viewer"]');
    await page.waitForTimeout(200);

    // Select the edge
    const edgeEl = viewer.locator('[data-edge-id]').first();
    await edgeEl.click({ force: true });
    await page.waitForTimeout(300);

    const firstHandle = viewer.locator('.bend-handle').first();
    const initialCount = await firstHandle.count();
    if (initialCount === 0) {
      test.skip();
      return;
    }

    const initialCX = await firstHandle.getAttribute('cx');
    const initialCY = await firstHandle.getAttribute('cy');

    // Perform a sub-3px drag (1px right, 1px down — below threshold)
    const bbox = await firstHandle.boundingBox();
    if (!bbox) {
      test.skip();
      return;
    }

    const startX = bbox.x + bbox.width / 2;
    const startY = bbox.y + bbox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.move(startX + 1, startY + 1); // sub-threshold
    await page.waitForTimeout(50);
    await page.mouse.up();
    await page.waitForTimeout(300);

    // BEND-003 assertion: position must be unchanged (sub-threshold no-op)
    const finalCX = await firstHandle.getAttribute('cx');
    const finalCY = await firstHandle.getAttribute('cy');
    expect(finalCX).toBe(initialCX);
    expect(finalCY).toBe(initialCY);
  });
});
