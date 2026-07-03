/**
 * move-resize-modifiers.spec.ts — DRAW.IO parity tests for move/resize matrix.
 *
 * Covers the IP-G "Gaps Restantes" P0 batch documented at
 * `docs/drawio-user-interaction-workflows.md` (workflows catalog).
 * Each test maps to a draw.io parity gap with the `MOVE-NNN` ID in the catalog.
 *
 * Reference:
 *   - docs/drawio-user-interaction-workflows.md
 *   - docs/ROADMAP.md → "Gaps Restantes — Post-IP-G"
 *   - ADR-0079 (interaction parity strategy)
 */
import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady } from './helpers/app-ready.js';

const SIMPLE_RECT_PATH = fixturePath('simple-rect.drawio');

test.describe('MOVE: move/resize modifier matrix (draw.io parity)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  /**
   * Helper: read the SVG `width` / `height` attributes of the test rect in user
   * units. We use attributes (not CSS pixels) because the viewer keeps an
   * external zoom transform that does NOT recompute when the SVG viewBox
   * changes — CSS bounding rect stays invariant across 1-user-unit resizes.
   */
  async function readAttrs(rect: import('@playwright/test').Locator) {
    return rect.evaluate((el) => ({
      wAttr: parseFloat(el.getAttribute('width') ?? '0'),
      hAttr: parseFloat(el.getAttribute('height') ?? '0'),
    }));
  }

  /**
   * MOVE-013: Ctrl+Shift+Arrow resizes the selected shape(s).
   *
   *   - Left/Right adjusts width by −1/+1 doc-units.
   *   - Up/Down adjusts height by −1/+1 doc-units.
   *   - No-op when nothing is selected.
   *   - Each press fires once and is undoable.
   */
  test('MOVE-013: Ctrl+Shift+Right grows selected rect width by 1', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5_000 });

    const rect = page.locator('[data-testid="viewer"] [data-vertex-id]').first();

    const before = await readAttrs(rect);
    await rect.click();
    await page.waitForTimeout(100);
    await expect(rect).toHaveClass(/selected/);

    await page.keyboard.press('Control+Shift+ArrowRight');
    await page.waitForTimeout(150);

    const after = await readAttrs(rect);

    // Width should grow; height should NOT change (we only adjusted width).
    expect(after.wAttr).toBe(before.wAttr + 1);
    expect(after.hAttr).toBe(before.hAttr);
  });

  test('MOVE-013: Ctrl+Shift+ArrowDown grows selected rect height by 1', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5_000 });

    const rect = page.locator('[data-testid="viewer"] [data-vertex-id]').first();

    const before = await readAttrs(rect);
    await rect.click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+Shift+ArrowDown');
    await page.waitForTimeout(150);

    const after = await readAttrs(rect);

    expect(after.hAttr).toBe(before.hAttr + 1);
    expect(after.wAttr).toBe(before.wAttr);
  });

  test('MOVE-013: Ctrl+Shift+Left shrinks selected rect width', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5_000 });

    const rect = page.locator('[data-testid="viewer"] [data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(100);

    // Grow by 2 first to have margin to shrink from
    await page.keyboard.press('Control+Shift+ArrowRight');
    await page.waitForTimeout(80);
    await page.keyboard.press('Control+Shift+ArrowRight');
    await page.waitForTimeout(80);

    const grown = await readAttrs(rect);
    expect(grown.wAttr).toBeGreaterThan(80 + 1); // initial 80 + 2 grows

    await page.keyboard.press('Control+Shift+ArrowLeft');
    await page.waitForTimeout(150);

    const shrunk = await readAttrs(rect);
    expect(shrunk.wAttr).toBe(grown.wAttr - 1);
  });

  test('MOVE-013: Ctrl+Shift+Arrow without selection is a no-op (no crash)', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5_000 });

    const rect = page.locator('[data-testid="viewer"] [data-vertex-id]').first();

    const before = await readAttrs(rect);

    await page.keyboard.press('Control+Shift+ArrowRight');
    await page.waitForTimeout(150);

    const after = await readAttrs(rect);

    expect(after.wAttr).toBe(before.wAttr);
    expect(after.hAttr).toBe(before.hAttr);
  });

  test('MOVE-013: multi-selection resizes each shape', async ({ page }) => {
    const TWO_SHAPES_PATH = fixturePath('two-shapes.drawio');
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5_000 });

    const shapes = page.locator('[data-testid="viewer"] [data-vertex-id]');
    const beforeW = await shapes.evaluateAll((els) =>
      els.map((el) => parseFloat(el.getAttribute('width') ?? '0')),
    );

    await shapes.nth(0).click();
    await page.keyboard.down('Shift');
    await shapes.nth(1).click();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+Shift+ArrowRight');
    await page.waitForTimeout(200);

    const afterW = await shapes.evaluateAll((els) =>
      els.map((el) => parseFloat(el.getAttribute('width') ?? '0')),
    );

    expect(afterW.length).toBe(2);
    for (let i = 0; i < 2; i++) {
      expect(afterW[i]).toBe(beforeW[i]! + 1);
    }
  });
});
