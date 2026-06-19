import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';

test.describe('Editor: click-to-select', () => {
  test('click on a shape selects it', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Click on the rect element (at center of 80x40 rect at 10,20)
    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();

    // Check that .selected class was applied
    await expect(rect).toHaveClass(/selected/);
  });

  test('click on empty area deselects', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // First select a shape
    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();
    await expect(rect).toHaveClass(/selected/);

    // Click empty area
    await viewer.click({ position: { x: 5, y: 5 } });

    // Check selection was cleared
    await expect(rect).not.toHaveClass(/selected/);
  });
});
