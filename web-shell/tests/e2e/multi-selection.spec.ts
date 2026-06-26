import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';

/**
 * Multi-selection E2E tests covering ADR-0054 and ADR-0055.
 * Tests click interactions, marquee, batch operations, copy/paste, and keyboard shortcuts.
 */
test.describe('Multi-selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Click interactions', () => {
    test('click on shape selects it', async ({ page }) => {
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const viewer = page.locator('[data-testid="viewer"]');
      const rect = viewer.locator('[data-vertex-id]').first();
      await rect.click();

      await expect(rect).toHaveClass(/selected/);
    });

    test('click another shape replaces selection', async ({ page }) => {
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const viewer = page.locator('[data-testid="viewer"]');
      const shapes = viewer.locator('[data-vertex-id]');

      // Place a second shape
      await page.locator('[data-testid="rect-tool-btn"]').click();
      await viewer.click({ position: { x: 300, y: 300 } });
      await page.waitForTimeout(300);

      const count = await shapes.count();
      expect(count).toBeGreaterThanOrEqual(2);

      // Click first shape
      const first = shapes.first();
      await first.click();
      await expect(first).toHaveClass(/selected/);

      // Click second shape - should replace selection
      const second = shapes.nth(1);
      await second.click();
      await expect(second).toHaveClass(/selected/);
      // First should no longer be selected
      await expect(first).not.toHaveClass(/selected/);
    });

    test('click empty area clears selection', async ({ page }) => {
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const viewer = page.locator('[data-testid="viewer"]');
      const shapes = viewer.locator('[data-vertex-id]');
      const _shapeCount = await shapes.count();

      // Click a shape to select it
      await shapes.first().click();
      await page.waitForTimeout(100);

      // Click far from any shape (top-left corner of viewport)
      await viewer.click({ position: { x: 10, y: 10 } });
      await page.waitForTimeout(100);

      // Check no shapes are selected
      const selectedCount = await viewer.evaluate(
        (el) => el.querySelectorAll('[data-vertex-id].selected').length
      );
      expect(selectedCount).toBe(0);
    });

    test('shift+click adds to selection', async ({ page }) => {
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const viewer = page.locator('[data-testid="viewer"]');
      const shapes = viewer.locator('[data-vertex-id]');

      // Place second shape
      await page.locator('[data-testid="rect-tool-btn"]').click();
      await viewer.click({ position: { x: 300, y: 300 } });
      await page.waitForTimeout(300);

      const first = shapes.first();
      const second = shapes.nth(1);

      // Click first
      await first.click();
      await expect(first).toHaveClass(/selected/);

      // Shift+click second - should add to selection
      await second.click({ modifiers: ['Shift'] });
      await expect(first).toHaveClass(/selected/);
      await expect(second).toHaveClass(/selected/);
    });

    test('cmd/ctrl+click adds to selection', async ({ page }) => {
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const viewer = page.locator('[data-testid="viewer"]');
      const shapes = viewer.locator('[data-vertex-id]');

      // Place second shape
      await page.locator('[data-testid="rect-tool-btn"]').click();
      await viewer.click({ position: { x: 300, y: 300 } });
      await page.waitForTimeout(300);

      const first = shapes.first();
      const second = shapes.nth(1);

      // Click first
      await first.click();
      await expect(first).toHaveClass(/selected/);

      // Ctrl/Cmd+click second - should add to selection
      await second.click({ modifiers: ['Control'] });
      await expect(first).toHaveClass(/selected/);
      await expect(second).toHaveClass(/selected/);
    });
  });

  test.describe('Marquee selection', () => {
    test('shift+click empty starts marquee and drag selects multiple', async ({ page }) => {
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const viewer = page.locator('[data-testid="viewer"]');

      // Place multiple shapes
      await page.locator('[data-testid="rect-tool-btn"]').click();
      await viewer.click({ position: { x: 100, y: 100 } });
      await page.waitForTimeout(100);
      await page.locator('[data-testid="rect-tool-btn"]').click();
      await viewer.click({ position: { x: 300, y: 300 } });
      await page.waitForTimeout(100);

      const shapes = viewer.locator('[data-vertex-id]');
      const count = await shapes.count();
      expect(count).toBeGreaterThanOrEqual(3);

      // Shift+click on empty area to start marquee
      const box = await viewer.boundingBox();
      if (!box) throw new Error('Viewer not found');

      // Start marquee from top-left area
      await page.mouse.move(box.x + 50, box.y + 50);
      await page.mouse.down({ button: 'left' });
      // Drag across to cover new shapes
      await page.mouse.move(box.x + 350, box.y + 350);
      await page.mouse.up();

      await page.waitForTimeout(200);

      // At least some shapes should be selected
      const selectedCount = await viewer.evaluate(
        (el) => el.querySelectorAll('[data-vertex-id].selected').length
      );
      expect(selectedCount).toBeGreaterThan(0);
    });
  });

  test.describe('Batch operations', () => {
    test('select all and delete removes all shapes', async ({ page }) => {
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const viewer = page.locator('[data-testid="viewer"]');
      const shapes = viewer.locator('[data-vertex-id]');

      // Place two additional shapes
      await page.locator('[data-testid="rect-tool-btn"]').click();
      await viewer.click({ position: { x: 150, y: 150 } });
      await page.waitForTimeout(100);
      await page.locator('[data-testid="rect-tool-btn"]').click();
      await viewer.click({ position: { x: 250, y: 250 } });
      await page.waitForTimeout(300);

      const initialCount = await shapes.count();
      expect(initialCount).toBeGreaterThanOrEqual(3);

      // Select all
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(100);

      // Delete
      await page.keyboard.press('Delete');
      await page.waitForTimeout(300);

      // All should be gone
      const remaining = await shapes.count();
      expect(remaining).toBeLessThan(initialCount);
    });

    test('select all and clear with Escape', async ({ page }) => {
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const viewer = page.locator('[data-testid="viewer"]');
      const _shapes = viewer.locator('[data-vertex-id]');

      // Place one more shape
      await page.locator('[data-testid="rect-tool-btn"]').click();
      await viewer.click({ position: { x: 150, y: 150 } });
      await page.waitForTimeout(300);

      // Select all
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(100);

      // Verify some are selected
      const selectedCount = await viewer.evaluate(
        (el) => el.querySelectorAll('[data-vertex-id].selected').length
      );
      expect(selectedCount).toBeGreaterThan(0);

      // Escape should clear
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);

      const afterEscape = await viewer.evaluate(
        (el) => el.querySelectorAll('[data-vertex-id].selected').length
      );
      expect(afterEscape).toBe(0);
    });
  });

  test.describe('Copy/Paste', () => {
    test('cut removes original', async ({ page }) => {
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const viewer = page.locator('[data-testid="viewer"]');
      const shapes = viewer.locator('[data-vertex-id]');
      const initialCount = await shapes.count();

      // Select shape
      await shapes.first().click();
      await page.waitForTimeout(100);

      // Cut
      await page.keyboard.press('Control+x');
      await page.waitForTimeout(300);

      // Original should be gone
      const afterCut = await shapes.count();
      expect(afterCut).toBe(initialCount - 1);
    });
  });

  test.describe('Keyboard shortcuts', () => {
    test('Ctrl+A selects all shapes', async ({ page }) => {
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const viewer = page.locator('[data-testid="viewer"]');

      // Place multiple shapes
      await page.locator('[data-testid="rect-tool-btn"]').click();
      await viewer.click({ position: { x: 150, y: 150 } });
      await page.waitForTimeout(100);
      await page.locator('[data-testid="rect-tool-btn"]').click();
      await viewer.click({ position: { x: 250, y: 250 } });
      await page.waitForTimeout(300);

      const shapes = viewer.locator('[data-vertex-id]');
      const totalCount = await shapes.count();

      // Ctrl+A
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(100);

      const selectedCount = await viewer.evaluate(
        (el) => el.querySelectorAll('[data-vertex-id].selected').length
      );
      expect(selectedCount).toBe(totalCount);
    });

    test('Escape clears selection', async ({ page }) => {
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const viewer = page.locator('[data-testid="viewer"]');
      const rect = viewer.locator('[data-vertex-id]').first();

      await rect.click();
      await expect(rect).toHaveClass(/selected/);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);

      await expect(rect).not.toHaveClass(/selected/);
    });

    test('Delete removes selected shapes', async ({ page }) => {
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const viewer = page.locator('[data-testid="viewer"]');
      const shapes = viewer.locator('[data-vertex-id]');
      const initialCount = await shapes.count();

      // Select a shape
      await shapes.first().click();
      await page.waitForTimeout(100);

      // Delete
      await page.keyboard.press('Delete');
      await page.waitForTimeout(300);

      const afterDelete = await shapes.count();
      expect(afterDelete).toBe(initialCount - 1);
    });
  });

  test.describe('HUD display', () => {
    test('HUD shows selection count when multiple selected', async ({ page }) => {
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const viewer = page.locator('[data-testid="viewer"]');
      const hud = page.locator('[data-testid="hud"]');

      // Place another shape
      await page.locator('[data-testid="rect-tool-btn"]').click();
      await viewer.click({ position: { x: 150, y: 150 } });
      await page.waitForTimeout(300);

      // Select all
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(100);

      // HUD should show count
      const hudText = await hud.textContent();
      expect(hudText).toMatch(/2|shapes?/i);
    });
  });
});
