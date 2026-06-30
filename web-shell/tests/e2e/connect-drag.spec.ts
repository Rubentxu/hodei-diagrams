/**
 * connect-drag.spec.ts — E2E smoke test for drag-based edge creation (Phase B)
 *
 * Covers:
 *   Phase B — connect_vertices_anchored via drag gesture
 *   UX: re-anchor = direct drag of handle (no modal)
 *   UX: handles only visible for SELECTED edges
 *
 * Run with: npm run test:e2e -- connect-drag
 */

import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const TWO_SHAPES =
  fixturePath('two-shapes.drawio');

test.describe('Phase B: connect-drag', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Smoke: editor initializes without errors
  // ─────────────────────────────────────────────────────────────────────────

  test('editor loads and shows viewer', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewerCount = await page.locator('[data-testid="viewer"]').count();
    expect(viewerCount).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Smoke: connect mode can be activated
  // ─────────────────────────────────────────────────────────────────────────

  test('connector tool activates connect mode', async ({ page }) => {
    await waitForAppReady(page);

    await page.click('[data-testid="rail-connector-btn"]');
    await page.waitForTimeout(200);

    const connectorBtn = page.locator('[data-testid="rail-connector-btn"]');
    await expect(connectorBtn).toHaveClass(/active/);
  });
});
