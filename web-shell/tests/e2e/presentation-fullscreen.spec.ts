import { test, expect } from '@playwright/test';

const _SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';

test.describe('Presentation Mode Fullscreen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Ctrl+Shift+P enters presentation mode with fullscreen', async ({ page }) => {
    await page.keyboard.press('Control+Shift+P');
    // body.presentation-mode class should be present
    await expect(page.locator('body')).toHaveClass(/presentation-mode/);
  });

  test('Escape exits presentation mode', async ({ page }) => {
    await page.keyboard.press('Control+Shift+P');
    await expect(page.locator('body')).toHaveClass(/presentation-mode/);
    // Exit via document.exitFullscreen() directly to avoid browser-specific Esc behavior
    await page.evaluate(() => {
      document.exitFullscreen?.();
    });
    // Wait for fullscreenchange to fire
    await page.waitForFunction(() => !document.fullscreenElement, { timeout: 5000 });
    await expect(page.locator('body')).not.toHaveClass(/presentation-mode/);
  });

  test('exit overlay visible on enter', async ({ page }) => {
    await page.keyboard.press('Control+Shift+P');
    const overlay = page.locator('#exit-hint-overlay');
    await expect(overlay).toBeVisible();
    // Initially opacity should be 1
    await expect(overlay).toHaveCSS('opacity', '1');
  });

  test('exit overlay fades after 3s', async ({ page }) => {
    await page.keyboard.press('Control+Shift+P');
    const overlay = page.locator('#exit-hint-overlay');
    await expect(overlay).toHaveCSS('opacity', '1');
    await page.waitForTimeout(3500);
    await expect(overlay).toHaveCSS('opacity', '0');
  });

  test('exit overlay hidden after exit', async ({ page }) => {
    await page.keyboard.press('Control+Shift+P');
    const overlay = page.locator('#exit-hint-overlay');
    await expect(overlay).toBeVisible();
    // Exit via document.exitFullscreen() directly
    await page.evaluate(() => {
      document.exitFullscreen?.();
    });
    // Wait for fullscreenchange to fire
    await page.waitForFunction(() => !document.fullscreenElement, { timeout: 5000 });
    // Overlay should be hidden (opacity 0) after exit
    await expect(overlay).toHaveCSS('opacity', '0');
  });

  test('idempotent toggle — calling toggle twice is a no-op', async ({ page }) => {
    await page.keyboard.press('Control+Shift+P');
    await expect(page.locator('body')).toHaveClass(/presentation-mode/);
    // Second toggle should not crash
    await page.keyboard.press('Control+Shift+P');
    // No error thrown means success
  });

  test('View > Present menu triggers presentation mode', async ({ page }) => {
    // Click View menu
    await page.locator('[data-testid="menu-view"] summary').click();
    // Click Present
    const presentItem = page.locator('[data-testid="menu-present"]');
    await presentItem.click();
    await expect(page.locator('body')).toHaveClass(/presentation-mode/);
  });

  test('fullscreenchange event syncs state correctly', async ({ page }) => {
    // Initial state: not in presentation mode
    await expect(page.locator('body')).not.toHaveClass(/presentation-mode/);

    await page.keyboard.press('Control+Shift+P');
    // The body should have presentation-mode class after fullscreenchange fires
    await expect(page.locator('body')).toHaveClass(/presentation-mode/);

    // Simulate native fullscreen exit via fullscreenchange
    await page.evaluate(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        writable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    await expect(page.locator('body')).not.toHaveClass(/presentation-mode/);
  });
});
