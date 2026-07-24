import { test, expect } from '@playwright/test';

/**
 * E2E tests for FrameBudgetMonitor and ?perf=1 activation.
 * Tests: REQ-AFBUDGET-001, REQ-AFBUDGET-002, REQ-AFBUDGET-003, REQ-AFBUDGET-004
 */

test.describe('Suite: perf-budget', () => {
  /**
   * Test 1: Monitor disabled by default — HUD does not show FPS
   * REQ-AFBUDGET-001 disabled scenario
   */
  test('monitor disabled by default — HUD does not show FPS', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="hud"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="viewer"]')).toBeVisible({ timeout: 5000 });

    // Navigate without ?perf=1
    const hudFps = page.locator('[data-testid="hud-fps"]');
    await expect(hudFps).toBeHidden();
  });

  /**
   * Test 2: ?perf=1 activates HUD FPS display
   * REQ-AFBUDGET-003 activation scenario
   */
  test('?perf=1 activates HUD FPS display', async ({ page }) => {
    // Navigate with ?perf=1
    await page.goto('/?perf=1');
    await expect(page.locator('[data-testid="hud"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="viewer"]')).toBeVisible({ timeout: 5000 });

    const hudFps = page.locator('[data-testid="hud-fps"]');

    // Wait for FPS display to have content (RAF loop needs at least one frame)
    await page.waitForTimeout(500);

    // Check the FPS element has non-empty text content
    const fpsText = await hudFps.textContent();
    expect(fpsText).not.toBe('');
    expect(fpsText).toMatch(/fps/);
  });

  /**
   * Test 3: __hodeiDebug.getFrameStats returns numeric values when enabled
   * REQ-AFBUDGET-004 debug access scenario
   */
  test('__hodeiDebug.getFrameStats returns numeric values when enabled', async ({ page }) => {
    // Navigate with ?perf=1
    await page.goto('/?perf=1');
    await expect(page.locator('[data-testid="hud"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="viewer"]')).toBeVisible({ timeout: 5000 });

    // Wait for at least one frame to be measured
    await page.waitForTimeout(500);

    // Call getFrameStats via __hodeiDebug
    const stats = await page.evaluate(() => {
      return (window as unknown as { __hodeiDebug: { getFrameStats: () => { fps: number; frameMs: number } } }).__hodeiDebug.getFrameStats();
    });

    // Stats should be numeric (fps >= 0, frameMs >= 0)
    expect(typeof stats.fps).toBe('number');
    expect(typeof stats.frameMs).toBe('number');
    expect(stats.fps).toBeGreaterThanOrEqual(0);
    expect(stats.frameMs).toBeGreaterThanOrEqual(0);
  });

  /**
   * Test 4: __hodeiDebug.getFrameStats works WITHOUT HUD visible (hidden-HUD debug)
   * REQ-AFBUDGET-004: debug access without HUD visibility
   */
  test('__hodeiDebug.getFrameStats works without HUD visible', async ({ page }) => {
    // Navigate with ?perf=1
    await page.goto('/?perf=1');
    await expect(page.locator('[data-testid="hud"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="viewer"]')).toBeVisible({ timeout: 5000 });

    // Hide the HUD by hiding the FPS element (simulating debug-only mode)
    // The HUD element stays visible but the fps item is hidden via CSS or direct style
    const hudFps = page.locator('[data-testid="hud-fps"]');
    await page.evaluate(() => {
      const fpsEl = document.querySelector('[data-testid="hud-fps"]') as HTMLElement | null;
      if (fpsEl) fpsEl.style.display = 'none';
    });

    // Wait for at least one frame to be measured
    await page.waitForTimeout(500);

    // Verify HUD FPS element is actually hidden
    await expect(hudFps).toBeHidden();

    // But getFrameStats should still return valid numeric values
    const stats = await page.evaluate(() => {
      return (window as unknown as { __hodeiDebug: { getFrameStats: () => { fps: number; frameMs: number } } }).__hodeiDebug.getFrameStats();
    });

    // Stats should be numeric and valid
    expect(typeof stats.fps).toBe('number');
    expect(typeof stats.frameMs).toBe('number');
    expect(stats.fps).toBeGreaterThanOrEqual(0);
    expect(stats.frameMs).toBeGreaterThanOrEqual(0);
  });
});
