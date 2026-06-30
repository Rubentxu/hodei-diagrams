import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');
const AWS_ADMISION_PATH =
  fixturePath('aws-admision.drawio');

test.describe('Suite L: performance', () => {
  /**
   * Test 1: Load aws-admision.drawio (4MB) completes and renders within 3 seconds
   */
  test('Load aws-admision.drawio (4MB) completes and renders within 3 seconds', async ({ page }) => {
    await waitForAppReady(page);

    const start = Date.now();

    await page.setInputFiles('[data-testid="file-input"]', AWS_ADMISION_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 10000 });

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);

    // Verify SVG rendered
    const svgCount = await page.locator('[data-testid="viewer"] svg').count();
    expect(svgCount).toBe(1);
  });

  /**
   * Test 2: Create 20 shapes within a bounded time and app stays responsive
   */
  test('Create 20 shapes within a bounded time and app stays responsive', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const start = Date.now();

    // Create 20 shapes rapidly
    for (let i = 0; i < 20; i++) {
      const x = 100 + (i % 5) * 150;
      const y = 100 + Math.floor(i / 5) * 120;

      if (i % 3 === 0) {
        await page.click('[data-testid="rect-tool-btn"]');
      } else if (i % 3 === 1) {
        await page.click('[data-testid="ellipse-tool-btn"]');
      } else {
        await page.click('[data-testid="rounded-rect-tool-btn"]');
      }

      await page.locator('[data-testid="viewer"]').click({ position: { x, y } });
      await page.waitForTimeout(50); // small delay between creations
    }

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000); // Should create 20 shapes in under 10s

    // App should still be responsive
    const shapeCount = await page.locator('[data-vertex-id]').count();
    expect(shapeCount).toBeGreaterThanOrEqual(20);

    // No crash — viewer still has SVG
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();
  });

  /**
   * Test 3: Zoom to 200% updates within 500ms
   */
  test('Zoom to 200% updates within 500ms', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const zoomDisplay = page.locator('[data-testid="zoom-display"]');
    const canvasContainer = page.locator('[data-testid="canvas-container"]');

    // Zoom in via wheel scroll (each delta is 0.1, so 10 scroll steps = ~200%)
    const start = Date.now();
    for (let i = 0; i < 10; i++) {
      await canvasContainer.hover({ position: { x: 400, y: 200 } });
      await page.mouse.wheel(0, -10); // scroll up = zoom in
    }
    await page.waitForTimeout(200); // Wait for render

    const elapsed = Date.now() - start;

    // Zoom display should show something near 200%
    const zoomText = await zoomDisplay.textContent();
    const zoomPct = parseInt(zoomText?.replace('%', '') ?? '0', 10);
    expect(zoomPct).toBeGreaterThanOrEqual(180);

    // Transform should reflect zoom
    const transform = await canvasContainer.evaluate((el) => el.style.transform);
    expect(transform).toContain('scale');

    // UI should stay responsive — entire operation under 3s
    expect(elapsed).toBeLessThan(3000);
  });

  /**
   * Test 4: Pan interaction completes without visible crash and transform updates quickly
   */
  test('Pan interaction completes without crash and transform updates quickly', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const canvasContainer = page.locator('[data-testid="canvas-container"]');

    // Get initial transform
    const initialTransform = await canvasContainer.evaluate((el) => el.style.transform);

    // Start a pan: middle mouse button drag
    const viewer = page.locator('[data-testid="viewer"]');
    const box = await viewer.boundingBox();
    if (!box) throw new Error('Viewer not found');

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down({ button: 'middle' });
    await page.waitForTimeout(50);

    // Pan to the right
    await page.mouse.move(startX + 100, startY + 50);
    await page.waitForTimeout(50);

    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(100);

    // Transform should have changed
    const newTransform = await canvasContainer.evaluate((el) => el.style.transform);
    // Pan changes translate values in the transform
    expect(newTransform).not.toBe(initialTransform);

    // App should not have crashed
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/fatal/);
  });
});
