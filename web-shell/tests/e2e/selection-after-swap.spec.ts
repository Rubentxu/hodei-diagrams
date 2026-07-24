import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const EMPTY_DIAGRAM = fixturePath('empty-diagram.drawio');

test.describe('REQ-COAL-008 — selection persists across innerHTML swap', () => {
  test('selected vertex retains .selected class and 8 resize handles after mutation', async ({ page }) => {
    await waitForAppReady(page);
    await page.setInputFiles('[data-testid="file-input"]', EMPTY_DIAGRAM);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5_000 });

    // Seed: 1 vertex
    await page.evaluate(() => window.__hodeiDebug!.addRectAt(100, 100, 80, 40));

    // Select it
    const firstVertex = page.locator('[data-vertex-id]').first();
    await firstVertex.click();
    await expect(page.locator('[data-vertex-id].selected')).toHaveCount(1);
    await expect(page.locator('.resize-handle')).toHaveCount(8);

    // Trigger #flushRender() via a second mutation
    await page.evaluate(() => window.__hodeiDebug!.addRectAt(300, 100, 80, 40));

    // Auto-waiting assertions
    await expect(page.locator('[data-vertex-id].selected')).toHaveCount(1);
    await expect(page.locator('.resize-handle')).toHaveCount(8);
  });

  test('deselected vertex stays deselected after mutation', async ({ page }) => {
    await waitForAppReady(page);
    await page.setInputFiles('[data-testid="file-input"]', EMPTY_DIAGRAM);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5_000 });

    await page.evaluate(() => window.__hodeiDebug!.addRectAt(100, 100, 80, 40));
    // No click — vertex is not selected

    await page.evaluate(() => window.__hodeiDebug!.addRectAt(300, 100, 80, 40));

    await expect(page.locator('[data-vertex-id].selected')).toHaveCount(0);
    await expect(page.locator('.resize-handle')).toHaveCount(0);
  });
});
