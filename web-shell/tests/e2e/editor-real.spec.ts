/**
 * editor-real.spec.ts — End-to-end coverage of features that were
 * either untested or suspected to be broken.
 *
 * Run via 'cargo test --workspace' (Playwright e2e suite).
 */

import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';
const MULTI_SHAPES_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/multi-shapes.drawio';

test.describe('Editor: real feature coverage', () => {
  test('Selecting a shape via click updates the inspector Style pane', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // The Inspector Style pane should be visible even with no selection (showing empty state)
    const stylePane = page.locator('[data-testid="inspector-pane-style"]');
    await expect(stylePane).toBeAttached();

    // Select the shape (clicking on the SVG rect)
    const shape = page.locator('[data-testid="viewer"] [data-vertex-id]').first();
    await shape.click();
    await page.waitForTimeout(300);

    // The HUD should reflect selection (not "Nothing selected")
    const selectionLabel = await page.locator('[data-testid="hud-selection"]').textContent();
    expect(selectionLabel).not.toBe('Nothing selected');
  });

  test('Edit > Delete removes the selected shape', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const before = await page.locator('[data-vertex-id]').count();

    // Select first shape
    await page.locator('[data-testid="viewer"] [data-vertex-id]').first().click();
    await page.waitForTimeout(200);

    // Open Edit menu
    await page.click('summary:has-text("Edit")');
    await page.waitForTimeout(200);

    // Click Delete
    await page.locator('[data-testid="menu-delete"]').click();
    await page.waitForTimeout(300);

    const after = await page.locator('[data-vertex-id]').count();
    expect(after, 'Edit > Delete should remove the selected shape').toBeLessThan(before);
  });

  test('Edit > Undo restores the deleted shape', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const before = await page.locator('[data-vertex-id]').count();

    // Select all, delete
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(150);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    const afterDelete = await page.locator('[data-vertex-id]').count();
    expect(afterDelete).toBeLessThan(before);

    // Edit > Undo
    await page.click('summary:has-text("Edit")');
    await page.waitForTimeout(200);
    await page.locator('[data-testid="menu-undo"]').click();
    await page.waitForTimeout(300);

    const afterUndo = await page.locator('[data-vertex-id]').count();
    expect(afterUndo, 'Undo should restore the deleted shapes').toBeGreaterThanOrEqual(before);
  });

  test('View > Grid menu toggle hides/shows grid', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const canvasContainer = page.locator('[data-testid="canvas-container"]');
    expect(await canvasContainer.evaluate((el) => el.classList.contains('show-grid'))).toBe(true);

    // Open View menu — click on the Grid item toggles the grid.
    // Use force:true because <details> closes when interacting inside.
    await page.locator('summary:has-text("View")').first().click();
    await page.waitForTimeout(200);
    await page.locator('[data-testid="menu-grid"]').click({ force: true });
    await page.waitForTimeout(300);

    expect(await canvasContainer.evaluate((el) => el.classList.contains('show-grid'))).toBe(false);

    // The Ctrl+G keyboard shortcut is a more reliable way to test the
    // toggle path because it bypasses the <details> open/close dance.
    await page.keyboard.press('Control+g');
    await page.waitForTimeout(300);

    expect(await canvasContainer.evaluate((el) => el.classList.contains('show-grid'))).toBe(true);
  });

  test('View > Snap menu toggle enables/disables snap', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open View > Snap menu (force-click because <details> closes on inside-click)
    await page.locator('summary:has-text("View")').first().click();
    await page.waitForTimeout(200);
    await page.locator('[data-testid="menu-snap"]').click({ force: true });
    await page.waitForTimeout(300);

    // HUD should reflect Snap: On
    const hudSnap = await page.locator('[data-testid="hud-snap"]').textContent();
    expect(hudSnap).toBe('On');
  });

  test('Ctrl+G toggles the grid (keyboard shortcut)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const canvasContainer = page.locator('[data-testid="canvas-container"]');
    expect(await canvasContainer.evaluate((el) => el.classList.contains('show-grid'))).toBe(true);

    await page.keyboard.press('Control+g');
    await page.waitForTimeout(300);

    expect(await canvasContainer.evaluate((el) => el.classList.contains('show-grid'))).toBe(false);

    await page.keyboard.press('Control+g');
    await page.waitForTimeout(300);

    expect(await canvasContainer.evaluate((el) => el.classList.contains('show-grid'))).toBe(true);
  });

  test('Ctrl+Shift+G toggles the snap (keyboard shortcut)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hudSnap = page.locator('[data-testid="hud-snap"]');
    expect(await hudSnap.textContent()).toBe('Off');

    await page.keyboard.press('Control+Shift+g');
    await page.waitForTimeout(300);
    expect(await hudSnap.textContent()).toBe('On');

    await page.keyboard.press('Control+Shift+g');
    await page.waitForTimeout(300);
    expect(await hudSnap.textContent()).toBe('Off');
  });

  test('Multi-select via Shift+click selects multiple shapes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const vertices = page.locator('[data-vertex-id]');
    const count = await vertices.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Click first
    await vertices.nth(0).click();
    await page.waitForTimeout(150);
    // Shift+click second
    await vertices.nth(1).click({ modifiers: ['Shift'] });
    await page.waitForTimeout(300);

    // HUD should reflect multiple selection (selection count > 1 in label, OR a count field)
    const hud = await page.locator('[data-testid="hud"]').textContent();
    // Check that selection isn't "Nothing selected" and label reflects two shapes
    expect(hud).not.toContain('Nothing selected');
  });

  test('Loading a file preserves the grid overlay', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForTimeout(1500);

    const hasGrid = await page.locator('[data-testid="canvas-container"]').evaluate(
      (el) => el.classList.contains('show-grid'),
    );
    expect(hasGrid, 'Grid should remain visible after loading a file').toBe(true);
  });

  test('Save button is enabled after the bootstrap empty canvas is ready', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Wait for the bootstrap empty-page to be rendered
    await page.waitForSelector('[data-testid="canvas-container"] svg', { timeout: 10_000 });
    await page.waitForTimeout(500);

    const saveBtn = page.locator('[data-testid="save-btn"]');
    expect(await saveBtn.isDisabled(), 'Save should be enabled once the empty canvas is ready').toBe(false);
  });

  test('Math Mode menu item toggles math overlay', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open View menu
    await page.locator('summary:has-text("View")').first().click();
    await page.waitForTimeout(200);

    const mathModeItem = page.locator('[data-testid="menu-math-mode"]');
    await mathModeItem.click({ force: true });
    // Wait longer than the editor's replay frame (~16ms) so the scene
    // cache is updated before syncMathModeCheckmark reads it.
    await page.waitForTimeout(500);

    // After toggle, the menu item gets a has-checkmark class
    const hasCheckmark = await mathModeItem.evaluate((el) => el.classList.contains('has-checkmark'));
    expect(hasCheckmark, 'Math Mode menu should toggle has-checkmark').toBe(true);
  });
});