import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SPREAD_FIXTURE = fixturePath('scattered-shapes.drawio');

test.describe('S1 trigger — pan-end reveals culled shapes', () => {
  test('after pan-end, shapes that were in viewport remain in DOM', async ({ page }) => {
    await waitForAppReady(page);
    await page.setInputFiles('[data-testid="file-input"]', SPREAD_FIXTURE);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const initialCount = await page.locator('[data-vertex-id]').count();
    expect(initialCount).toBeGreaterThan(0);

    const viewer = page.locator('[data-testid="viewer"]');
    const viewerBox = await viewer.boundingBox();

    // Pan via drag on empty area (left-click drag on bottom-right corner)
    const startX = viewerBox!.x + viewerBox!.width - 50;
    const startY = viewerBox!.y + viewerBox!.height - 50;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 100, startY - 100, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(500);

    const afterCount = await page.locator('[data-vertex-id]').count();
    // After pan, shapes that remain in viewport stay in DOM (S1 re-renders correctly)
    expect(afterCount).toBe(initialCount);
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
