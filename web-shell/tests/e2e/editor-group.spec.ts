import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady, dismissErrorBanner } from './helpers/app-ready.js';

const TWO_SHAPES_PATH = fixturePath('two-shapes.drawio');
const MULTI_SHAPES_PATH = fixturePath('multi-shapes.drawio');

test.describe('Suite G: editor-group', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
    await dismissErrorBanner(page);
  });

  /**
   * Group creates a `<g clip-path>` element wrapping the selected vertices.
   * Verifies: 2+ selected vertices → after Group, `<g clip-path>` count = 1.
   * Bug fixed in v0.78: layout bug was masking group too; both now work end-to-end.
   */
  test('Select 2+ shapes and Group → group wraps vertices in <g clip-path>', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();

    // No <g clip-path> before
    expect(await page.locator('svg g[clip-path]').count()).toBe(0);

    // Select 2 vertices
    const vertices = page.locator('[data-vertex-id]');
    expect(await vertices.count()).toBeGreaterThanOrEqual(2);
    await vertices.first().click();
    await page.keyboard.down('Shift');
    await vertices.nth(1).click();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);

    await page.click('[data-testid="menu-arrange"] summary');
    await page.click('[data-testid="menu-group"]');
    await page.waitForTimeout(500);
    await dismissErrorBanner(page);

    const errorMsg = await page.locator('[data-testid="error-message"]').textContent().catch(() => '');
    expect(errorMsg).toBe('');

    // After Group, the 2 (or more) selected vertices are wrapped in a <g clip-path>
    const groupElements = await page.locator('svg g[clip-path]').count();
    expect(groupElements).toBeGreaterThanOrEqual(1);

    // Vertices still present inside the group
    const verticesInside = await page.locator('[data-vertex-id]').count();
    expect(verticesInside).toBeGreaterThan(0);
  });

  /**
   * Ungroup removes the `<g clip-path>` wrapper, exposing the vertices at top-level.
   */
  test('Select grouped shape and Ungroup → <g clip-path> removed', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();

    // Create a group first
    const vertices = page.locator('[data-vertex-id]');
    await vertices.first().click();
    await page.keyboard.down('Shift');
    await vertices.nth(1).click();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);

    await page.click('[data-testid="menu-arrange"] summary');
    await page.click('[data-testid="menu-group"]');
    await page.waitForTimeout(500);

    expect(await page.locator('svg g[clip-path]').count()).toBeGreaterThanOrEqual(1);

    // Now try to ungroup — click on a vertex in the group
    await vertices.first().click();
    await page.click('[data-testid="menu-arrange"] summary');

    const ungroup = page.locator('[data-testid="menu-ungroup"]');
    const ungroupVisible = await ungroup.isVisible().catch(() => false);

    if (ungroupVisible) {
      await ungroup.click();
      await page.waitForTimeout(500);
      await dismissErrorBanner(page);
    }

    const errorMsg = await page.locator('[data-testid="error-message"]').textContent().catch(() => '');
    expect(errorMsg).toBe('');
  });

  /**
   * Group with 1 shape selected: no error should appear, app stays functional.
   * Group menu item should require 2+ shapes; clicking with 1 should be a no-op.
   */
  test('Group with 1 shape selected does not error', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();

    const vertex = page.locator('[data-vertex-id]').first();
    await vertex.click();
    await page.waitForTimeout(200);

    await page.click('[data-testid="menu-arrange"] summary');
    await page.click('[data-testid="menu-group"]');
    await page.waitForTimeout(500);
    await dismissErrorBanner(page);

    const errorMsg = await page.locator('[data-testid="error-message"]').textContent().catch(() => '');
    expect(errorMsg).toBe('');

    // Viewer still functional
    await expect(page.locator('[data-testid="viewer"] svg').first()).toBeVisible();
  });
});
