import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SPREAD_FIXTURE = fixturePath('scattered-shapes.drawio');

test.describe('S1 trigger — pan-end reveals culled shapes', () => {
  test('after pan-end, shapes that entered viewport are now in the DOM', async ({ page }) => {
    await waitForAppReady(page);
    await page.setInputFiles('[data-testid="file-input"]', SPREAD_FIXTURE);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Initial: shape at (20,20) is visible; shape at (2000,2000) is culled
    const initialCount = await page.locator('[data-vertex-id]').count();
    expect(initialCount).toBeGreaterThan(0);

    // Verify initial shape is the one at (20,20) — id "1:1"
    const initialVertexId = await page.locator('[data-vertex-id]').first().getAttribute('data-vertex-id');
    expect(initialVertexId).toBe('1:1');

    // The culled shape is at document coordinates (2000, 2000) with id "2:1".
    // After pan to (1500, 1500), viewport x-range is [1500, 2294], y-range is [1500, 2148].
    // Shape at (2000, 2000) should be visible; shape at (20, 20) is culled.
    await page.evaluate(() => {
      const editor = (window as any).__hodeiDebug?.getEditor?.();
      if (editor?.getViewport) {
        const vp = editor.getViewport();
        vp.setPan(1500, 1500);
        editor.schedulePanEndReplay?.();
      }
    });

    // Wait for S1 debounce (150ms) + render
    await page.waitForTimeout(400);

    // After pan: the culled shape at (2000, 2000) should now be in DOM
    // (The previously visible shape at 20,20 is now culled, so count stays the same)
    const afterCount = await page.locator('[data-vertex-id]').count();
    expect(afterCount).toBeGreaterThanOrEqual(initialCount);

    // Verify the shape that was culled is now visible (id "2:1")
    const afterVertexId = await page.locator('[data-vertex-id]').first().getAttribute('data-vertex-id');
    expect(afterVertexId).toBe('2:1');
  });

  test('no replay if no pan occurs (sanity check)', async ({ page }) => {
    await waitForAppReady(page);
    await page.setInputFiles('[data-testid="file-input"]', SPREAD_FIXTURE);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const initialCount = await page.locator('[data-vertex-id]').count();
    await page.waitForTimeout(500);
    const afterCount = await page.locator('[data-vertex-id]').count();
    expect(afterCount).toBe(initialCount);
  });
});
