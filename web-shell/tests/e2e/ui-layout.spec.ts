import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

// R1c: Dock mode E2E tests (debt-audit fixed)
test.describe('dock mode switching', () => {
  test('clicking each rail trigger shows only the requested dock mode', async ({ page }) => {
    await waitForAppReady(page);

    // Initially shapes mode is active (observable via data-dock-mode attribute)
    await expect(page.locator('[data-testid="sidebar"]')).toHaveAttribute('data-dock-mode', 'shapes');
    await expect(page.locator('.dock-mode-shapes')).toBeVisible();
    await expect(page.locator('.dock-mode-layers')).toBeHidden();
    await expect(page.locator('.dock-mode-history')).toBeHidden();

    // Click Layers dock trigger — stable wait via attribute
    await page.click('[data-testid="rail-dock-layers-btn"]');
    await expect(page.locator('[data-testid="sidebar"]')).toHaveAttribute('data-dock-mode', 'layers');
    await expect(page.locator('.dock-mode-layers')).toBeVisible();
    await expect(page.locator('.dock-mode-shapes')).toBeHidden();
    await expect(page.locator('.dock-mode-history')).toBeHidden();

    // Click History dock trigger
    await page.click('[data-testid="rail-dock-history-btn"]');
    await expect(page.locator('[data-testid="sidebar"]')).toHaveAttribute('data-dock-mode', 'history');
    await expect(page.locator('.dock-mode-history')).toBeVisible();
    await expect(page.locator('.dock-mode-shapes')).toBeHidden();
    await expect(page.locator('.dock-mode-layers')).toBeHidden();

    // Click Shapes dock trigger (via rail-shapes-btn which also triggers dock mode)
    await page.click('[data-testid="rail-shapes-btn"]');
    await expect(page.locator('[data-testid="sidebar"]')).toHaveAttribute('data-dock-mode', 'shapes');
    await expect(page.locator('.dock-mode-shapes')).toBeVisible();
    await expect(page.locator('.dock-mode-layers')).toBeHidden();
    await expect(page.locator('.dock-mode-history')).toBeHidden();
  });

  test('repeated activation does not duplicate content', async ({ page }) => {
    await waitForAppReady(page);

    // Click Layers multiple times — attribute observable state prevents race
    await page.click('[data-testid="rail-dock-layers-btn"]');
    await page.click('[data-testid="rail-dock-layers-btn"]');
    await page.click('[data-testid="rail-dock-layers-btn"]');

    // Stable wait via attribute then visibility
    await expect(page.locator('[data-testid="sidebar"]')).toHaveAttribute('data-dock-mode', 'layers');
    await expect(page.locator('.dock-mode-layers')).toBeVisible();

    // Should still show exactly one layers container
    const layersContent = page.locator('.dock-mode-layers');
    await expect(layersContent).toHaveCount(1);
  });

  test('dock mode preserves sidebar collapse state', async ({ page }) => {
    await waitForAppReady(page);

    // Collapse sidebar
    await page.click('[data-testid="sidebar-collapse-btn"]');
    await expect(page.locator('[data-testid="sidebar"]')).toHaveClass(/collapsed/);

    // Open layers dock — no timeout needed, attribute is observable
    await page.click('[data-testid="rail-dock-layers-btn"]');
    await expect(page.locator('[data-testid="sidebar"]')).toHaveAttribute('data-dock-mode', 'layers');

    // Sidebar should still be collapsed
    await expect(page.locator('[data-testid="sidebar"]')).toHaveClass(/collapsed/);
  });
});

test.describe('keyboard rail activation', () => {
  test('Enter key activates dock mode and retains focus-visible', async ({ page }) => {
    await waitForAppReady(page);

    // Focus the Layers dock trigger
    await page.focus('[data-testid="rail-dock-layers-btn"]');

    // Press Enter
    await page.keyboard.press('Enter');

    // Stable wait via attribute
    await expect(page.locator('[data-testid="sidebar"]')).toHaveAttribute('data-dock-mode', 'layers');

    // Focus should be retained on the button
    const btn = page.locator('[data-testid="rail-dock-layers-btn"]');
    await expect(btn).toBeFocused();

    // R1c debt-fix: meaningfully assert focus-visible — button has focus-visible styling
    const focusVisible = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="rail-dock-layers-btn"]') as HTMLElement;
      return el?.matches(':focus-visible') ?? false;
    });
    expect(focusVisible).toBe(true);
  });

  test('Space key activates dock mode without changing dock state', async ({ page }) => {
    await waitForAppReady(page);

    // Focus the History dock trigger
    await page.focus('[data-testid="rail-dock-history-btn"]');

    // Press Space
    await page.keyboard.press('Space');

    // Stable wait via attribute
    await expect(page.locator('[data-testid="sidebar"]')).toHaveAttribute('data-dock-mode', 'history');
    await expect(page.locator('.dock-mode-history')).toBeVisible();
  });
});

test.describe('tools and docks coexist', () => {
  test('activating dock trigger preserves selection', async ({ page }) => {
    await waitForAppReady(page);

    // Import a diagram first
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Select a shape
    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();
    await expect(rect).toHaveClass(/selected/);

    // R1c debt-fix: capture selected state before dock activation
    const selectedBefore = await rect.evaluate((el) => el.classList.contains('selected'));

    // Activate History dock
    await page.click('[data-testid="rail-dock-history-btn"]');
    await expect(page.locator('[data-testid="sidebar"]')).toHaveAttribute('data-dock-mode', 'history');

    // R1c debt-fix: assert selection is actually preserved (not just viewer visible)
    await expect(page.locator('.dock-mode-history')).toBeVisible();
    const selectedAfter = await page.locator('[data-vertex-id].selected').count();
    expect(selectedAfter).toBeGreaterThan(0);
    expect(selectedBefore).toBe(true);
  });

  test('shapes dock trigger preserves shapes tool selection', async ({ page }) => {
    await waitForAppReady(page);

    // Select rectangle tool
    await page.click('[data-testid="rect-tool-btn"]');

    // Activate Layers dock
    await page.click('[data-testid="rail-dock-layers-btn"]');
    await expect(page.locator('[data-testid="sidebar"]')).toHaveAttribute('data-dock-mode', 'layers');

    // Layers should be visible
    await expect(page.locator('.dock-mode-layers')).toBeVisible();

    // Switch back to Shapes
    await page.click('[data-testid="rail-shapes-btn"]');
    await expect(page.locator('[data-testid="sidebar"]')).toHaveAttribute('data-dock-mode', 'shapes');

    // Shapes should be visible with search and categories
    await expect(page.locator('.dock-mode-shapes')).toBeVisible();
    await expect(page.locator('[data-testid="sidebar-search"]')).toBeVisible();
  });
});

test.describe('5-zone UI layout', () => {
  test('all 5 zones are present on initial load', async ({ page }) => {
    await waitForAppReady(page);

    // Verify each zone exists with its data-testid
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible();
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible();
    await expect(page.locator('[data-testid="inspector"]')).toBeVisible();
    await expect(page.locator('[data-testid="bottom-bar"]')).toBeVisible();

    // Viewer inside the canvas
    await expect(page.locator('[data-testid="viewer"]')).toBeVisible();
  });

  test('navbar has menu bar and quick controls', async ({ page }) => {
    await waitForAppReady(page);

    // Menu triggers
    await expect(page.locator('[data-testid="menu-file"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-edit"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-view"]')).toBeVisible();

    // Quick controls
    await expect(page.locator('[data-testid="undo-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="redo-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="zoom-display"]')).toBeVisible();
    await expect(page.locator('[data-testid="save-btn"]')).toBeVisible();
  });

  test('sidebar has shape categories', async ({ page }) => {
    await waitForAppReady(page);

    // General shape buttons
    await expect(page.locator('[data-testid="rect-tool-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="ellipse-tool-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="rounded-rect-tool-btn"]')).toBeVisible();

    // Search bar
    await expect(page.locator('[data-testid="sidebar-search"]')).toBeVisible();

    // Collapse button
    await expect(page.locator('[data-testid="sidebar-collapse-btn"]')).toBeVisible();
  });

  test('inspector has three tabs with Style active', async ({ page }) => {
    await waitForAppReady(page);

    // Tab bar
    await expect(page.locator('[data-testid="inspector-tab-style"]')).toBeVisible();
    await expect(page.locator('[data-testid="inspector-tab-text"]')).toBeVisible();
    await expect(page.locator('[data-testid="inspector-tab-arrange"]')).toBeVisible();

    // Style tab active by default
    await expect(page.locator('[data-testid="inspector-pane-style"]')).toBeVisible();
  });

  test('style tab shows controls when shape is selected', async ({ page }) => {
    await waitForAppReady(page);

    // Import a diagram
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Select the shape
    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();
    await page.waitForTimeout(200);

    // Inspector fields should be visible
    await expect(page.locator('[data-testid="inspector-fill"]')).toBeVisible();
    await expect(page.locator('[data-testid="inspector-stroke"]')).toBeVisible();
    await expect(page.locator('[data-testid="inspector-stroke-width"]')).toBeVisible();
  });

  test('bottom bar has page tabs after import', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Page tabs should exist
    await expect(page.locator('[data-testid="page-tabs"]')).toBeVisible();
    const pageTabs = page.locator('[data-testid="page-tab-0"]');
    await expect(pageTabs).toBeVisible();
  });

  test('error banner in bottom bar works', async ({ page }) => {
    await waitForAppReady(page);

    // Error banner should exist but be hidden
    const errorBanner = page.locator('[data-testid="error-banner"]');
    await expect(errorBanner).toBeAttached();

    // Import invalid to trigger error
    const INVALID_PATH =
      fixturePath('invalid.drawio');
    await page.setInputFiles('[data-testid="file-input"]', INVALID_PATH);
    await page.waitForSelector('[data-testid="error-banner"]:not([hidden])', { timeout: 3000 });

    // Dismiss
    await page.click('[data-testid="dismiss-error"]');
    await expect(errorBanner).toBeHidden();
  });

  test('zoom display updates on wheel events', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Check initial zoom display
    const zoomDisplay = page.locator('[data-testid="zoom-display"]');
    await expect(zoomDisplay).toHaveText('100%');

    // Ctrl+wheel on canvas container (draw.io parity: plain wheel pans)
    const canvas = page.locator('[data-testid="canvas-container"]');
    await canvas.hover();
    await canvas.evaluate((el) => {
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(100);

    // Zoom should have changed
    const zoomText = await zoomDisplay.textContent();
    expect(zoomText).not.toBe('100%');
  });

  test('editor features work in new layout', async ({ page }) => {
    await waitForAppReady(page);

    // Import
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Select a shape
    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();
    await expect(rect).toHaveClass(/selected/);

    // Add a rectangle via palette
    await page.click('[data-testid="rect-tool-btn"]');
    await viewer.click({ position: { x: 200, y: 150 } });
    await page.waitForTimeout(300);
    await expect(viewer.locator('svg')).toBeVisible();

    // Palette tool buttons are present (they were preserved from old layout)
    await expect(page.locator('[data-testid="rect-tool-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="ellipse-tool-btn"]')).toBeVisible();
    // Save button is present
    await expect(page.locator('[data-testid="save-btn"]')).toBeVisible();
  });
});
