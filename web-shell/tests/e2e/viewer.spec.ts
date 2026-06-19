import { test, expect } from '@playwright/test';

// Use absolute paths - the Playwright config's webServer serves from web-shell/
const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';
const INVALID_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/invalid.drawio';

test.describe('viewer-only web shell', () => {
  test('viewer page mounts with Open button and viewer container', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="open-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="viewer"]')).toBeVisible();
  });

  test('importing simple-rect.drawio renders an <svg>', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Use the file input directly (it's in the navbar menu)
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const svgCount = await page.locator('[data-testid="viewer"] svg').count();
    expect(svgCount).toBe(1);
  });

  test('editor edit buttons from old toolbar are not present (tools are in sidebar/inspector)', async ({ page }) => {
    await page.goto('/');

    // These were toolbar buttons from the v1 viewer that no longer exist
    // Note: "Properties" menu item exists in File menu, but no toolbar button with that text
    await expect(page.locator('.quick-controls button:has-text("Properties")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Add")')).toHaveCount(0);
  });

  test('importing invalid XML shows an error banner without rendering SVG', async ({ page }) => {
    await page.goto('/');

    await page.setInputFiles('[data-testid="file-input"]', INVALID_PATH);
    await page.waitForSelector('[data-testid="error-banner"]:not([hidden])', { timeout: 3000 });
    const svgCount = await page.locator('[data-testid="viewer"] svg').count();
    expect(svgCount).toBe(0);
  });

  test('error banner can be dismissed', async ({ page }) => {
    await page.goto('/');

    await page.setInputFiles('[data-testid="file-input"]', INVALID_PATH);
    await page.waitForSelector('[data-testid="error-banner"]:not([hidden])', { timeout: 3000 });
    await page.click('[data-testid="dismiss-error"]');
    await expect(page.locator('[data-testid="error-banner"][hidden]')).toBeAttached();
  });

  test('canvas area fills remaining space in the 5-zone layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 768 });
    await page.goto('/');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // At 1280px with sidebar (240px) + inspector (280px), canvas = 760px
    const viewer = page.locator('[data-testid="viewer"]');
    const box = await viewer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(700); // approx 760
  });
});
