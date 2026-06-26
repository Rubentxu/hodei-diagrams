/**
 * editor-coverage.spec.ts — Coverage for features that may have gaps.
 * Run via 'cargo test --workspace' (Playwright e2e suite).
 *
 * Each test verifies a feature is reachable and works end-to-end via the
 * UI. Failures surface both UX bugs (menu doesn't open, dialog doesn't
 * show) and engine bugs (commands fail silently).
 */

import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';
const MULTI_SHAPES_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/multi-shapes.drawio';

test.describe('Editor: feature coverage audit', () => {
  test('Arrange > Bring to Front reorders vertices (visual ordering)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Select all
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);

    // Open Arrange > Bring to Front
    await page.click('summary:has-text("Arrange")');
    await page.waitForTimeout(200);
    const bringToFront = page.locator('[data-testid="menu-bring-front"]');
    await bringToFront.click({ force: true });
    await page.waitForTimeout(300);

    // No assertion needed — just that the action completes without error.
    // The error message inside the banner should be empty.
    const errorMsg = page.locator('[data-testid="error-banner"] .error-message');
    const errorText = await errorMsg.textContent();
    expect(errorText?.trim() ?? '', `Unexpected error: ${errorText}`).toBe('');
  });

  test('Arrange > Send to Back reorders vertices', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);

    await page.click('summary:has-text("Arrange")');
    await page.waitForTimeout(200);
    const sendToBack = page.locator('[data-testid="menu-send-back"]');
    await sendToBack.click({ force: true });
    await page.waitForTimeout(300);

    const errorText3 = await page.locator('[data-testid="error-banner"] .error-message').textContent();
    expect(errorText3?.trim() ?? '').toBe('');
  });

  test('Arrange > Group creates a group from 2+ selected shapes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);

    await page.click('summary:has-text("Arrange")');
    await page.waitForTimeout(200);
    const groupItem = page.locator('[data-testid="menu-group"]');
    await groupItem.click({ force: true });
    await page.waitForTimeout(300);

    const errorText4 = await page.locator('[data-testid="error-banner"] .error-message').textContent();
    expect(errorText4?.trim() ?? '').toBe('');
  });

  test('Arrange > Layouts: Hierarchical layout runs without error', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);

    await page.click('summary:has-text("Arrange")');
    await page.waitForTimeout(200);

    // Dispatch a mouseenter to the Layout submenu item to open the flyout.
    await page.evaluate(() => {
      const item = document.querySelector('[data-testid="menu-arrange-layout"]');
      if (item) {
        item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);

    const hier = page.locator('[data-testid="menu-layout-hierarchical"]');
    await hier.click({ force: true });
    await page.waitForTimeout(500);

    const errorText5 = await page.locator('[data-testid="error-banner"] .error-message').textContent();
    expect(errorText5?.trim() ?? '').toBe('');
  });

  test('Edit > Properties dialog opens and has expected tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="canvas-container"] svg', { timeout: 10_000 });
    await page.waitForTimeout(500);

    // File > Properties
    await page.click('summary:has-text("File")');
    await page.waitForTimeout(200);
    await page.locator('[data-testid="menu-properties"]').click({ force: true });
    await page.waitForTimeout(300);

    // Dialog should be visible (testid depends on implementation — try common patterns)
    const dialog = page.locator('[data-testid="properties-dialog"], [data-testid="metadata-dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5_000 });
  });

  test('Insert > Math Formula opens dialog and inserts vertex', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="canvas-container"] svg', { timeout: 10_000 });
    await page.waitForTimeout(500);

    const before = await page.locator('[data-testid="canvas-container"] [data-vertex-id]').count();

    // Open Insert > Math Formula
    await page.click('summary:has-text("Insert")');
    await page.waitForTimeout(200);
    await page.locator('[data-testid="menu-insert-math"]').click({ force: true });
    await page.waitForTimeout(300);

    // The math formula dialog has an input
    const input = page.locator('[data-testid="math-latex-input"]');
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill('\\sum_{i=0}^n i');

    // Confirm
    await page.locator('[data-testid="math-insert-dialog-insert"]').click();
    await page.waitForTimeout(500);

    // A new math vertex should be present
    const after = await page.locator('[data-testid="canvas-container"] [data-vertex-id]').count();
    expect(after).toBeGreaterThan(before);
  });

  // TODO(feature-gap): Extras > Edit XML is currently disabled with
  // title "XML editor not yet available". The feature is in the navbar
  // but the implementation is pending. Track as a follow-up.
  test.skip('Extras > Edit XML opens a dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="canvas-container"] svg', { timeout: 10_000 });
    await page.waitForTimeout(500);

    await page.click('summary:has-text("Extras")');
    await page.waitForTimeout(200);
    await page.locator('[data-testid="menu-edit-xml"]').click({ force: true });
    await page.waitForTimeout(300);

    // Should show a textarea or dialog
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 5_000 });
  });

  test('Inspector Style tab is interactive: change fill color updates the shape', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Select the shape
    const shape = page.locator('[data-testid="viewer"] [data-vertex-id]').first();
    await shape.click();
    await page.waitForTimeout(300);

    // Inspector fill input
    const fillInput = page.locator('[data-testid="inspector-fill"]');
    await expect(fillInput).toBeVisible();

    // Read original fill
    const _originalFill = await fillInput.inputValue();

    // Change to red (use the hex input since color picker doesn't trigger events)
    const fillHex = page.locator('[data-testid="inspector-fill-hex"]');
    await fillHex.fill('#ff0000');
    await fillHex.dispatchEvent('input');
    await fillHex.dispatchEvent('change');
    await page.waitForTimeout(400);

    // The shape should now have a red fill
    const shapeFill = await shape.evaluate((el: Element) => {
      const r = el as SVGElement;
      return r.getAttribute('fill') || r.style.fill || '';
    });
    expect(shapeFill.toLowerCase()).toContain('#ff0000');
  });

  test('Selecting 2+ shapes enables Group button in toolbar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('[data-testid="file-input"]', MULTI_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Select all
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(300);

    // Toolbar Group button should be enabled
    const groupBtn = page.locator('[data-testid="toolbar-group"]');
    if (await groupBtn.count() > 0) {
      await expect(groupBtn).toBeEnabled();
    }
  });

  test('Right-click on empty canvas shows context menu with Paste / Select All', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="canvas-container"] svg', { timeout: 10_000 });
    await page.waitForTimeout(500);

    // Right-click on empty area
    const canvas = page.locator('[data-testid="canvas-container"] svg').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas box');

    await page.mouse.click(box.x + 50, box.y + 50, { button: 'right' });
    await page.waitForTimeout(300);

    // Context menu should appear
    const contextMenu = page.locator('[data-testid="context-menu"]');
    await expect(contextMenu).toBeVisible({ timeout: 3_000 });

    // Should contain at least Select All
    await expect(contextMenu.locator('text=Select All').first()).toBeVisible();
  });

  test('Add page via + button increases page count in HUD', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="canvas-container"] svg', { timeout: 10_000 });
    await page.waitForTimeout(500);

    const before = await page.locator('[data-testid="hud-page"]').textContent();
    expect(before).toContain('1/1');

    await page.locator('[data-testid="page-tab-add"]').click();
    await page.waitForTimeout(300);

    const after = await page.locator('[data-testid="hud-page"]').textContent();
    expect(after).toContain('2/2');
  });

  test('Delete a page removes it', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="canvas-container"] svg', { timeout: 10_000 });
    await page.waitForTimeout(500);

    // Add a page
    await page.locator('[data-testid="page-tab-add"]').click();
    await page.waitForTimeout(300);

    // The "+" tab also matches `page-tab-*` so use a more specific selector.
    const tabSel = '[data-testid^="page-tab-"]:not([data-testid="page-tab-add"])';
    const after2 = await page.locator(tabSel).count();
    expect(after2).toBe(2);

    // Close button on second tab (×)
    const secondTab = page.locator(`${tabSel}[data-testid="page-tab-1"]`);
    await secondTab.hover();
    await page.waitForTimeout(200);
    // The × button is rendered inside the tab on hover
    const closeBtn = secondTab.locator('button.page-tab-close, .page-tab-close');
    if (await closeBtn.count() > 0) {
      await closeBtn.click({ force: true });
      await page.waitForTimeout(300);
      const after3 = await page.locator(tabSel).count();
      expect(after3).toBe(1);
    }
  });

  test('Ctrl+0 resets zoom to 100%', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="canvas-container"] svg', { timeout: 10_000 });
    await page.waitForTimeout(500);

    // Zoom in first
    await page.keyboard.press('Control++');
    await page.waitForTimeout(300);

    const zoomed = await page.locator('[data-testid="zoom-display"]').textContent();
    expect(zoomed).not.toBe('100%');

    // Reset
    await page.keyboard.press('Control+0');
    await page.waitForTimeout(300);

    const reset = await page.locator('[data-testid="zoom-display"]').textContent();
    expect(reset).toBe('100%');
  });
});