import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

test.describe('G5 smoke test: getScene() in browser', () => {
  test('getScene() returns valid scene JSON with page and display_list', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Import a diagram first
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Call getScene via window.__debug (exposed by main.ts for E2E)
    const sceneResult = await page.evaluate(() => {
      const debug = (window as unknown as Record<string, unknown>).__hodeiDebug as
        | { getScene: () => unknown }
        | undefined;
      if (!debug?.getScene) return { error: 'debug.getScene not available' };
      return debug.getScene();
    });

    // Validate scene shape
    expect(sceneResult).not.toHaveProperty('error');
    const scene = sceneResult as Record<string, unknown>;
    expect(Array.isArray(scene)).toBe(true);
    expect(scene.length).toBeGreaterThan(0);
    const page0 = scene[0] as Record<string, unknown>;
    expect(page0).toHaveProperty('page_id');
    expect(page0).toHaveProperty('display_list');
    expect(Array.isArray(page0.display_list)).toBe(true);

    // Verify the SVG was rendered
    const svgCount = await page.locator('[data-testid="viewer"] svg').count();
    expect(svgCount).toBe(1);
  });
});
