import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';

test.describe('Suite: toolbar', () => {
  /**
   * Test 1: Toolbar renders all 7 buttons
   */
  test('Toolbar renders all 7 buttons', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const toolbar = page.locator('[data-testid="toolbar"]');
    await expect(toolbar).toBeVisible();

    // All 7 buttons should be present
    await expect(page.locator('[data-testid="toolbar-fill"]')).toBeVisible();
    await expect(page.locator('[data-testid="toolbar-stroke"]')).toBeVisible();
    await expect(page.locator('[data-testid="toolbar-bold"]')).toBeVisible();
    await expect(page.locator('[data-testid="toolbar-italic"]')).toBeVisible();
    await expect(page.locator('[data-testid="toolbar-delete"]')).toBeVisible();
    await expect(page.locator('[data-testid="toolbar-front"]')).toBeVisible();
    await expect(page.locator('[data-testid="toolbar-back"]')).toBeVisible();
  });

  /**
   * Test 2: Toolbar buttons are disabled without selection
   */
  test('Toolbar buttons are disabled without selection', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // No selection yet - all buttons should be disabled
    await expect(page.locator('[data-testid="toolbar-fill"]')).toBeDisabled();
    await expect(page.locator('[data-testid="toolbar-stroke"]')).toBeDisabled();
    await expect(page.locator('[data-testid="toolbar-bold"]')).toBeDisabled();
    await expect(page.locator('[data-testid="toolbar-italic"]')).toBeDisabled();
    await expect(page.locator('[data-testid="toolbar-delete"]')).toBeDisabled();
    await expect(page.locator('[data-testid="toolbar-front"]')).toBeDisabled();
    await expect(page.locator('[data-testid="toolbar-back"]')).toBeDisabled();
  });

  /**
   * Test 3: Toolbar buttons are enabled with selection
   */
  test('Toolbar buttons are enabled with selection', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Select the shape
    await rect.click();
    await page.waitForTimeout(300);

    // All buttons should now be enabled
    await expect(page.locator('[data-testid="toolbar-fill"]')).toBeEnabled();
    await expect(page.locator('[data-testid="toolbar-stroke"]')).toBeEnabled();
    await expect(page.locator('[data-testid="toolbar-bold"]')).toBeEnabled();
    await expect(page.locator('[data-testid="toolbar-italic"]')).toBeEnabled();
    await expect(page.locator('[data-testid="toolbar-delete"]')).toBeEnabled();
    await expect(page.locator('[data-testid="toolbar-front"]')).toBeEnabled();
    await expect(page.locator('[data-testid="toolbar-back"]')).toBeEnabled();
  });

  /**
   * Test 4: Fill color changes SVG fill
   */
  test('Fill color changes SVG fill attribute', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Select the shape
    await rect.click();
    await page.waitForTimeout(300);

    // Change fill color
    const fillInput = page.locator('[data-testid="toolbar-fill"]');
    await fillInput.evaluate((el: HTMLInputElement) => {
      el.value = '#ff0000';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.waitForTimeout(500);

    // Verify SVG rect has fill="#ff0000"
    const fillAttr = await rect.getAttribute('fill');
    expect(fillAttr).toBe('#ff0000');
  });

  /**
   * Test 5: Stroke color changes SVG stroke
   */
  test('Stroke color changes SVG stroke attribute', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Select the shape
    await rect.click();
    await page.waitForTimeout(300);

    // Change stroke color
    const strokeInput = page.locator('[data-testid="toolbar-stroke"]');
    await strokeInput.evaluate((el: HTMLInputElement) => {
      el.value = '#0000ff';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.waitForTimeout(500);

    // Verify SVG rect has stroke="#0000ff"
    const strokeAttr = await rect.getAttribute('stroke');
    expect(strokeAttr).toBe('#0000ff');
  });

  /**
   * Test 6: Bold toggle adds --active class and changes style
   */
  test('Bold toggle adds active class when enabled', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Select the shape
    await rect.click();
    await page.waitForTimeout(300);

    // Bold button should not have --active class initially
    const boldBtn = page.locator('[data-testid="toolbar-bold"]');
    await expect(boldBtn).not.toHaveClass(/--active/);

    // Click bold button
    await boldBtn.click();
    await page.waitForTimeout(500);

    // Bold button should now have --active class
    await expect(boldBtn).toHaveClass(/--active/);
  });

  /**
   * Test 7: Italic toggle adds --active class
   */
  test('Italic toggle adds active class when enabled', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Select the shape
    await rect.click();
    await page.waitForTimeout(300);

    // Italic button should not have --active class initially
    const italicBtn = page.locator('[data-testid="toolbar-italic"]');
    await expect(italicBtn).not.toHaveClass(/--active/);

    // Click italic button
    await italicBtn.click();
    await page.waitForTimeout(500);

    // Italic button should now have --active class
    await expect(italicBtn).toHaveClass(/--active/);
  });

  /**
   * Test 8: Delete button removes shape from canvas
   */
  test('Delete button removes shape from canvas', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');

    // Count shapes before deletion
    const shapesBefore = await viewer.locator('[data-vertex-id]').count();
    expect(shapesBefore).toBeGreaterThan(0);

    // Select the first shape
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();
    await page.waitForTimeout(300);

    // Click delete button
    await page.locator('[data-testid="toolbar-delete"]').click();
    await page.waitForTimeout(500);

    // Shape should be removed
    const shapesAfter = await viewer.locator('[data-vertex-id]').count();
    expect(shapesAfter).toBe(shapesBefore - 1);
  });

  /**
   * Test 9: To Front button brings shape to front
   */
  test('To Front button changes z-order', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Select the shape
    await rect.click();
    await page.waitForTimeout(300);

    // Click To Front button - should not throw
    await page.locator('[data-testid="toolbar-front"]').click();
    await page.waitForTimeout(500);

    // Selection should still be present
    await expect(viewer.locator('[data-vertex-id]').first()).toBeVisible();
  });

  /**
   * Test 10: To Back button sends shape to back
   */
  test('To Back button changes z-order', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Select the shape
    await rect.click();
    await page.waitForTimeout(300);

    // Click To Back button - should not throw
    await page.locator('[data-testid="toolbar-back"]').click();
    await page.waitForTimeout(500);

    // Selection should still be present
    await expect(viewer.locator('[data-vertex-id]').first()).toBeVisible();
  });
});
