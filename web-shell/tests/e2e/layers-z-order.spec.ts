/**
 * layers-z-order.spec.ts — E2E coverage for z-order operations
 * (v0.51 context menu, refined through v0.65).
 *
 * Verifies that:
 * - Initial render order matches XML child order (first child = behind)
 * - Bring to Front moves a selected shape to the end of the DOM
 *   (rendered on top)
 * - The z-order change is reflected in the SVG element order
 *
 * Why DOM order matters: the SVG renderer paints elements in document
 * order — later elements overlap earlier ones. The slotmap's
 * `z_order` field is what the engine uses to sort elements before
 * rendering, so a Bring-to-Front operation bumps z_order and the
 * next render emits the elements in the new order.
 *
 * Screenshots committed under
 *   web-shell/tests/e2e/layers-z-order.spec.ts-snapshots/
 * — gitignored per ADR-0075.
 *
 * Spec scenarios: ZORDER-001..ZORDER-002.
 *
 * Run: `npx playwright test tests/e2e/layers-z-order.spec.ts`
 */

import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const OVERLAPPING_FIXTURE = fixturePath('two-shapes-overlapping-different-z.drawio');

/** Returns the data-vertex-id attributes of all vertex elements in DOM order. */
async function vertexDomOrder(page: import('@playwright/test').Page): Promise<string[]> {
  return await page.evaluate(() => {
    const verts = document.querySelectorAll('svg [data-vertex-id]');
    return Array.from(verts).map((el) => el.getAttribute('data-vertex-id') ?? '');
  });
}

test.describe('Suite ZORDER: layers / z-order (ADR-0075)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
    await page.setInputFiles('[data-testid="file-input"]', OVERLAPPING_FIXTURE);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
  });

  test('ZORDER-001: initial render order matches XML child order (first = behind)', async ({ page }) => {
    const order = await vertexDomOrder(page);
    expect(order).toHaveLength(2);
    // id=2 (cell id 2) is first in XML → drawn first → behind
    // id=3 (cell id 3) is second in XML → drawn second → on top
    expect(order[0]).toMatch(/:1$/); // first vertex has lower slotmap idx
    expect(order[1]).toMatch(/:1$/); // both version 1
    // Indices should be 0 < 1 (slotmap order)
    const idx0 = parseInt(order[0]!.split(':')[0]!, 10);
    const idx1 = parseInt(order[1]!.split(':')[0]!, 10);
    expect(idx0).toBeLessThan(idx1);
  });

  test('ZORDER-002: Bring to Front reorders the DOM (selected goes to end)', async ({ page }) => {
    const initialOrder = await vertexDomOrder(page);
    expect(initialOrder).toHaveLength(2);
    const firstVertexId = initialOrder[0]!;

    // Click the first (behind) vertex to select it. The vertex is at
    // (60,60,120,120) — its label text "Behind" sits at (60,60) which
    // covers the top-left corner. Click in the lower portion of the
    // rect (relative position x=50, y=80 → absolute ≈ (110, 140)) which
    // is well clear of the text and not covered by the second vertex
    // (which starts at x=160).
    const firstVertex = page.locator(`svg [data-vertex-id="${firstVertexId}"]`).first();
    await firstVertex.click({ position: { x: 50, y: 80 } });
    await page.waitForTimeout(300);

    // Verify the selection happened (the editor adds a selected class)
    const selectedCount = await page.locator('.selected').count();
    expect(selectedCount).toBeGreaterThanOrEqual(1);

    // Open Arrange > Bring to Front
    const arrangeSummary = page.locator('summary:has-text("Arrange")').first();
    await arrangeSummary.click();
    await page.waitForTimeout(300);
    const bringFrontItem = page.locator('[data-testid="menu-bring-front"]');
    await expect(bringFrontItem).toBeVisible({ timeout: 3000 });
    await bringFrontItem.click();

    // Allow the engine command + re-render to complete
    await page.waitForTimeout(600);

    // The previously-first vertex should now be at the END (drawn on top)
    const newOrder = await vertexDomOrder(page);
    expect(newOrder).toHaveLength(2);
    expect(newOrder[1]).toBe(firstVertexId);
    // The first element in DOM order should now be the OTHER vertex
    expect(newOrder[0]).not.toBe(firstVertexId);
  });
});
