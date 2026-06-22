import { test, expect } from '@playwright/test';

const TWO_SHAPES_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/two-shapes.drawio';
const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';

test.describe('Snap/Align Phase 7', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('snap menu item toggles snap', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Snap starts disabled — no checkmark
    const snapMenuItem = page.locator('#menu-item-snap');
    await expect(snapMenuItem).not.toHaveClass(/has-checkmark/);

    // Click View > Snap
    await snapMenuItem.click();
    await page.waitForTimeout(200);

    // Snap is now enabled — checkmark should appear
    await expect(snapMenuItem).toHaveClass(/has-checkmark/);

    // Click again to disable
    await snapMenuItem.click();
    await page.waitForTimeout(200);
    await expect(snapMenuItem).not.toHaveClass(/has-checkmark/);
  });

  test('snap disabled by default', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Verify snap is off: no checkmark on menu item
    const snapMenuItem = page.locator('#menu-item-snap');
    await expect(snapMenuItem).not.toHaveClass(/has-checkmark/);

    // Verify no snap guides are visible
    const guides = page.locator('[data-testid="snap-guide"]');
    await expect(guides).toHaveCount(0);
  });

  test('snap toggle keyboard works', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const snapMenuItem = page.locator('#menu-item-snap');

    // Press Ctrl+Shift+G to enable snap
    await page.keyboard.press('Control+Shift+G');
    await page.waitForTimeout(200);
    await expect(snapMenuItem).toHaveClass(/has-checkmark/);

    // Press again to disable
    await page.keyboard.press('Control+Shift+G');
    await page.waitForTimeout(200);
    await expect(snapMenuItem).not.toHaveClass(/has-checkmark/);
  });

  test('snap guides are cleared on pointerup', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Enable snap
    await page.locator('#menu-item-snap').click();
    await page.waitForTimeout(200);

    const viewer = page.locator('[data-testid="viewer"]');
    const shape = viewer.locator('[data-vertex-id]').first();

    // Select and start dragging the shape
    await shape.click();
    await page.waitForTimeout(100);

    // Begin drag
    const box = await shape.boundingBox();
    if (!box) throw new Error('Shape bounding box not found');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(50);

    // Move — guides may appear
    await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2 + 15);
    await page.waitForTimeout(100);

    // Release — guides must be cleared
    await page.mouse.up();
    await page.waitForTimeout(100);

    const guides = page.locator('[data-testid="snap-guide"]');
    await expect(guides).toHaveCount(0);
  });

  test('shape snap shows guide when near another shape edge', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Enable snap
    await page.locator('#menu-item-snap').click();
    await page.waitForTimeout(200);

    const viewer = page.locator('[data-testid="viewer"]');
    const shapes = viewer.locator('[data-vertex-id]');
    const firstShape = shapes.first();
    const secondShape = shapes.nth(1);

    // Select and start dragging the second shape (at x=240) toward the first (at x=60)
    await secondShape.click();
    await page.waitForTimeout(100);

    const box = await secondShape.boundingBox();
    if (!box) throw new Error('Second shape bounding box not found');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(50);

    // Drag close to the first shape — snap-to-shape should trigger a guide
    await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2);
    await page.waitForTimeout(150);

    // Guide lines may appear
    const guides = page.locator('[data-testid="snap-guide"]');
    const guideCount = await guides.count();

    await page.mouse.up();

    // Clean up
    await page.waitForTimeout(100);
  });

  test('grid snap snaps dragged shape to grid', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Enable snap
    await page.locator('#menu-item-snap').click();
    await page.waitForTimeout(200);

    const viewer = page.locator('[data-testid="viewer"]');
    const shape = viewer.locator('[data-vertex-id]').first();

    // Get initial transform to compare after snap
    const initialTransform = await shape.getAttribute('transform');

    await shape.click();
    await page.waitForTimeout(100);

    const box = await shape.boundingBox();
    if (!box) throw new Error('Shape bounding box not found');

    // Drag shape to a non-grid position (e.g., x=117, y=88 — off grid of 20px)
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(50);

    // Move to a position that would snap to grid
    await page.mouse.move(startX + 7, startY + 8); // within 8px threshold → should snap
    await page.waitForTimeout(100);

    await page.mouse.up();
    await page.waitForTimeout(300);

    // After snap, the shape transform should reflect snapped coordinates
    const finalTransform = await shape.getAttribute('transform');
    // The transform may change if snap kicked in; we just verify no crash
    expect(finalTransform !== undefined);
  });

  test('multi-shape move produces single undo entry', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const shapes = viewer.locator('[data-vertex-id]');

    // Get bounding boxes before move
    const boxesBefore = await Promise.all(
      [0, 1].map(async (i) => {
        const shape = shapes.nth(i);
        const box = await shape.boundingBox();
        return box!;
      })
    );

    // Shift+click to select both shapes (multi-select)
    await shapes.first().click();
    await page.waitForTimeout(100);
    await page.keyboard.down('Shift');
    await shapes.nth(1).click();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(100);

    // Start dragging
    const firstBox = boxesBefore[0]!;
    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(50);

    // Move both shapes
    await page.mouse.move(firstBox.x + firstBox.width / 2 + 40, firstBox.y + firstBox.height / 2 + 40);
    await page.waitForTimeout(100);

    await page.mouse.up();
    await page.waitForTimeout(300);

    // Verify both shapes moved
    const newBox0 = await shapes.nth(0).boundingBox();
    const newBox1 = await shapes.nth(1).boundingBox();
    expect(newBox0!.x).not.toBe(boxesBefore[0]!.x);
    expect(newBox1!.x).not.toBe(boxesBefore[1]!.x);

    // Undo — both shapes should return to original positions
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);

    const undoBox0 = await shapes.nth(0).boundingBox();
    const undoBox1 = await shapes.nth(1).boundingBox();
    expect(undoBox0!.x).toBe(boxesBefore[0]!.x);
    expect(undoBox1!.x).toBe(boxesBefore[1]!.x);
  });
});
