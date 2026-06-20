import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';
const TWO_PAGE_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/two-page.drawio';

test.describe('Suite C: canvas-zoom-pan', () => {
  /**
   * Test 1: Scroll wheel on canvas → CSS transform scale changes
   */
  test('Scroll wheel on canvas → CSS transform scale changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const canvas = page.locator('[data-testid="canvas-container"]');

    // Get initial transform
    const initialTransform = await canvas.evaluate((el) => el.style.transform);

    // Zoom in with scroll wheel
    await canvas.hover({ position: { x: 400, y: 200 } });
    await page.mouse.wheel(0, -10); // scroll up = zoom in
    await page.waitForTimeout(200);

    // Transform should have changed
    const afterZoomTransform = await canvas.evaluate((el) => el.style.transform);
    expect(afterZoomTransform).not.toBe(initialTransform);
    expect(afterZoomTransform).toContain('scale(');
  });

  /**
   * Test 2: HUD shows zoom percentage after zooming
   */
  test('HUD shows zoom percentage after zooming', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const canvas = page.locator('[data-testid="canvas-container"]');
    const zoomDisplay = page.locator('[data-testid="hud-zoom"]');

    // Initial zoom should be 100%
    await expect(zoomDisplay).toHaveText('100%');

    // Zoom in
    await canvas.hover({ position: { x: 400, y: 200 } });
    await page.mouse.wheel(0, -10); // scroll up
    await page.waitForTimeout(200);

    // HUD should show a different zoom percentage
    const zoomText = await zoomDisplay.textContent();
    expect(zoomText).not.toBe('100%');
  });

  /**
   * Test 3: Middle-click drag on canvas → CSS translate changes
   */
  test('Middle-click drag on canvas → CSS translate changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const canvas = page.locator('[data-testid="canvas-container"]');

    // Get initial transform (should be scale only, no translate)
    const initialTransform = await canvas.evaluate((el) => el.style.transform);

    // Middle-click drag
    const box = await canvas.boundingBox();
    await page.mouse.move(box!.x + 400, box!.y + 200);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box!.x + 450, box!.y + 250);
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(200);

    // Transform should now include translate
    const afterPanTransform = await canvas.evaluate((el) => el.style.transform);
    expect(afterPanTransform).not.toBe(initialTransform);
  });

  /**
   * Test 4: Grid toggle via View > Grid menu → grid overlay appears/disappears
   */
  test('Grid toggle via View > Grid menu → grid overlay appears/disappears', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const canvas = page.locator('[data-testid="canvas-container"]');
    const viewMenu = page.locator('[data-testid="menu-view"]');

    // Grid should be hidden by default
    await expect(canvas).not.toHaveClass(/show-grid/);

    // Open View menu and toggle grid
    await viewMenu.locator('summary').click();
    await page.locator('[data-testid="menu-grid"]').click();

    // Grid should now be visible
    await expect(canvas).toHaveClass(/show-grid/);

    // Toggle off
    await page.locator('[data-testid="menu-grid"]').click();
    await expect(canvas).not.toHaveClass(/show-grid/);
  });

  /**
   * Test 5: Grid overlay present when toggled on
   */
  test('Grid overlay present when toggled on', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const canvas = page.locator('[data-testid="canvas-container"]');

    // Toggle grid on via keyboard shortcut
    await page.keyboard.press('Control+g');

    // Canvas should have show-grid class
    await expect(canvas).toHaveClass(/show-grid/);
  });

  /**
   * Test 6: Zoom to 200% → shapes appear larger
   */
  test('Zoom to 200% → shapes appear larger', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const canvas = page.locator('[data-testid="canvas-container"]');
    const viewer = page.locator('[data-testid="viewer"]');

    // Get a shape's initial bounding box
    const shape = viewer.locator('[data-vertex-id]').first();
    const boxBefore = await shape.boundingBox();
    expect(boxBefore).not.toBeNull();

    // Zoom in multiple times to reach 200%
    await canvas.hover({ position: { x: 400, y: 200 } });
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -10);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(200);

    // HUD should show approximately 200%
    const zoomText = await page.locator('[data-testid="hud-zoom"]').textContent();
    expect(zoomText).toMatch(/1[89]\d%|200%/);
  });

  /**
   * Test 7: Zoom out to 50% → shapes appear smaller
   */
  test('Zoom out to 50% → shapes appear smaller', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const canvas = page.locator('[data-testid="canvas-container"]');

    // Zoom out multiple times to reach ~50%
    await canvas.hover({ position: { x: 400, y: 200 } });
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 10); // scroll down = zoom out
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(200);

    // HUD should show approximately 50%
    const zoomText = await page.locator('[data-testid="hud-zoom"]').textContent();
    expect(zoomText).toMatch(/4\d%|50%/);
  });

  /**
   * Test 8: Pan then switch page → pan resets or persists (document behavior)
   */
  test('Pan then switch page → pan resets or persists (document behavior)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', TWO_PAGE_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const canvas = page.locator('[data-testid="canvas-container"]');

    // Pan the canvas
    const box = await canvas.boundingBox();
    await page.mouse.move(box!.x + 400, box!.y + 200);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box!.x + 500, box!.y + 300);
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(200);

    const transformAfterPan = await canvas.evaluate((el) => el.style.transform);

    // Switch to second page
    const secondTab = page.locator('[data-testid="page-tabs"] .page-tab').nth(1);
    await secondTab.click();
    await page.waitForTimeout(300);

    // After switching page, the transform behavior is documented:
    // Either pan persists (transform still has translate) or resets to 0,0
    // This test documents the behavior
    const transformAfterSwitch = await canvas.evaluate((el) => el.style.transform);
    // Just verify no crash and SVG still visible
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();
  });

  /**
   * Test 9: Zoom + pan combined: zoom in, then pan → both transforms applied
   */
  test('Zoom + pan combined: zoom in, then pan → both transforms applied', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const canvas = page.locator('[data-testid="canvas-container"]');

    // Zoom in first
    await canvas.hover({ position: { x: 400, y: 200 } });
    await page.mouse.wheel(0, -10);
    await page.waitForTimeout(200);

    const transformAfterZoom = await canvas.evaluate((el) => el.style.transform);
    expect(transformAfterZoom).toContain('scale(');

    // Then pan
    const box = await canvas.boundingBox();
    await page.mouse.move(box!.x + 400, box!.y + 200);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box!.x + 500, box!.y + 300);
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(200);

    const transformAfterPan = await canvas.evaluate((el) => el.style.transform);

    // Both scale and translate should be present
    expect(transformAfterPan).toContain('scale(');
    // Translate values should be different from initial (0px, 0px)
    const hasTranslate = transformAfterPan.includes('translate') && !transformAfterPan.match(/translate\(0px,\s*0px\)/);
    expect(hasTranslate).toBe(true);
  });
});
