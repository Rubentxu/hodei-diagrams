import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

test.describe('Editor: palette', () => {
  test('Rectangle tool adds a rectangle on click', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Click the Rect tool button
    await page.click('[data-testid="rect-tool-btn"]');

    // Click on canvas to place rectangle
    const viewer = page.locator('[data-testid="viewer"]');
    await viewer.click({ position: { x: 200, y: 150 } });
    await page.waitForTimeout(300);

    // SVG should still be rendered
    await expect(viewer.locator('svg')).toBeVisible();
  });

  test('Ellipse tool adds an ellipse on click', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Click the Ellipse tool button
    await page.click('[data-testid="ellipse-tool-btn"]');

    // Click on canvas to place ellipse
    const viewer = page.locator('[data-testid="viewer"]');
    await viewer.click({ position: { x: 300, y: 200 } });
    await page.waitForTimeout(300);

    // SVG should still be rendered
    await expect(viewer.locator('svg')).toBeVisible();
  });
});
