import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';
const CUSTOM_STENCIL_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/tests/fixtures/custom-stencil.xml';

test.describe('Stencil Library File Picker', () => {
  /**
   * Test 1: Auto-loaded categories (General, Flowchart) appear in sidebar
   */
  test('Auto-load General and Flowchart categories in sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for stencil libraries to auto-load
    await page.waitForTimeout(1000);

    // General category should be present (auto-loaded at startup)
    const generalCategory = page.locator('[data-testid="category-count-general"]');
    await expect(generalCategory).toBeVisible();
    const generalCount = await generalCategory.textContent();
    expect(Number(generalCount)).toBeGreaterThan(0);

    // Flowchart category should also be present (auto-loaded at startup)
    const flowchartCategory = page.locator('[data-testid="category-count-flowchart"]');
    await expect(flowchartCategory).toBeVisible();
    const flowchartCount = await flowchartCategory.textContent();
    expect(Number(flowchartCount)).toBeGreaterThan(0);
  });

  /**
   * Test 2: Load custom stencil XML via file picker
   */
  test('Load custom-stencil.xml via file picker → new Custom category appears', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for initial stencil libraries to load
    await page.waitForTimeout(1000);

    // Custom category should NOT be present before loading
    const customCategoryBefore = page.locator('[data-testid="category-count-custom"]');
    await expect(customCategoryBefore).not.toBeVisible();

    // Click "+ More Shapes" to open file picker
    await page.click('[data-testid="sidebar"] .more-shapes-btn');

    // Load custom-stencil.xml via the hidden file input
    await page.setInputFiles('[data-testid="stencil-file-input"]', CUSTOM_STENCIL_PATH);

    // Wait for library to be parsed and rendered
    await page.waitForTimeout(500);

    // Custom category should now be visible
    const customCategoryAfter = page.locator('[data-testid="category-count-custom"]');
    await expect(customCategoryAfter).toBeVisible();
    const customCount = await customCategoryAfter.textContent();
    expect(Number(customCount)).toBe(8); // custom-stencil.xml has 8 shapes
  });

  /**
   * Test 3: Click a custom stencil shape button → vertex added to canvas
   */
  test('Click custom stencil shape button → shape added to canvas', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Load a diagram first so we have an active page
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Wait for stencil libraries to load
    await page.waitForTimeout(1000);

    // Load custom-stencil.xml
    await page.click('[data-testid="sidebar"] .more-shapes-btn');
    await page.setInputFiles('[data-testid="stencil-file-input"]', CUSTOM_STENCIL_PATH);
    await page.waitForTimeout(500);

    // Count shapes before clicking
    const initialCount = await page.locator('[data-vertex-id]').count();

    // Click the "Star" shape button in the Custom category
    await page.click('[data-testid="shape-custom-Star"]');

    // Wait for the vertex to be added
    await page.waitForTimeout(300);

    // A new shape should appear
    const newCount = await page.locator('[data-vertex-id]').count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  /**
   * Test 4: Re-load same library replaces existing category (no duplicate)
   */
  test('Reload same library → category replaced, not duplicated', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Load custom-stencil.xml first time
    await page.click('[data-testid="sidebar"] .more-shapes-btn');
    await page.setInputFiles('[data-testid="stencil-file-input"]', CUSTOM_STENCIL_PATH);
    await page.waitForTimeout(500);

    const countAfterFirstLoad = await page.locator('[data-testid="category-count-custom"]').textContent();

    // Load same library again
    await page.click('[data-testid="sidebar"] .more-shapes-btn');
    await page.setInputFiles('[data-testid="stencil-file-input"]', CUSTOM_STENCIL_PATH);
    await page.waitForTimeout(500);

    const countAfterSecondLoad = await page.locator('[data-testid="category-count-custom"]').textContent();

    // Count should be the same (replaced, not duplicated)
    expect(Number(countAfterSecondLoad)).toBe(Number(countAfterFirstLoad));

    // There should still be only one Custom category header
    const customHeaders = page.locator('.category-header').filter({ hasText: 'Custom' });
    await expect(customHeaders).toHaveCount(1);
  });
});
