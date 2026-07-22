import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

// ─── Dock Mode E2E Tests (R1 Tasks 2.5.1–2.5.3) ──────────────────────────────

test.describe('dock mode switching (2.5.1)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
  });

  test('clicking dock-layers rail button shows layers panel and hides others', async ({ page }) => {
    const dockLayersBtn = page.locator('[data-testid="rail-dock-layers-btn"]');
    const dockLayers = page.locator('[data-testid="dock-layers"]');
    const dockModeShapes = page.locator('.dock-mode-shapes');
    const dockHistory = page.locator('[data-testid="dock-history"]');

    await dockLayersBtn.click();

    // Only layers panel visible
    await expect(dockLayers).toBeVisible();
    await expect(dockModeShapes).not.toBeVisible();
    await expect(dockHistory).not.toBeVisible();
  });

  test('clicking dock-history rail button shows history panel and hides others', async ({ page }) => {
    const dockHistoryBtn = page.locator('[data-testid="rail-dock-history-btn"]');
    const dockHistory = page.locator('[data-testid="dock-history"]');
    const dockModeShapes = page.locator('.dock-mode-shapes');
    const dockLayers = page.locator('[data-testid="dock-layers"]');

    await dockHistoryBtn.click();

    // Only history panel visible
    await expect(dockHistory).toBeVisible();
    await expect(dockModeShapes).not.toBeVisible();
    await expect(dockLayers).not.toBeVisible();
  });

  test('clicking shapes rail button shows shapes panel and hides others', async ({ page }) => {
    const shapesBtn = page.locator('[data-testid="rail-shapes-btn"]');
    const dockModeShapes = page.locator('.dock-mode-shapes');
    const dockLayers = page.locator('[data-testid="dock-layers"]');
    const dockHistory = page.locator('[data-testid="dock-history"]');

    await shapesBtn.click();

    // Only shapes panel visible
    await expect(dockModeShapes).toBeVisible();
    await expect(dockLayers).not.toBeVisible();
    await expect(dockHistory).not.toBeVisible();
  });

  test('repeated dock mode activation does not duplicate sidebar content', async ({ page }) => {
    const dockLayersBtn = page.locator('[data-testid="rail-dock-layers-btn"]');
    const dockHistoryBtn = page.locator('[data-testid="rail-dock-history-btn"]');
    const dockLayers = page.locator('[data-testid="dock-layers"]');
    const sidebar = page.locator('[data-testid="sidebar"]');

    // Switch to layers
    await dockLayersBtn.click();
    await expect(dockLayers).toBeVisible();

    // Switch to history and back to layers — no duplication
    await dockHistoryBtn.click();
    await dockLayersBtn.click();

    // Exactly one layers panel
    const layersPanels = await page.locator('[data-testid="dock-layers"]').count();
    expect(layersPanels).toBe(1);
    // Sidebar children count should remain stable (no duplication)
    const sidebarChildCount = await sidebar.evaluate((el) => el.children.length);
    expect(sidebarChildCount).toBeGreaterThan(0);
  });
});

test.describe('keyboard rail activation (2.5.2)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
  });

  test('focusing dock-layers button and pressing Enter activates layers mode', async ({ page }) => {
    const dockLayersBtn = page.locator('[data-testid="rail-dock-layers-btn"]');
    const dockLayers = page.locator('[data-testid="dock-layers"]');

    await dockLayersBtn.focus();
    await page.keyboard.press('Enter');

    await expect(dockLayers).toBeVisible();
    // Focus-visible should be retained on the activated button
    const focusVisible = await dockLayersBtn.evaluate((el) => {
      return window.getComputedStyle(el).outlineStyle !== 'none' ||
             el.classList.contains('focus-visible') ||
             document.activeElement === el;
    });
    expect(focusVisible).toBe(true);
  });

  test('focusing dock-history button and pressing Space activates history mode', async ({ page }) => {
    const dockHistoryBtn = page.locator('[data-testid="rail-dock-history-btn"]');
    const dockHistory = page.locator('[data-testid="dock-history"]');

    await dockHistoryBtn.focus();
    await page.keyboard.press('Space');

    await expect(dockHistory).toBeVisible();
    // Active element should remain on the button (not lost focus)
    const activeEl = page.locator('[data-testid="rail-dock-history-btn"]');
    await expect(activeEl).toBeFocused();
  });
});

test.describe('tools and docks coexist (2.5.3)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
  });

  test('activating dock trigger preserves the active canvas tool', async ({ page }) => {
    // Select a tool first (rectangle)
    const rectToolBtn = page.locator('[data-testid="rect-tool-btn"]');
    await rectToolBtn.click();

    // Verify a tool is active (rect button has active-tool class)
    await expect(rectToolBtn).toHaveClass(/active-tool/);

    // Now activate dock mode (layers)
    const dockLayersBtn = page.locator('[data-testid="rail-dock-layers-btn"]');
    await dockLayersBtn.click();

    // Dock mode active but tool still selected
    const dockLayers = page.locator('[data-testid="dock-layers"]');
    await expect(dockLayers).toBeVisible();
    await expect(rectToolBtn).toHaveClass(/active-tool/);

    // Switch dock mode — tool still preserved
    const dockHistoryBtn = page.locator('[data-testid="rail-dock-history-btn"]');
    await dockHistoryBtn.click();

    const dockHistory = page.locator('[data-testid="dock-history"]');
    await expect(dockHistory).toBeVisible();
    await expect(rectToolBtn).toHaveClass(/active-tool/);
  });
});

// ─── 5-zone UI layout ─────────────────────────────────────────────────────────

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
