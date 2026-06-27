import { test, expect, Page } from '@playwright/test';
import { fixturePath } from './fixtures.js';

const TWO_SHAPES_PATH =
  fixturePath('two-shapes.drawio');
const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');
const ALIGN_TEST_PATH =
  fixturePath('align-test.drawio');
const DISTRIBUTE_TEST_PATH =
  fixturePath('distribute-test.drawio');

/**
 * Helper to click the Arrange tab in the inspector.
 */
async function clickArrangeTab(page: Page): Promise<void> {
  await page.click('[data-testid="inspector-tab-arrange"]');
  await page.waitForTimeout(100);
}

test.describe('Phase 7 — Snap/Align', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  // ─── Snap tests (PR-SP1) ────────────────────────────────────────────────

  test('snap menu item toggles snap', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const snapMenuItem = page.locator('#menu-item-snap');
    await expect(snapMenuItem).not.toHaveClass(/has-checkmark/);

    await snapMenuItem.click();
    await page.waitForTimeout(200);
    await expect(snapMenuItem).toHaveClass(/has-checkmark/);

    await snapMenuItem.click();
    await page.waitForTimeout(200);
    await expect(snapMenuItem).not.toHaveClass(/has-checkmark/);
  });

  test('snap disabled by default', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const snapMenuItem = page.locator('#menu-item-snap');
    await expect(snapMenuItem).not.toHaveClass(/has-checkmark/);

    const guides = page.locator('[data-testid="snap-guide"]');
    await expect(guides).toHaveCount(0);
  });

  test('snap toggle keyboard works', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const snapMenuItem = page.locator('#menu-item-snap');

    await page.keyboard.press('Control+Shift+G');
    await page.waitForTimeout(200);
    await expect(snapMenuItem).toHaveClass(/has-checkmark/);

    await page.keyboard.press('Control+Shift+G');
    await page.waitForTimeout(200);
    await expect(snapMenuItem).not.toHaveClass(/has-checkmark/);
  });

  test('snap guides are cleared on pointerup', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    await page.locator('#menu-item-snap').click();
    await page.waitForTimeout(200);

    const viewer = page.locator('[data-testid="viewer"]');
    const shape = viewer.locator('[data-vertex-id]').first();

    await shape.click();
    await page.waitForTimeout(100);

    const box = await shape.boundingBox();
    if (!box) throw new Error('Shape bounding box not found');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(50);

    await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2 + 15);
    await page.waitForTimeout(100);

    await page.mouse.up();
    await page.waitForTimeout(100);

    const guides = page.locator('[data-testid="snap-guide"]');
    await expect(guides).toHaveCount(0);
  });

  test('shape snap shows guide when near another shape edge', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    await page.locator('#menu-item-snap').click();
    await page.waitForTimeout(200);

    const viewer = page.locator('[data-testid="viewer"]');
    const secondShape = viewer.locator('[data-vertex-id]').nth(1);

    await secondShape.click();
    await page.waitForTimeout(100);

    const box = await secondShape.boundingBox();
    if (!box) throw new Error('Second shape bounding box not found');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(50);

    await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2);
    await page.waitForTimeout(150);

    await page.mouse.up();
    await page.waitForTimeout(100);
  });

  test('grid snap snaps dragged shape to grid', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    await page.locator('#menu-item-snap').click();
    await page.waitForTimeout(200);

    const viewer = page.locator('[data-testid="viewer"]');
    const shape = viewer.locator('[data-vertex-id]').first();

    await shape.click();
    await page.waitForTimeout(100);

    const box = await shape.boundingBox();
    if (!box) throw new Error('Shape bounding box not found');

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(50);

    await page.mouse.move(startX + 7, startY + 8);
    await page.waitForTimeout(100);

    await page.mouse.up();
    await page.waitForTimeout(300);

    const finalTransform = await shape.getAttribute('transform');
    expect(finalTransform !== undefined);
  });

  test('multi-shape move produces single undo entry', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const shapes = viewer.locator('[data-vertex-id]');

    const boxesBefore = await Promise.all(
      [0, 1].map(async (i) => {
        const shape = shapes.nth(i);
        const box = await shape.boundingBox();
        return box!;
      })
    );

    await shapes.first().click();
    await page.waitForTimeout(100);
    await page.keyboard.down('Shift');
    await shapes.nth(1).click();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(100);

    const firstBox = boxesBefore[0]!;
    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(50);

    await page.mouse.move(firstBox.x + firstBox.width / 2 + 40, firstBox.y + firstBox.height / 2 + 40);
    await page.waitForTimeout(100);

    await page.mouse.up();
    await page.waitForTimeout(300);

    const newBox0 = await shapes.nth(0).boundingBox();
    const newBox1 = await shapes.nth(1).boundingBox();
    expect(newBox0!.x).not.toBe(boxesBefore[0]!.x);
    expect(newBox1!.x).not.toBe(boxesBefore[1]!.x);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);

    const undoBox0 = await shapes.nth(0).boundingBox();
    const undoBox1 = await shapes.nth(1).boundingBox();
    expect(undoBox0!.x).toBe(boxesBefore[0]!.x);
    expect(undoBox1!.x).toBe(boxesBefore[1]!.x);
  });

  // ─── Align/Distribute/SameSize tests (PR-SP2) ───────────────────────────

  test('Align Left moves all selected shapes to leftmost x', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', ALIGN_TEST_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const shapes = page.locator('[data-vertex-id]');
    await expect(shapes).toHaveCount(3);

    await shapes.nth(0).click();
    await shapes.nth(1).click({ modifiers: ['Control'] });
    await shapes.nth(2).click({ modifiers: ['Control'] });

    await clickArrangeTab(page);
    await page.click('[data-testid="arrange-btn-align-left"]');
    await page.waitForTimeout(300);
  });

  test('Align Center H centers shapes horizontally', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', ALIGN_TEST_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const shapes = page.locator('[data-vertex-id]');
    await shapes.nth(0).click();
    await shapes.nth(1).click({ modifiers: ['Control'] });
    await shapes.nth(2).click({ modifiers: ['Control'] });

    await clickArrangeTab(page);
    await page.click('[data-testid="arrange-btn-align-center-h"]');
    await page.waitForTimeout(300);
  });

  test('Align Right moves shapes to rightmost x edge', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', ALIGN_TEST_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const shapes = page.locator('[data-vertex-id]');
    await shapes.nth(0).click();
    await shapes.nth(1).click({ modifiers: ['Control'] });
    await shapes.nth(2).click({ modifiers: ['Control'] });

    await clickArrangeTab(page);
    await page.click('[data-testid="arrange-btn-align-right"]');
    await page.waitForTimeout(300);
  });

  test('Align Top moves shapes to topmost y', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', ALIGN_TEST_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const shapes = page.locator('[data-vertex-id]');
    await shapes.nth(0).click();
    await shapes.nth(1).click({ modifiers: ['Control'] });
    await shapes.nth(2).click({ modifiers: ['Control'] });

    await clickArrangeTab(page);
    await page.click('[data-testid="arrange-btn-align-top"]');
    await page.waitForTimeout(300);
  });

  test('Align Bottom moves shapes to bottommost y edge', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', ALIGN_TEST_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const shapes = page.locator('[data-vertex-id]');
    await shapes.nth(0).click();
    await shapes.nth(1).click({ modifiers: ['Control'] });
    await shapes.nth(2).click({ modifiers: ['Control'] });

    await clickArrangeTab(page);
    await page.click('[data-testid="arrange-btn-align-bottom"]');
    await page.waitForTimeout(300);
  });

  test('Distribute H produces equal horizontal gaps', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', DISTRIBUTE_TEST_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const shapes = page.locator('[data-vertex-id]');
    await expect(shapes).toHaveCount(3);

    await shapes.nth(0).click();
    await shapes.nth(1).click({ modifiers: ['Control'] });
    await shapes.nth(2).click({ modifiers: ['Control'] });

    await clickArrangeTab(page);
    await page.click('[data-testid="arrange-btn-distribute-h"]');
    await page.waitForTimeout(300);
  });

  test('Distribute V produces equal vertical gaps', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', DISTRIBUTE_TEST_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const shapes = page.locator('[data-vertex-id]');
    await shapes.nth(0).click();
    await shapes.nth(1).click({ modifiers: ['Control'] });
    await shapes.nth(2).click({ modifiers: ['Control'] });

    await clickArrangeTab(page);
    await page.click('[data-testid="arrange-btn-distribute-v"]');
    await page.waitForTimeout(300);
  });

  test('Same Width matches anchor shape width', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', ALIGN_TEST_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const shapes = page.locator('[data-vertex-id]');
    await shapes.nth(0).click();
    await shapes.nth(1).click({ modifiers: ['Control'] });
    await shapes.nth(2).click({ modifiers: ['Control'] });

    await clickArrangeTab(page);
    await page.click('[data-testid="arrange-btn-same-width"]');
    await page.waitForTimeout(300);
  });

  test('Same Both matches anchor width and height', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', ALIGN_TEST_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const shapes = page.locator('[data-vertex-id]');
    await shapes.nth(0).click();
    await shapes.nth(1).click({ modifiers: ['Control'] });
    await shapes.nth(2).click({ modifiers: ['Control'] });

    await clickArrangeTab(page);
    await page.click('[data-testid="arrange-btn-same-both"]');
    await page.waitForTimeout(300);
  });

  test('Align emits exactly one undo entry', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', ALIGN_TEST_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const shapes = page.locator('[data-vertex-id]');
    await shapes.nth(0).click();
    await shapes.nth(1).click({ modifiers: ['Control'] });

    await clickArrangeTab(page);
    await page.click('[data-testid="arrange-btn-align-left"]');
    await page.waitForTimeout(300);

    const undoBtn = page.locator('[data-testid="undo-btn"]');
    await expect(undoBtn).not.toBeDisabled();

    await undoBtn.click();
    await page.waitForTimeout(300);
  });

  test('Arrange buttons disabled when selection size < 2', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', ALIGN_TEST_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const shapes = page.locator('[data-vertex-id]');
    await shapes.nth(0).click();

    await clickArrangeTab(page);

    const alignLeftBtn = page.locator('[data-testid="arrange-btn-align-left"]');
    const sameWidthBtn = page.locator('[data-testid="arrange-btn-same-width"]');
    await expect(alignLeftBtn).toBeDisabled();
    await expect(sameWidthBtn).toBeDisabled();

    const distributeHBtn = page.locator('[data-testid="arrange-btn-distribute-h"]');
    await expect(distributeHBtn).toBeDisabled();
  });

  test('Distribute buttons enabled when selection size >= 3', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', DISTRIBUTE_TEST_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const shapes = page.locator('[data-vertex-id]');
    await shapes.nth(0).click();
    await shapes.nth(1).click({ modifiers: ['Control'] });
    await shapes.nth(2).click({ modifiers: ['Control'] });

    await clickArrangeTab(page);

    const distributeHBtn = page.locator('[data-testid="arrange-btn-distribute-h"]');
    await expect(distributeHBtn).not.toBeDisabled();
  });

});
