import { test, expect } from '@playwright/test';
import { fixturePath, testFixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');
const CUSTOM_STENCIL_PATH =
  testFixturePath('custom-stencil.xml');

/** Scope all category queries to the dynamic container to avoid strict-mode collisions with static sidebar elements. */
function dynamicLocator(page: import('@playwright/test').Page, suffix: string) {
  return page.locator('[data-testid="dynamic-stencil-categories"]').locator(`[data-testid="${suffix}"]`);
}

test.describe('Stencil Library File Picker', () => {
  /**
   * Test 1: Auto-loaded categories (General, Flowchart) appear in the dynamic
   * stencil container (the static sidebar also renders them, so we scope to the
   * dynamic container to avoid Playwright strict-mode violations on duplicate
   * data-testid values).
   */
  test('Auto-load General and Flowchart categories in sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for stencil libraries to auto-load (they are fetched asynchronously)
    await page.waitForTimeout(1500);

    // General category should be present (auto-loaded at startup) — scoped to dynamic container
    const generalCategory = dynamicLocator(page, 'category-count-general');
    await expect(generalCategory).toBeVisible();
    const generalCount = await generalCategory.textContent();
    expect(Number(generalCount)).toBeGreaterThan(0);

    // Flowchart category should also be present (auto-loaded at startup) — scoped to dynamic container
    const flowchartCategory = dynamicLocator(page, 'category-count-flowchart');
    await expect(flowchartCategory).toBeVisible();
    const flowchartCount = await flowchartCategory.textContent();
    expect(Number(flowchartCount)).toBeGreaterThan(0);
  });

  /**
   * Test 2: Load custom-stencil.xml via file picker (library name "custom-stencil")
   */
  test('Load custom-stencil.xml via file picker → new Custom-stencil category appears', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for initial stencil libraries to load
    await page.waitForTimeout(1500);

    // Custom-stencil category should NOT be present before loading — scoped to dynamic container
    const customStencilCategoryBefore = dynamicLocator(page, 'category-count-custom-stencil');
    await expect(customStencilCategoryBefore).not.toBeVisible();

    // Click "+ More Shapes" to open file picker
    await page.click('[data-testid="sidebar"] .more-shapes-btn');

    // Load custom-stencil.xml via the hidden file input
    await page.setInputFiles('[data-testid="stencil-file-input"]', CUSTOM_STENCIL_PATH);

    // Wait for library to be parsed and rendered
    await page.waitForTimeout(1000);

    // Custom-stencil category should now be visible — scoped to dynamic container
    const customStencilCategoryAfter = dynamicLocator(page, 'category-count-custom-stencil');
    await expect(customStencilCategoryAfter).toBeVisible();
    const customStencilCount = await customStencilCategoryAfter.textContent();
    expect(Number(customStencilCount)).toBe(8); // custom-stencil.xml has 8 shapes
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
    await page.waitForTimeout(1500);

    // Load custom.xml
    await page.click('[data-testid="sidebar"] .more-shapes-btn');
    await page.setInputFiles('[data-testid="stencil-file-input"]', CUSTOM_STENCIL_PATH);

    // Wait for the Custom-stencil category and Star button to appear in the dynamic container
    const starBtn = dynamicLocator(page, 'shape-custom-stencil-Star');
    await starBtn.waitFor({ state: 'visible', timeout: 5000 });

    // Count shapes before clicking
    const initialCount = await page.locator('[data-vertex-id]').count();

    // Click the "Star" shape button in the Custom category
    await starBtn.click();

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
    await page.waitForTimeout(1500);

    // Load custom.xml first time
    await page.click('[data-testid="sidebar"] .more-shapes-btn');
    await page.setInputFiles('[data-testid="stencil-file-input"]', CUSTOM_STENCIL_PATH);
    await page.waitForTimeout(1000);

    const countAfterFirstLoad = await dynamicLocator(page, 'category-count-custom-stencil').textContent();

    // Wait for category to be visible before reloading
    await expect(dynamicLocator(page, 'category-count-custom-stencil')).toHaveCount(1);

    // Load same library again (no need to click more-shapes-btn — input stays open)
    await page.setInputFiles('[data-testid="stencil-file-input"]', CUSTOM_STENCIL_PATH);
    await page.waitForTimeout(1000);

    const countAfterSecondLoad = await dynamicLocator(page, 'category-count-custom-stencil').textContent();

    // Count should be the same (replaced, not duplicated)
    expect(Number(countAfterSecondLoad)).toBe(Number(countAfterFirstLoad));

    // There should still be only one Custom-stencil count element (proves no duplicate category)
    const customCount = dynamicLocator(page, 'category-count-custom-stencil');
    await expect(customCount).toHaveCount(1);
  });
});
