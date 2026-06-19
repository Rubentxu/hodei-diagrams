import { test, expect } from '@playwright/test';

// Use absolute paths - the Playwright config's webServer serves from web-shell/
const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';
const INVALID_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/invalid.drawio';

test.describe('viewer-only web shell', () => {
  test('viewer page mounts with file input and viewer container', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="file-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="viewer"]')).toBeVisible();
  });

  test('importing simple-rect.drawio renders an <svg>', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const svgCount = await page.locator('[data-testid="viewer"] svg').count();
    expect(svgCount).toBe(1);
  });

  test('viewer-only: no edit buttons present in the DOM', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('button:has-text("Add")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Delete")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Properties")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Style")')).toHaveCount(0);
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

  test('SVG container fills the viewport at 1024x768', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const box = await viewer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeCloseTo(1024, 0);
  });
});
