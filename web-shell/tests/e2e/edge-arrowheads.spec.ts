/**
 * edge-arrowheads.spec.ts — E2E tests for endArrow / startArrow rendering.
 *
 * Verifies the SVG output reflects the draw.io endArrow/startArrow
 * styles stored on edge cells. Each scenario loads a fixture with
 * the style pre-applied and asserts the engine emits the
 * corresponding marker reference on the <line> element.
 *
 * Why fixtures instead of inspector controls: the inspector pane
 * doesn't expose arrow-style controls (only fill/stroke/etc.). The
 * supported way to set arrow styles is via .drawio import (or direct
 * command dispatch via WASM, which the inspector also routes to).
 * Fixture-based tests are therefore both realistic and stable.
 *
 * Each test captures a screenshot of the canvas so a regression
 * in rendering is caught visually, not just structurally.
 * Screenshots are committed to
 * web-shell/tests/e2e/edge-arrowheads.spec.ts-snapshots/.
 *
 * Spec scenarios: ARROW-001..ARROW-005 (new, see ADR-0075).
 *
 * Run: `npx playwright test tests/e2e/edge-arrowheads.spec.ts`
 */

import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';

const TWO_SHAPES_PATH = fixturePath('two-shapes-with-edge.drawio');
const TWO_SHAPES_BLOCK_PATH = fixturePath('two-shapes-endArrow-block.drawio');
const TWO_SHAPES_OPEN_PATH = fixturePath('two-shapes-endArrow-open.drawio');
const TWO_SHAPES_NONE_PATH = fixturePath('two-shapes-endArrow-none.drawio');
const TWO_SHAPES_START_BLOCK_PATH = fixturePath('two-shapes-startArrow-block.drawio');

/** Selector for engine-rendered edges (top-level <line fill="none"> in the SVG). */
const EDGE_SELECTOR = 'svg > line[fill="none"]';

/**
 * Helper: load a fixture file and wait for the canvas to render.
 * Each fixture in this spec has 2 shapes and 1 edge.
 */
async function loadFixture(
  page: import('@playwright/test').Page,
  path: string,
): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.setInputFiles('[data-testid="file-input"]', path);
  await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
  // Wait for the engine edge to render
  await expect(page.locator(EDGE_SELECTOR)).toHaveCount(1, { timeout: 5000 });
}

test.describe('Suite ARROW: edge arrowhead rendering (ADR-0075)', () => {
  test('ARROW-001: default (no style) renders classic triangle marker', async ({ page }) => {
    await loadFixture(page, TWO_SHAPES_PATH);

    const edge = page.locator(EDGE_SELECTOR).first();
    // Draw.io default: marker-end=url(#arrow-end-classic) when no explicit style
    await expect(edge).toHaveAttribute('marker-end', 'url(#arrow-end-classic)');
    // Default: no source arrow
    await expect(edge).not.toHaveAttribute('marker-start', /.*/);

    await page
      .locator('[data-testid="canvas-container"]')
      .screenshot({ path: 'tests/e2e/edge-arrowheads.spec.ts-snapshots/ARROW-001-default-classic.png' });
  });

  test('ARROW-002: endArrow=block renders filled rect marker', async ({ page }) => {
    await loadFixture(page, TWO_SHAPES_BLOCK_PATH);

    const edge = page.locator(EDGE_SELECTOR).first();
    await expect(edge).toHaveAttribute('marker-end', 'url(#arrow-end-block)');

    await page
      .locator('[data-testid="canvas-container"]')
      .screenshot({ path: 'tests/e2e/edge-arrowheads.spec.ts-snapshots/ARROW-002-endArrow-block.png' });
  });

  test('ARROW-003: endArrow=open renders outline marker', async ({ page }) => {
    await loadFixture(page, TWO_SHAPES_OPEN_PATH);

    const edge = page.locator(EDGE_SELECTOR).first();
    await expect(edge).toHaveAttribute('marker-end', 'url(#arrow-end-open)');

    await page
      .locator('[data-testid="canvas-container"]')
      .screenshot({ path: 'tests/e2e/edge-arrowheads.spec.ts-snapshots/ARROW-003-endArrow-open.png' });
  });

  test('ARROW-004: endArrow=none omits marker-end', async ({ page }) => {
    await loadFixture(page, TWO_SHAPES_NONE_PATH);

    const edge = page.locator(EDGE_SELECTOR).first();
    await expect(edge).not.toHaveAttribute('marker-end', /.*/);

    await page
      .locator('[data-testid="canvas-container"]')
      .screenshot({ path: 'tests/e2e/edge-arrowheads.spec.ts-snapshots/ARROW-004-endArrow-none.png' });
  });

  test('ARROW-005: startArrow=block adds marker-start, endArrow stays default', async ({ page }) => {
    await loadFixture(page, TWO_SHAPES_START_BLOCK_PATH);

    const edge = page.locator(EDGE_SELECTOR).first();
    await expect(edge).toHaveAttribute('marker-start', 'url(#arrow-start-block)');
    await expect(edge).toHaveAttribute('marker-end', 'url(#arrow-end-classic)');

    await page
      .locator('[data-testid="canvas-container"]')
      .screenshot({ path: 'tests/e2e/edge-arrowheads.spec.ts-snapshots/ARROW-005-startArrow-block.png' });
  });
});
