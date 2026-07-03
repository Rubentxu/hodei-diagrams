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

/**
 * MOVE-003 — Shift+Arrow nudges the selection to the next grid line in the
 * arrow direction. Without Shift, Arrow still nudges ±1 px (regression guard).
 *
 * MOVE-004 — Alt + Arrow ignores grid snap entirely (smooth move, no snapping).
 */
test.describe('MOVE-003/004: Shift grid + Alt bypass', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  /** Toggle the snap UI menu to a known state by clicking View → Snap until
   *  the HUD reports the desired state. Robust against repeated toggles. */
  async function setSnapEnabled(page: import('@playwright/test').Page, on: boolean) {
    for (let attempts = 0; attempts < 6; attempts++) {
      const snapText = await page.evaluate(() => {
        const hud = document.querySelector('[data-testid="hud-snap"]');
        return hud?.textContent?.toLowerCase() ?? '';
      });
      const snapIsOn = snapText.includes('on');
      if (snapIsOn === on) return;
      const viewMenu = page.locator('summary:has-text("View")').first();
      await viewMenu.click();
      await page.waitForTimeout(60);
      const snapItem = page.locator('[data-testid="menu-snap"]');
      if (await snapItem.isVisible().catch(() => false)) {
        await snapItem.click({ force: true });
      }
      await page.waitForTimeout(120);
    }
  }

  test('MOVE-003: Shift+Right lands selection x on next grid line', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg');

    await setSnapEnabled(page, true);
    await page.waitForTimeout(120);

    const rect = page.locator('[data-testid="viewer"] [data-vertex-id]').first();
    await rect.click();
    await page.waitForTimeout(80);

    // simple-rect.drawio rect starts at x=0 in doc units (which IS grid-aligned).
    // Shift+Right → next grid line strictly greater (dir > 0). GRID_SIZE=20 → x=20.
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(200);

    const attrs = await rect.evaluate((el) => ({
      x: parseFloat(el.getAttribute('x') ?? '0'),
      y: parseFloat(el.getAttribute('y') ?? '0'),
    }));

    expect(attrs.x).toBe(20);
    expect(attrs.y).toBe(0);
  });

  test('MOVE-003: Shift+Right twice lands on x=40 (grid steps accumulate)', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg');

    await setSnapEnabled(page, true);
    await page.waitForTimeout(120);

    const rect = page.locator('[data-testid="viewer"] [data-vertex-id]').first();
    await rect.click();

    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(120);
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(120);

    const attrs = await rect.evaluate((el) => parseFloat(el.getAttribute('x') ?? '0'));
    expect(attrs).toBe(40);
  });

  test('MOVE-004: Alt+Arrow does NOT snap to grid (free pixel move)', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg');

    await setSnapEnabled(page, true);
    await page.waitForTimeout(120);

    const rect = page.locator('[data-testid="viewer"] [data-vertex-id]').first();
    await rect.click();

    // Move to x=20 first with Shift.
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(120);

    // Then Alt+Right 3 times: each moves 1 px (bypasses snap), so x = 23.
    await page.keyboard.down('Alt');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Alt');
    await page.waitForTimeout(200);

    const attrs = await rect.evaluate((el) => ({
      x: parseFloat(el.getAttribute('x') ?? '0'),
    }));

    // Without Alt bypass, x=20 would stay (snap to grid).
    // With Alt, x=23 (one pixel per press, ignoring snap).
    expect(attrs.x).toBe(23);
  });

  test('MOVE-004: Alt+Ctrl+Shift+Right does NOT snap resize origin', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg');

    await setSnapEnabled(page, true);
    await page.waitForTimeout(120);

    const rect = page.locator('[data-testid="viewer"] [data-vertex-id]').first();
    await rect.click();

    // Resize with Alt held. Origin stays at x=0 (no snap to x=20).
    await page.keyboard.down('Alt');
    await page.keyboard.press('Control+Shift+ArrowRight');
    await page.keyboard.up('Alt');
    await page.waitForTimeout(150);

    const attrs = await rect.evaluate((el) => ({
      x: parseFloat(el.getAttribute('x') ?? '0'),
      width: parseFloat(el.getAttribute('width') ?? '0'),
    }));

    expect(attrs.width).toBe(81); // grew by 1
    expect(attrs.x).toBe(0); // origin untouched (Alt bypass)
  });
});
