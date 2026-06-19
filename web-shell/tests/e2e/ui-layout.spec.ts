import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';

test.describe('5-zone UI layout', () => {
  test('all 5 zones are present on initial load', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

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
    await page.goto('/');
    await page.waitForLoadState('networkidle');

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
    await page.goto('/');
    await page.waitForLoadState('networkidle');

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
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Tab bar
    await expect(page.locator('[data-testid="inspector-tab-style"]')).toBeVisible();
    await expect(page.locator('[data-testid="inspector-tab-text"]')).toBeVisible();
    await expect(page.locator('[data-testid="inspector-tab-arrange"]')).toBeVisible();

    // Style tab active by default
    await expect(page.locator('[data-testid="inspector-pane-style"]')).toBeVisible();
  });

  test('style tab shows controls when shape is selected', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

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
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Page tabs should exist
    await expect(page.locator('[data-testid="page-tabs"]')).toBeVisible();
    const pageTabs = page.locator('[data-testid="page-tab-0"]');
    await expect(pageTabs).toBeVisible();
  });

  test('error banner in bottom bar works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Error banner should exist but be hidden
    const errorBanner = page.locator('[data-testid="error-banner"]');
    await expect(errorBanner).toBeAttached();

    // Import invalid to trigger error
    const INVALID_PATH =
      '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/invalid.drawio';
    await page.setInputFiles('[data-testid="file-input"]', INVALID_PATH);
    await page.waitForSelector('[data-testid="error-banner"]:not([hidden])', { timeout: 3000 });

    // Dismiss
    await page.click('[data-testid="dismiss-error"]');
    await expect(errorBanner).toBeHidden();
  });

  test('zoom display updates on wheel events', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Check initial zoom display
    const zoomDisplay = page.locator('[data-testid="zoom-display"]');
    await expect(zoomDisplay).toHaveText('100%');

    // Scroll wheel on canvas container
    const canvas = page.locator('[data-testid="canvas-container"]');
    await canvas.hover();
    await page.mouse.wheel(0, -10); // scroll up = zoom in
    await page.waitForTimeout(100);

    // Zoom should have changed
    const zoomText = await zoomDisplay.textContent();
    expect(zoomText).not.toBe('100%');
  });

  test('editor features work in new layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

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
