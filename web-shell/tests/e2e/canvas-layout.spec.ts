import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady, dismissErrorBanner } from './helpers/app-ready.js';

const MULTI_SHAPES_PATH = fixturePath('multi-shapes.drawio');

test.describe('Suite L: canvas-layout', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
    await dismissErrorBanner(page);
  });

  /** Read vertex positions as {x, y} tuples (null-safe). */
  async function readPositions(page: import('@playwright/test').Page): Promise<{ x: string | null; y: string | null }[]> {
    return page.locator('[data-vertex-id]').evaluateAll((els) =>
      els.map((el) => ({ x: el.getAttribute('x'), y: el.getAttribute('y') }))
    );
  }

  /** Apply a layout via the menu and verify positions actually changed. */
  async function applyLayoutAndVerifyMoved(
    page: import('@playwright/test').Page,
    layoutTestId: string
  ): Promise<void> {
    const before = await readPositions(page);
    await page.click('[data-testid="menu-arrange"] summary');
    await page.click(`[data-testid="${layoutTestId}"]`);
    await page.waitForTimeout(800);
    await dismissErrorBanner(page);

    const errorMsg = await page.locator('[data-testid="error-message"]').textContent().catch(() => '');
    expect(errorMsg).toBe('');

    const after = await readPositions(page);
    const moved = after.some((pos, i) =>
      before[i] !== undefined &&
      (pos?.x !== before[i]?.x || pos?.y !== before[i]?.y)
    );
    expect(moved).toBe(true);
  }

  /**
   * Organic layout re-arranges vertices into a force-directed graph.
   * Bug fixed in v0.78: LayoutConfig now accepts empty `{}` (serde defaults).
   */
  test('Organic layout rearranges vertices', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();
    await applyLayoutAndVerifyMoved(page, 'menu-layout-organic');
  });

  /**
   * Circular layout places vertices around a circle.
   */
  test('Circular layout rearranges vertices', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();
    await applyLayoutAndVerifyMoved(page, 'menu-layout-circular');
  });

  /**
   * Grid layout arranges vertices in a grid.
   */
  test('Grid layout rearranges vertices', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();
    await applyLayoutAndVerifyMoved(page, 'menu-layout-grid');
  });

  /**
   * Tree layout menu item is visible when a DAG-capable diagram is loaded.
   */
  test('Tree layout menu item is visible', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();

    await page.click('[data-testid="menu-arrange"] summary');
    await expect(page.locator('[data-testid="menu-layout-tree"]')).toBeVisible();
  });

  /**
   * Re-route Edges menu item is always visible.
   */
  test('Re-route Edges menu item is visible', async ({ page }) => {
    await page.click('[data-testid="menu-arrange"] summary');
    await expect(page.locator('text=Re-route Edges')).toBeVisible();
  });
});
