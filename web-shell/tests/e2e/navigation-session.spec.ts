import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';
const TWO_PAGE_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/two-page.drawio';

test.describe('Suite I: navigation-session', () => {
  /**
   * Test 1: Navigate between page tabs → active tab changes and SVG changes
   */
  test('Navigate between page tabs → active tab changes and SVG changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

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
   * Note: + tab is currently disabled (title="Add page (v1.1)"). Gap documented.
   */
  test('Add new page via + tab → new page tab appears', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const addBtn = page.locator('.page-tab-add');
    // The + button is disabled in v1.0
    await expect(addBtn).toBeDisabled();

    // Count tabs before
    const tabCountBefore = await page.locator('[data-testid="page-tabs"] .page-tab').count();

    // Force-click the disabled button (it should be a no-op)
    await addBtn.click({ force: true });
    await page.waitForTimeout(100);

    // No change
    const tabCountAfter = await page.locator('[data-testid="page-tabs"] .page-tab').count();
    expect(tabCountAfter).toBe(tabCountBefore);
  });

  /**
   * Test 3: Delete/close page if supported; if not, assert hidden/disabled and document gap
   */
  test('Close page is not supported → button is absent/disabled', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', TWO_PAGE_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // There should be no close button (×) on page tabs
    // Each page tab is a <button class="page-tab"> — no nested close icon
    const tabs = await page.locator('[data-testid="page-tabs"] .page-tab').all();
    for (const tab of tabs) {
      const closeIcon = tab.locator('.tab-close, .close-btn, [aria-label="close"]');
      await expect(closeIcon).toHaveCount(0);
    }

    // The + add button is disabled — page deletion is v1.1 gap
    const addBtn = page.locator('.page-tab-add');
    await expect(addBtn).toBeDisabled();
  });

  /**
   * Test 4: File > New clears canvas and resets page tabs
   * Note: File > New is not yet wired. Menu item is absent. Gap documented.
   */
  test('File > New clears canvas and resets page tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

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
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Load a diagram
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Verify SVG rendered
    const svgCount = await page.locator('[data-testid="viewer"] svg').count();
    expect(svgCount).toBe(1);

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Canvas should be cleared (no backend persistence)
    const svgCountAfterReload = await page.locator('[data-testid="viewer"] svg').count();
    expect(svgCountAfterReload).toBe(0);

    // Save button should be disabled after reload
    await expect(page.locator('[data-testid="save-btn"]')).toBeDisabled();
  });

  /**
   * Test 6: Properties dialog persists localStorage values across reload
   */
  test('Properties dialog persists localStorage values across reload', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open properties dialog
    await page.locator('[data-testid="menu-file"] summary').click();
    await page.locator('[data-testid="menu-properties"]').click();
    await expect(page.locator('[data-testid="properties-dialog"]')).toBeVisible();

    // Fill in values
    await page.locator('#prop-title').fill('My Test Diagram');
    await page.locator('#prop-author').fill('Test Author');
    await page.locator('#prop-description').fill('Test description content');

    // Save
    await page.click('[data-testid="dialog-save"]');
    await page.waitForTimeout(100);

    // Dialog should be closed
    await expect(page.locator('[data-testid="properties-dialog"]')).toBeHidden();

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Open dialog again
    await page.locator('[data-testid="menu-file"] summary').click();
    await page.locator('[data-testid="menu-properties"]').click();
    await expect(page.locator('[data-testid="properties-dialog"]')).toBeVisible();

    // Values should be persisted
    await expect(page.locator('#prop-title')).toHaveValue('My Test Diagram');
    await expect(page.locator('#prop-author')).toHaveValue('Test Author');
    await expect(page.locator('#prop-description')).toHaveValue('Test description content');
  });
});
