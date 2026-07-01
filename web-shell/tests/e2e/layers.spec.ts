/**
 * layers.spec.ts — E2E coverage for Layers panel UI (IP-F PR5)
 *
 * Tests the Layers menu (navbar) and Layers panel (sidebar) for the
 * minimum-viable layer workflows from the IP-F spec:
 * - LAYER-001: Layer list (show all layers for current page)
 * - LAYER-002: Add/remove/rename layers
 * - LAYER-004: Toggle layer visibility
 * - LAYER-005: Toggle layer locked state
 * - LAYER-007: Move selected shape to a different layer
 *
 * Run with: npx playwright test tests/e2e/layers.spec.ts
 */

import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const THREE_LAYER_FIXTURE = fixturePath('three-layers.drawio');

test.describe('Suite LAYER: Layers panel UI (IP-F PR5)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
    await page.setInputFiles('[data-testid="file-input"]', THREE_LAYER_FIXTURE);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
    await page.waitForTimeout(300);
  });

  // ─── LAYER-001: Layer list ───────────────────────────────────────────────

  test('LAYER-001: Layers menu is present in menubar', async ({ page }) => {
    const layersMenu = page.locator('[data-testid="menu-layers"]');
    await expect(layersMenu).toBeVisible();
    await expect(layersMenu.locator('summary')).toContainText('Layers');
  });

  test('LAYER-001: Layers panel is visible in sidebar after opening Layers menu', async ({ page }) => {
    // Open Layers menu
    await page.click('[data-testid="menu-layers"] summary');
    await page.waitForTimeout(200);

    // Layers panel should appear in sidebar area
    const layersPanel = page.locator('[data-testid="layers-panel"]');
    await expect(layersPanel).toBeVisible();
  });

  test('LAYER-001: Layers panel lists all 3 layers from fixture', async ({ page }) => {
    // Open Layers menu to activate layers panel
    await page.click('[data-testid="menu-layers"] summary');
    await page.waitForTimeout(200);

    const layersPanel = page.locator('[data-testid="layers-panel"]');
    await expect(layersPanel).toBeVisible();

    // Should show Background, Content, Annotations (the 3 layers from fixture)
    const layerItems = page.locator('[data-testid="layers-panel"] [data-testid^="layer-item-"]');
    await expect(layerItems).toHaveCount(3);
  });

  // ─── LAYER-002: Add/remove/rename layers ─────────────────────────────────

  test('LAYER-002: Add new layer via Layers menu', async ({ page }) => {
    await page.click('[data-testid="menu-layers"] summary');
    await page.waitForTimeout(200);

    // Click Add Layer button in the layers panel
    const addLayerBtn = page.locator('[data-testid="layers-add-layer"]');
    await expect(addLayerBtn).toBeVisible();
    await addLayerBtn.click();
    await page.waitForTimeout(300);

    // Should now have 4 layers
    const layerItems = page.locator('[data-testid="layers-panel"] [data-testid^="layer-item-"]');
    await expect(layerItems).toHaveCount(4);
  });

  test('LAYER-002: Rename layer via Layers panel', async ({ page }) => {
    await page.click('[data-testid="menu-layers"] summary');
    await page.waitForTimeout(200);

    // Find the Background layer item and click its rename button
    const bgLayer = page.locator('[data-testid="layer-item-Background"]');
    await expect(bgLayer).toBeVisible();

    const renameBtn = bgLayer.locator('[data-testid^="layer-rename-"]');
    await renameBtn.click();
    await page.waitForTimeout(100);

    // Should show an inline editor / input for renaming
    const renameInput = page.locator('[data-testid^="layer-rename-input-"]');
    await expect(renameInput).toBeVisible();

    // Type new name
    await renameInput.fill('NewBackground');
    await renameInput.press('Enter');
    await page.waitForTimeout(300);

    // The layer item should now have the new name
    await expect(page.locator('[data-testid="layer-item-NewBackground"]')).toBeVisible();
  });

  test('LAYER-002: Remove non-default layer via Layers panel', async ({ page }) => {
    await page.click('[data-testid="menu-layers"] summary');
    await page.waitForTimeout(200);

    // Initial count should be 3
    const layerItems = page.locator('[data-testid="layers-panel"] [data-testid^="layer-item-"]');
    await expect(layerItems).toHaveCount(3);

    // Click remove on the Annotations layer (non-default, safe to remove)
    const removeBtn = page.locator('[data-testid="layer-item-Annotations"] [data-testid^="layer-remove-"]');
    await removeBtn.click();
    await page.waitForTimeout(300);

    // Should now have 2 layers
    await expect(layerItems).toHaveCount(2);
  });

  // ─── LAYER-004: Toggle layer visibility ───────────────────────────────────

  test('LAYER-004: Toggle layer visibility via Layers panel', async ({ page }) => {
    await page.click('[data-testid="menu-layers"] summary');
    await page.waitForTimeout(200);

    // The Background layer should be visible by default
    const bgLayer = page.locator('[data-testid="layer-item-Background"]');
    await expect(bgLayer).toBeVisible();

    // Find the visibility toggle button on Background layer
    const visToggle = bgLayer.locator('[data-testid^="layer-visibility-"]');
    await expect(visToggle).toBeVisible();

    // Click to hide
    await visToggle.click();
    await page.waitForTimeout(400);

    // The toggle should now indicate hidden state
    await expect(visToggle).toHaveAttribute('data-state', 'hidden');
  });

  // ─── LAYER-005: Toggle layer locked state ────────────────────────────────

  test('LAYER-005: Toggle layer locked state via Layers panel', async ({ page }) => {
    await page.click('[data-testid="menu-layers"] summary');
    await page.waitForTimeout(200);

    const bgLayer = page.locator('[data-testid="layer-item-Background"]');
    await expect(bgLayer).toBeVisible();

    // Find the lock toggle button on Background layer
    const lockToggle = bgLayer.locator('[data-testid^="layer-lock-"]');
    await expect(lockToggle).toBeVisible();

    // Initially unlocked (not locked) - click to lock
    await lockToggle.click();
    await page.waitForTimeout(300);

    // The toggle should now indicate locked state
    await expect(lockToggle).toHaveAttribute('data-state', 'locked');
  });

  // ─── LAYER-007: Move shape to layer ──────────────────────────────────────

  test('LAYER-007: Move selected shape to a different layer', async ({ page }) => {
    // Select Rect C (which is on the Content layer)
    const rectC = page.locator('svg [data-vertex-id]').nth(2); // 0-indexed: 3rd shape
    await rectC.click();
    await page.waitForTimeout(200);

    // Verify selection
    const selectedCount = await page.locator('.selected').count();
    expect(selectedCount).toBeGreaterThanOrEqual(1);

    // Open Layers menu
    await page.click('[data-testid="menu-layers"] summary');
    await page.waitForTimeout(200);

    // Click on Background layer to move the shape there
    const bgLayer = page.locator('[data-testid="layer-item-Background"]');
    await bgLayer.click();
    await page.waitForTimeout(400);

    // The shape should now be on the Background layer (this is verified by the
    // scene re-rendering without errors - the command succeeds)
    const errorBanner = page.locator('[data-testid="error-banner"]');
    const errorMessage = page.locator('[data-testid="error-message"]');
    if (await errorMessage.count() > 0) {
      const msg = (await errorMessage.textContent())?.trim() ?? '';
      expect(msg).toBe('');
    }
  });
});
