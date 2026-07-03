/**
 * move-vertex-rotation.spec.ts — regression test for the v0.105.0 fix.
 *
 * The MoveVertex payload was missing `rotation` / `flip_h` / `flip_v`,
 * so the engine's CellGeometry deserializer rejected the command with
 * `InvalidCommand: missing field \`rotation\`` and drag / inspector /
 * resize-handle edits silently did nothing. This test verifies that a
 * simple mouse drag on the canvas actually moves the shape.
 */
import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady } from './helpers/app-ready.js';

const SIMPLE_RECT_PATH = fixturePath('simple-rect.drawio');

test.describe('MoveVertex payload regression (v0.105.0)', () => {
  test('drag a shape in the canvas moves it (data-vertex-id x changes)', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg');
    await page.waitForTimeout(300);

    const rect = page.locator('[data-testid="viewer"] [data-vertex-id]').first();
    const before = await rect.getAttribute('x');

    // Drag the shape by ~30 px right. The doc-space delta is the
    // CSS delta scaled by the viewBox fit-to-view factor — for a single
    // shape spanning most of the viewBox the factor is ~1, so a 30-CSS-px
    // drag ≈ 30 doc-units of x. We just assert the x attribute changed.
    const box = await rect.boundingBox();
    if (!box) throw new Error('shape not found');
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 25, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(250);

    const after = await rect.getAttribute('x');
    expect(after).not.toBe(before);
    expect(after).not.toBeNull();
    // The new x must be greater than the previous one (we dragged right).
    expect(parseFloat(after!)).toBeGreaterThan(parseFloat(before!));
  });
});
