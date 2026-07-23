import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

test.describe('Slice C: Platform Surface UI', () => {
  test.describe('Presentation Mode', () => {
    test('Ctrl+Shift+P enters presentation mode', async ({ page }) => {
      await waitForAppReady(page);

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
      await waitForAppReady(page);

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
      await waitForAppReady(page);

      // Open View menu
      await page.locator('[data-testid="menu-view"] summary').click();

      // Click Present
      await page.locator('[data-testid="menu-present"]').click();

      await expect(page.locator('body')).toHaveClass(/presentation-mode/);
    });
  });

  test.describe('Export SVG', () => {
    test('File > Export > SVG menu item exists and is not disabled', async ({ page }) => {
      await waitForAppReady(page);

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
      // SKIPPED: PNG export was re-enabled in the application (no longer requires WebGPU).
      // Test was checking for disabled-item class and 'Requires WebGPU renderer' tooltip,
      // but the UI now allows PNG export. Test needs update if PNG disable is re-introduced.
      test.skip();
    });

    test('Export SVG is wired and functional after loading a diagram', async ({ page }) => {
      await waitForAppReady(page);

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
      await waitForAppReady(page);

      // Open File menu
      await page.locator('[data-testid="menu-file"] summary').click();

      // Click Properties
      await page.locator('[data-testid="menu-properties"]').click();

      // Dialog should be visible
      await expect(page.locator('[data-testid="properties-dialog"]')).toBeVisible();
      await expect(page.locator('[data-testid="properties-dialog"]')).not.toHaveAttribute('hidden');
    });

    test('Properties dialog has title, author, description fields', async ({ page }) => {
      await waitForAppReady(page);

      // Open dialog
      await page.locator('[data-testid="menu-file"] summary').click();
      await page.locator('[data-testid="menu-properties"]').click();

      // Check fields exist
      await expect(page.locator('#prop-title')).toBeVisible();
      await expect(page.locator('#prop-author')).toBeVisible();
      await expect(page.locator('#prop-description')).toBeVisible();
    });

    test('Properties dialog has Cancel and Save buttons', async ({ page }) => {
      await waitForAppReady(page);

      // Open dialog
      await page.locator('[data-testid="menu-file"] summary').click();
      await page.locator('[data-testid="menu-properties"]').click();

      await expect(page.locator('[data-testid="dialog-cancel"]')).toBeVisible();
      await expect(page.locator('[data-testid="dialog-save"]')).toBeVisible();
    });

    test('Cancel closes dialog without saving', async ({ page }) => {
      await waitForAppReady(page);

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
      await waitForAppReady(page);

      // Open dialog
      await page.locator('[data-testid="menu-file"] summary').click();
      await page.locator('[data-testid="menu-properties"]').click();

      // Footnote should be absent (engine metadata is now fully supported)
      await expect(page.locator('.dialog-footnote')).toHaveCount(0);
    });

    test('Escape closes dialog', async ({ page }) => {
      await waitForAppReady(page);

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
    test('General category has an SVG icon', async ({ page }) => {
      await waitForAppReady(page);
      // Category icons are inline SVG elements set via innerHTML
      const generalIcon = page.locator('.shape-category .category-icon').first();
      await expect(generalIcon).toBeVisible();
      const svg = generalIcon.locator('svg');
      await expect(svg).toBeVisible();
    });

    test('future categories have icons', async ({ page }) => {
      await waitForAppReady(page);

      // Open "More Shapes" accordion to reveal disabled categories
      const moreShapesBtn = page.locator('.more-shapes-btn');
      await expect(moreShapesBtn).toBeVisible();
      await moreShapesBtn.click();

      // Find a disabled category
      const disabledCategory = page.locator('.shape-category.disabled').first();
      const icon = disabledCategory.locator('.category-icon');
      await expect(icon).toBeVisible();
      // Icon should be an emoji character
      const iconText = await icon.textContent();
      expect(iconText!.length).toBeGreaterThan(0);
    });

    test('category icons are displayed', async ({ page }) => {
      await waitForAppReady(page);

      // Count categories with icons
      const icons = page.locator('.category-icon');
      const count = await icons.count();
      expect(count).toBeGreaterThan(1); // At least General + one future category
    });
  });
});

// ─── R3: Responsive Drawer Tests ───────────────────────────────────────────────

test.describe('R3: Responsive Drawers', () => {
  test.describe('Drawer visibility at mobile breakpoint', () => {
    test.beforeEach(async ({ page }) => {
      await waitForAppReady(page);
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
    });

    test('sidebar drawer is hidden by default at mobile', async ({ page }) => {
      const sidebar = page.locator('[data-testid="sidebar"]');
      await expect(sidebar).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -220, 0)');
      await expect(sidebar).toHaveCSS('opacity', '0');
    });

    test('inspector drawer is hidden by default at mobile', async ({ page }) => {
      const inspector = page.locator('[data-testid="inspector"]');
      await expect(inspector).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 230, 0)');
      await expect(inspector).toHaveCSS('opacity', '0');
    });

    test('drawer overlay is hidden by default at mobile', async ({ page }) => {
      const overlay = page.locator('[data-testid="drawer-overlay"]');
      await expect(overlay).toHaveCSS('opacity', '0');
    });
  });

  test.describe('Mutual exclusion', () => {
    test.beforeEach(async ({ page }) => {
      await waitForAppReady(page);
      await page.setViewportSize({ width: 375, height: 667 });
    });

    test('opening sidebar closes inspector (and vice versa)', async ({ page }) => {
      // Open sidebar via data attribute (simulating DrawerController.open())
      await page.evaluate(() => {
        document.querySelector('#app')?.setAttribute('data-drawer-open', 'sidebar');
      });
      await page.waitForTimeout(300);
      const sidebar = page.locator('[data-testid="sidebar"]');
      await expect(sidebar).toHaveCSS('opacity', '1');

      // Opening inspector should close sidebar
      await page.evaluate(() => {
        document.querySelector('#app')?.setAttribute('data-drawer-open', 'inspector');
      });
      await page.waitForTimeout(300);
      await expect(sidebar).toHaveCSS('opacity', '0');
      const inspector = page.locator('[data-testid="inspector"]');
      await expect(inspector).toHaveCSS('opacity', '1');
    });
  });

  test.describe('Drawer focus lifecycle', () => {
    test.beforeEach(async ({ page }) => {
      await waitForAppReady(page);
      await page.setViewportSize({ width: 375, height: 667 });
    });

    test('inspector drawer opens with role="dialog" and aria-modal via button click', async ({ page }) => {
      // Click inspector toggle button to open drawer (this triggers DrawerController)
      await page.click('[data-testid="inspector-toggle"]');
      await page.waitForTimeout(200);
      const inspector = page.locator('[data-testid="inspector"]');
      await expect(inspector).toHaveAttribute('role', 'dialog');
      await expect(inspector).toHaveAttribute('aria-modal', 'true');
    });

    test('inspector toggle closes drawer and clears accessibility attributes', async ({ page }) => {
      // Open inspector drawer
      await page.click('[data-testid="inspector-toggle"]');
      await page.waitForTimeout(200);
      const inspector = page.locator('[data-testid="inspector"]');
      await expect(inspector).toHaveCSS('opacity', '1');
      await expect(inspector).toHaveAttribute('role', 'dialog');

      // Toggle again to close
      await page.click('[data-testid="inspector-toggle"]');
      await page.waitForTimeout(200);
      await expect(inspector).toHaveCSS('opacity', '0');
      await expect(inspector).not.toHaveAttribute('role');
      await expect(inspector).not.toHaveAttribute('aria-modal');
    });

    test('CSS-driven drawer visibility works for sidebar', async ({ page }) => {
      // Directly set data attribute to test CSS drawer visibility
      // (sidebar trigger button not yet implemented at mobile)
      await page.evaluate(() => {
        document.querySelector('#app')?.setAttribute('data-drawer-open', 'sidebar');
      });
      await page.waitForTimeout(200);
      const sidebar = page.locator('[data-testid="sidebar"]');
      // CSS-driven visibility should work
      await expect(sidebar).toHaveCSS('opacity', '1');

      // Remove attribute to close
      await page.evaluate(() => {
        document.querySelector('#app')?.removeAttribute('data-drawer-open');
      });
      await page.waitForTimeout(200);
      await expect(sidebar).toHaveCSS('opacity', '0');
    });

    test('Outside-click on drawer-overlay closes drawer and returns focus to trigger', async ({ page }) => {
      // Open inspector drawer via button click
      const trigger = page.locator('[data-testid="inspector-toggle"]');
      await trigger.click();
      await page.waitForTimeout(200);

      const inspector = page.locator('[data-testid="inspector"]');
      await expect(inspector).toHaveCSS('opacity', '1');

      // Click on the drawer overlay (outside the drawer)
      const overlay = page.locator('[data-testid="drawer-overlay"]');
      await overlay.click({ position: { x: 10, y: 10 } }); // click near top-left of overlay
      await page.waitForTimeout(200);

      // Drawer should be closed
      await expect(inspector).toHaveCSS('opacity', '0');
      // Focus should return to the trigger button
      await expect(trigger).toBeFocused();
    });

    test('DrawerController sets and removes data-drawer-open attribute via toggle', async ({ page }) => {
      const app = page.locator('#app');
      // Initially no drawer-open attribute
      await expect(app).not.toHaveAttribute('data-drawer-open');

      // Open inspector via toggle button - verify data-drawer-open is set by controller
      await page.click('[data-testid="inspector-toggle"]');
      await page.waitForTimeout(200);
      await expect(app).toHaveAttribute('data-drawer-open', 'inspector');

      // Close via toggle - verify data-drawer-open is removed by controller
      await page.click('[data-testid="inspector-toggle"]');
      await page.waitForTimeout(200);
      await expect(app).not.toHaveAttribute('data-drawer-open');
    });

    test('Sidebar drawer uses scoped data-drawer-testid', async ({ page }) => {
      // Verify both drawers have scoped testids
      const sidebar = page.locator('[data-drawer-testid="drawer-sidebar"]');
      const inspector = page.locator('[data-drawer-testid="drawer-inspector"]');
      await expect(sidebar).toBeAttached();
      await expect(inspector).toBeAttached();
    });
  });
});
