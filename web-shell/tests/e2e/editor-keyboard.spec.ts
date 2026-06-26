/**
 * editor-keyboard.spec.ts — Keyboard shortcuts coverage.
 *
 * Verifies that draw.io-standard keyboard shortcuts actually select /
 * modify shapes. Run via 'cargo test --workspace' (Playwright e2e suite).
 */

import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';
const MULTI_SHAPES_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/multi-shapes.drawio';

test.describe('Editor: keyboard shortcuts', () => {
  test('Ctrl+A selects all shapes in the current page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const initialCount = await page.locator('[data-vertex-id]').count();
    expect(initialCount, 'multi-shapes.drawio should have multiple shapes').toBeGreaterThanOrEqual(2);

    // Click on empty area to ensure no shape is selected
    const viewer = page.locator('[data-testid="viewer"]');
    await viewer.click({ position: { x: 50, y: 50 } });
    await page.waitForTimeout(150);

    // Select All
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(300);

    // The HUD should reflect the selection count (any value > 0)
    const hudText = await page.locator('[data-testid="hud"]').textContent();
    expect(hudText).not.toContain('Nothing selected');

    // The Selection label should NOT be "Nothing selected"
    const selectionLabel = await page.locator('[data-testid="hud-selection"]').textContent();
    expect(selectionLabel).not.toBe('Nothing selected');
  });

  test('Edit > Select All menu item selects all shapes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Open the Edit menu
    await page.click('summary:has-text("Edit")');
    await page.waitForTimeout(200);

    // Click Select All
    const selectAllItem = page.locator('[data-testid="menu-select-all"]');
    await expect(selectAllItem).toBeVisible();
    await selectAllItem.click();
    await page.waitForTimeout(300);

    const selectionLabel = await page.locator('[data-testid="hud-selection"]').textContent();
    expect(selectionLabel).not.toBe('Nothing selected');
  });

  test('Escape clears the current selection', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Select All
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);

    // Confirm selection
    let selectionLabel = await page.locator('[data-testid="hud-selection"]').textContent();
    expect(selectionLabel).not.toBe('Nothing selected');

    // Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    selectionLabel = await page.locator('[data-testid="hud-selection"]').textContent();
    expect(selectionLabel).toBe('Nothing selected');
  });

  test('Delete key removes selected shape (programmatic selection via Ctrl+A)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const before = await page.locator('[data-vertex-id]').count();
    expect(before).toBeGreaterThanOrEqual(1);

    // Select all then delete
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    const after = await page.locator('[data-vertex-id]').count();
    expect(after, 'Delete should remove all selected shapes').toBeLessThan(before);
  });

  test('Ctrl+Z undoes the last delete', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const before = await page.locator('[data-vertex-id]').count();

    // Select all then delete
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    const afterDelete = await page.locator('[data-vertex-id]').count();
    expect(afterDelete).toBeLessThan(before);

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    const afterUndo = await page.locator('[data-vertex-id]').count();
    expect(afterUndo, 'Undo should restore the deleted shape').toBeGreaterThanOrEqual(before);
  });
});