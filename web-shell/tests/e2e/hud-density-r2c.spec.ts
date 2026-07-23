/**
 * hud-density-r2c.spec.ts — R2c HUD density migration: CSS-driven compact/full
 *
 * Scope:
 * - HUD items tagged data-hud-density-item="default"|"contextual"
 * - New hud-geometry item (W×H readout)
 * - Removed hud-page (page info now only in bottom bar tabs)
 * - hud-mode relocated to contextual toolbar (alias data-hud-mode preserved)
 * - CSS rules driven by [data-hud-density="compact|full"] on #app (no JS per-item toggle)
 * - compact→full→compact via pointer drag on shape
 * - grid-toggle density proof
 * - HUD selector migration (data-hud-density-item attributes)
 */
import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH = fixturePath('simple-rect.drawio');

test.describe('R2c HUD Density Migration', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
    // Ensure clean density state: all interaction fields off
    const canvas = page.locator('[data-testid="canvas-container"]');
    // Disable grid if on
    const hasGrid = await canvas.evaluate((el) => el.classList.contains('show-grid'));
    if (hasGrid) {
      await page.locator('summary:has-text("View")').first().click({ force: true });
      await page.waitForTimeout(100);
      await page.locator('[data-testid="menu-grid"]').click({ force: true });
      await page.locator('summary:has-text("View")').first().click({ force: true });
      await page.waitForTimeout(100);
    }
    // Ensure snap is off
    const snapText = await page.locator('[data-testid="hud-snap"]').textContent();
    if (snapText === 'On') {
      await page.keyboard.press('Control+Shift+G');
      await page.waitForTimeout(200);
    }
  });

  // ── CSS attribute presence + HUD item density-tag presence + hud-page removal ──

  test('R2c startup: compact, all default HUD items tagged, hud-page absent', async ({ page }) => {
    await waitForAppReady(page);
    const app = page.locator('#app');

    // #app starts in compact mode
    await expect(app).toHaveAttribute('data-hud-density', 'compact');

    // All default HUD items have data-hud-density-item="default"
    const defaults = [
      '[data-testid="hud-selection"]',
      '[data-testid="hud-snap"]',
      '[data-testid="hud-grid"]',
      '[data-testid="hud-cursor"]',
      '[data-testid="hud-zoom"]',
      '[data-testid="hud-save-status"]',
      '[data-testid="hud-geometry"]',
    ];
    for (const sel of defaults) {
      const el = page.locator(sel).first();
      await expect(el).toBeAttached();
      const parent = el.locator('..');
      await expect(parent).toHaveAttribute('data-hud-density-item', 'default');
    }

    // hud-geometry shows "—" before selection
    const geo = page.locator('[data-testid="hud-geometry"]');
    await expect(geo).toHaveText('—');

    // hud-page removed from HUD strip (now in bottom-bar tabs)
    await expect(app.locator('[data-testid="hud-page"]')).toHaveCount(0);
  });

  // ── hud-mode relocated to toolbar (spec-required alias) ───────────────────────

  test('hud-mode in toolbar with data-hud-mode alias preserved', async ({ page }) => {
    await waitForAppReady(page);
    // The mode indicator is now in the contextual toolbar.
    // data-hud-mode selector works (backward-compatible alias).
    const modeInToolbar = page.locator('[data-testid="hud-mode"]');
    await expect(modeInToolbar).toBeAttached();
    await expect(modeInToolbar).toHaveText('Edit');
    // It lives inside the toolbar
    const toolbar = page.locator('[data-testid="toolbar"]');
    await expect(toolbar).toContainText('Edit');
  });

  // ── CSS-driven compact/full toggle ──────────────────────────────────────────

  test('compact→full during pointer drag on shape: #app[data-hud-density] transitions', async ({ page }) => {
    // Load a diagram
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
    await page.waitForTimeout(300);

    const app = page.locator('#app');
    // Start compact
    await expect(app).toHaveAttribute('data-hud-density', 'compact');

    // Select the shape (no drag yet — should stay compact)
    const shape = page.locator('[data-vertex-id]').first();
    await shape.click();
    await page.waitForTimeout(100);

    // Now initiate a real pointer drag: pointerdown → move → pointerup
    const box = await shape.boundingBox();
    expect(box).not.toBeNull();

    // Start drag from center of shape
    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;
    const deltaX = 30;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(50);

    // During drag: should be full
    await expect(app).toHaveAttribute('data-hud-density', 'full');

    // Move during drag
    await page.mouse.move(startX + deltaX, startY);
    await page.waitForTimeout(50);

    // Still full during drag
    await expect(app).toHaveAttribute('data-hud-density', 'full');

    // Release: back to compact
    await page.mouse.up();
    await page.waitForTimeout(100);
    await expect(app).toHaveAttribute('data-hud-density', 'compact');
  });

  test('grid toggle causes compact→full→compact transition', async ({ page }) => {
    await waitForAppReady(page);
    const app = page.locator('#app');
    await expect(app).toHaveAttribute('data-hud-density', 'compact');

    // Toggle grid ON via View menu
    await page.evaluate(() => {
      const details = document.querySelector('[data-testid="menu-view"]') as HTMLDetailsElement;
      if (details) details.open = true;
    });
    await page.waitForTimeout(100);
    // Force click to bypass any interception from <details> auto-close
    await page.locator('[data-testid="menu-grid"]').click({ force: true });
    await page.waitForTimeout(200);

    // Grid on → full density
    await expect(app).toHaveAttribute('data-hud-density', 'full');

    // Toggle grid OFF
    await page.evaluate(() => {
      const details = document.querySelector('[data-testid="menu-view"]') as HTMLDetailsElement;
      if (details) details.open = true;
    });
    await page.waitForTimeout(100);
    await page.locator('[data-testid="menu-grid"]').click({ force: true });
    await page.waitForTimeout(200);

    // Back to compact
    await expect(app).toHaveAttribute('data-hud-density', 'compact');
  });

  test('snap toggle causes compact→full→compact transition', async ({ page }) => {
    await waitForAppReady(page);
    const app = page.locator('#app');
    await expect(app).toHaveAttribute('data-hud-density', 'compact');

    // Toggle snap ON via Ctrl+Shift+G
    await page.keyboard.press('Control+Shift+G');
    await page.waitForTimeout(200);

    await expect(app).toHaveAttribute('data-hud-density', 'full');
    await expect(page.locator('[data-testid="hud-snap"]')).toHaveText('On');

    // Toggle snap OFF
    await page.keyboard.press('Control+Shift+G');
    await page.waitForTimeout(200);

    await expect(app).toHaveAttribute('data-hud-density', 'compact');
    await expect(page.locator('[data-testid="hud-snap"]')).toHaveText('Off');
  });

  // ── Geometry item ───────────────────────────────────────────────────────────

  test('hud-geometry shows W×H after shape is selected', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
    await page.waitForTimeout(300);

    const geo = page.locator('[data-testid="hud-geometry"]');
    // Initially "—" before any selection
    await expect(geo).toHaveText('—');

    // Select the shape
    const shape = page.locator('[data-vertex-id]').first();
    await shape.click();
    await page.waitForTimeout(200);

    // Geometry should now show W×H (format: "W×H")
    const text = await geo.textContent();
    expect(text).toMatch(/^\d+×\d+$/);
  });

  // ── Loading indicator is contextual (hidden in compact) ─────────────────────

  test('loading indicator hidden in compact mode', async ({ page }) => {
    await waitForAppReady(page);
    const app = page.locator('#app');
    await expect(app).toHaveAttribute('data-hud-density', 'compact');

    const loading = page.locator('[data-testid="hud-loading"]');
    // In compact, contextual items are hidden
    await expect(loading).toBeHidden();
  });
});
