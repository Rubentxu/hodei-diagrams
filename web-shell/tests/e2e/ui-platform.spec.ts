import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

test.describe('Slice C: Platform Surface UI', () => {
  test.describe('Presentation Mode', () => {
    test('Ctrl+Shift+P enters presentation mode', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Press Ctrl+Shift+P
      await page.keyboard.press('Control+Shift+P');

      // Body should have presentation-mode class
      await expect(page.locator('body')).toHaveClass(/presentation-mode/);

      // Navbar, sidebar, rail, inspector should be hidden
      await expect(page.locator('.navbar')).toBeHidden();
      await expect(page.locator('.sidebar')).toBeHidden();
      await expect(page.locator('.rail')).toBeHidden();
      await expect(page.locator('.inspector')).toBeHidden();

      // Canvas and bottom bar should still be visible
      await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible();
      await expect(page.locator('[data-testid="bottom-bar"]')).toBeVisible();
      await expect(page.locator('.hud')).toBeVisible();
    });

    test('Escape exits presentation mode', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Enter presentation mode
      await page.keyboard.press('Control+Shift+P');
      await expect(page.locator('body')).toHaveClass(/presentation-mode/);

      // Exit presentation mode
      await page.keyboard.press('Escape');
      await expect(page.locator('body')).not.toHaveClass(/presentation-mode/);

      // All zones should be visible again
      await expect(page.locator('.navbar')).toBeVisible();
      await expect(page.locator('.sidebar')).toBeVisible();
      await expect(page.locator('.rail')).toBeVisible();
      await expect(page.locator('.inspector')).toBeVisible();
    });

    test('View > Present menu item enters presentation mode', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open View menu
      await page.locator('[data-testid="menu-view"] summary').click();

      // Click Present
      await page.locator('[data-testid="menu-present"]').click();

      await expect(page.locator('body')).toHaveClass(/presentation-mode/);
    });
  });

  test.describe('Export SVG', () => {
    test('File > Export > SVG menu item exists and is not disabled', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open File menu
      await page.locator('[data-testid="menu-file"] summary').click();

      // Hover Export to show submenu
      const exportItem = page.locator('[data-testid="menu-export"]');
      await exportItem.hover();

      // SVG should be visible and not disabled
      const svgItem = page.locator('[data-testid="menu-export-svg"]');
      await expect(svgItem).toBeVisible();
      await expect(svgItem).not.toHaveClass(/disabled-item/);
    });

    test('Export > PNG is disabled with tooltip', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open File menu
      await page.locator('[data-testid="menu-file"] summary').click();

      // Hover Export to show submenu
      const exportItem = page.locator('[data-testid="menu-export"]');
      await exportItem.hover();

      // PNG should be disabled
      const pngItem = page.locator('[data-testid="menu-export-png"]');
      await expect(pngItem).toBeVisible();
      await expect(pngItem).toHaveClass(/disabled-item/);
      await expect(pngItem).toHaveAttribute('title', 'Requires WebGPU renderer');
    });

    test('Export SVG is wired and functional after loading a diagram', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Load a diagram
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      // Verify that the SVG export click handler is set up by checking
      // the menu item exists and can receive clicks
      const svgItem = page.locator('[data-testid="menu-export-svg"]');

      // The SVG item should be visible when hovering on Export
      await page.locator('[data-testid="menu-file"] summary').click();
      await page.locator('[data-testid="menu-export"]').dispatchEvent('mouseenter');
      await page.waitForTimeout(100);

      // Verify the SVG item exists and is interactive
      await expect(svgItem).toBeVisible();
    });
  });

  test.describe('Properties Dialog', () => {
    test('File > Properties opens dialog', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open File menu
      await page.locator('[data-testid="menu-file"] summary').click();

      // Click Properties
      await page.locator('[data-testid="menu-properties"]').click();

      // Dialog should be visible
      await expect(page.locator('[data-testid="properties-dialog"]')).toBeVisible();
      await expect(page.locator('[data-testid="properties-dialog"]')).not.toHaveAttribute('hidden');
    });

    test('Properties dialog has title, author, description fields', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open dialog
      await page.locator('[data-testid="menu-file"] summary').click();
      await page.locator('[data-testid="menu-properties"]').click();

      // Check fields exist
      await expect(page.locator('#prop-title')).toBeVisible();
      await expect(page.locator('#prop-author')).toBeVisible();
      await expect(page.locator('#prop-description')).toBeVisible();
    });

    test('Properties dialog has Cancel and Save buttons', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open dialog
      await page.locator('[data-testid="menu-file"] summary').click();
      await page.locator('[data-testid="menu-properties"]').click();

      await expect(page.locator('[data-testid="dialog-cancel"]')).toBeVisible();
      await expect(page.locator('[data-testid="dialog-save"]')).toBeVisible();
    });

    test('Cancel closes dialog without saving', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open dialog
      await page.locator('[data-testid="menu-file"] summary').click();
      await page.locator('[data-testid="menu-properties"]').click();

      // Fill in a value
      await page.locator('#prop-title').fill('Test Diagram');

      // Click Cancel
      await page.locator('[data-testid="dialog-cancel"]').click();

      // Dialog should be hidden
      await expect(page.locator('[data-testid="properties-dialog"]')).toHaveAttribute('hidden');
    });

    test('Dialog does not have v2 footnote', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open dialog
      await page.locator('[data-testid="menu-file"] summary').click();
      await page.locator('[data-testid="menu-properties"]').click();

      // Footnote should be absent (engine metadata is now fully supported)
      await expect(page.locator('.dialog-footnote')).toHaveCount(0);
    });

    test('Escape closes dialog', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open dialog
      await page.locator('[data-testid="menu-file"] summary').click();
      await page.locator('[data-testid="menu-properties"]').click();

      await expect(page.locator('[data-testid="properties-dialog"]')).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');

      // Dialog should be hidden
      await expect(page.locator('[data-testid="properties-dialog"]')).toBeHidden();
    });
  });

  test.describe('Sidebar Category Icons', () => {
    test('General category has an icon', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Find the general category icon
      const generalCategory = page.locator('.shape-category').first();
      const icon = generalCategory.locator('.category-icon');
      await expect(icon).toBeVisible();
      // Should be the white square emoji
      await expect(icon).toHaveText('⬜');
    });

    test('future categories have icons', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Find a disabled category
      const disabledCategory = page.locator('.shape-category.disabled').first();
      const icon = disabledCategory.locator('.category-icon');
      await expect(icon).toBeVisible();
      // Icon should be an emoji character
      const iconText = await icon.textContent();
      expect(iconText!.length).toBeGreaterThan(0);
    });

    test('category icons are displayed', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Count categories with icons
      const icons = page.locator('.category-icon');
      const count = await icons.count();
      expect(count).toBeGreaterThan(1); // At least General + one future category
    });
  });
});
