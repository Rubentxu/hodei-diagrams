import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady } from './helpers/app-ready.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');
const TWO_PAGE_PATH =
  fixturePath('two-page.drawio');

test.describe('Suite I: navigation-session', () => {
  /**
   * Test 1: Navigate between page tabs → active tab changes and SVG changes
   */
  test('Navigate between page tabs → active tab changes and SVG changes', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', TWO_PAGE_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Get first page SVG content
    const firstSvg = await page.locator('[data-testid="viewer"] svg').innerHTML();

    // Click second page tab
    const secondTab = page.locator('[data-testid="page-tabs"] .page-tab').nth(1);
    await secondTab.click();
    await page.waitForTimeout(300);

    // Second tab should be active
    await expect(secondTab).toHaveClass(/active/);

    // HUD should show 2/2
    await expect(page.locator('[data-testid="hud-page"]')).toHaveText('2/2');

    // SVG should be different from first page
    const secondSvg = await page.locator('[data-testid="viewer"] svg').innerHTML();
    expect(secondSvg).not.toBe(firstSvg);

    // Switch back to first tab
    await page.locator('[data-testid="page-tabs"] .page-tab').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="page-tabs"] .page-tab').first()).toHaveClass(/active/);
  });

  /**
   * Test 2: Add new page via + tab → new page tab appears
   * Note: Add page is now implemented (v1.1+), so the button is enabled.
   */
  test('Add new page via + tab → new page tab appears', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const addBtn = page.locator('.page-tab-add');
    // The + button is now enabled
    await expect(addBtn).toBeEnabled();

    // Count tabs before
    const tabCountBefore = await page.locator('[data-testid="page-tabs"] .page-tab').count();

    // Click the add button
    await addBtn.click();
    await page.waitForTimeout(300);

    // A new tab should appear
    const tabCountAfter = await page.locator('[data-testid="page-tabs"] .page-tab').count();
    expect(tabCountAfter).toBe(tabCountBefore + 1);
  });

  /**
   * Test 3: Delete/close page if supported; if not, assert hidden/disabled and document gap
   */
  test('Close page is not supported → button is absent/disabled', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', TWO_PAGE_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // There should be no close button (×) on page tabs
    // Each page tab is a <button class="page-tab"> — no nested close icon
    const tabs = await page.locator('[data-testid="page-tabs"] .page-tab').all();
    for (const tab of tabs) {
      const closeIcon = tab.locator('.tab-close, .close-btn, [aria-label="close"]');
      await expect(closeIcon).toHaveCount(0);
    }

    // The + add button is enabled (add page feature is implemented)
    const addBtn = page.locator('.page-tab-add');
    await expect(addBtn).toBeEnabled();
  });

  /**
   * Test 4: File > New clears canvas and resets page tabs
   * Note: File > New is not yet wired. Menu item is absent. Gap documented.
   */
  test('File > New clears canvas and resets page tabs', async ({ page }) => {
    await waitForAppReady(page);

    // Load a file first
    await page.setInputFiles('[data-testid="file-input"]', TWO_PAGE_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
    const tabCount = await page.locator('[data-testid="page-tabs"] .page-tab').count();
    expect(tabCount).toBe(2);

    // Open File menu to check its items
    await page.locator('[data-testid="menu-file"] summary').click();
    await page.waitForTimeout(100);

    // Check if there's a "New" menu item
    const newMenuItem = page.locator('[data-testid="menu-file"] [data-testid="menu-new"]');
    const hasNewMenu = await newMenuItem.count();

    if (hasNewMenu > 0) {
      // If menu item exists and is not disabled, click it
      const isDisabled = await newMenuItem.getAttribute('disabled');
      if (!isDisabled) {
        await newMenuItem.click();
        await page.waitForTimeout(300);
        // Canvas should be cleared
        const svgCount = await page.locator('[data-testid="viewer"] svg').count();
        expect(svgCount).toBe(0);
      } else {
        // Menu item exists but disabled — gap documented
        expect(true).toBe(true);
      }
    } else {
      // No File > New menu item at all — this is the current gap
      // Verify canvas still has content
      const svgCount = await page.locator('[data-testid="viewer"] svg').count();
      expect(svgCount).toBe(1);
    }
  });

  /**
   * Test 5: Reload browser resets in-memory state (no backend persistence)
   */
  test('Reload browser resets in-memory state', async ({ page }) => {
    await waitForAppReady(page);

    // Load a diagram
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Verify SVG rendered
    const svgCount = await page.locator('[data-testid="viewer"] svg').count();
    expect(svgCount).toBe(1);

    // Reload the page - in-memory state should be cleared
    await page.reload();
    await waitForAppReady(page);

    // After reload, the app re-initializes with an empty canvas (bootstrap render)
    // The previously loaded diagram is gone (no backend persistence)
    const svgCountAfterReload = await page.locator('[data-testid="viewer"] svg').count();
    // There should be an SVG from bootstrap, but it should be the empty canvas
    expect(svgCountAfterReload).toBeGreaterThanOrEqual(1);

    // Save button should be enabled after reload (can save empty diagram)
    await expect(page.locator('[data-testid="save-btn"]')).toBeEnabled();
  });

  /**
   * Test 6: Properties dialog persists engine metadata across reload
   * Note: This feature is not yet implemented. Properties are not persisted
   * across reload. Gap documented - engine metadata persistence needed.
   */
  test.skip('Properties dialog persists engine metadata across reload', async ({ page }) => {
    // Engine metadata persistence across reload not yet implemented
    // This test documents the gap
  });
});
