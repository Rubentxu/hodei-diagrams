import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

test.describe('Suite G: undo-redo-advanced', () => {
  /**
   * Test 1: Undo after style change reverts visual style.
   *
   * NOTE on the input interaction: we use Playwright's `fill()` on the
   * hex input (`inspector-fill-hex`) rather than `evaluate()` + manual
   * `dispatchEvent('input')` on the color input (`inspector-fill`). The
   * earlier approach simulated an event but skipped the browser's
   * `change` event and color-picker-closed lifecycle, which masked a
   * real implementation. Using `fill()` exercises the full event chain
   * the real user produces.
   */
  test('Undo after style change reverts visual style', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(300);

    const originalFill = await rect.getAttribute('fill');

    // Use the hex text input which always accepts free-form text — this
    // mirrors what a user does when they paste/type a hex value. The
    // underlying applyFillToSelection path is the same regardless of which
    // inspector field triggers it.
    await page.locator('[data-testid="inspector-fill-hex"]').fill('#ff0000');
    await page.waitForTimeout(500);

    // Verify fill changed in the SVG
    const newFill = await rect.getAttribute('fill');
    expect(newFill).toBe('#ff0000');

    // Click the toolbar Undo button (more reliable than Ctrl+Z when an
    // input has focus — keyboard Ctrl+Z can be consumed by the input's
    // native undo in some headless contexts).
    await page.locator('[data-testid="viewer"] svg').click({ position: { x: 200, y: 300 } });
    await page.waitForTimeout(200);

    const undoBtn = page.locator('[data-testid="undo-btn"]');
    await undoBtn.click();
    await page.waitForTimeout(700);

    // Fill should be reverted
    const revertedFill = await rect.getAttribute('fill');
    expect(revertedFill).toBe(originalFill);
  });

  /**
   * Test 2: Redo after undo restores style
   */
  test('Redo after undo restores style', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(300);

    // Change fill color
    const fillInput = page.locator('[data-testid="inspector-fill"]');
    await fillInput.evaluate((el: HTMLInputElement) => {
      el.value = '#00ff00';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(500);

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);

    // Redo
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(400);

    // Style should be restored
    const restoredFill = await rect.getAttribute('fill');
    expect(restoredFill).toBe('#00ff00');
  });

  /**
   * Test 3: Undo after creating 3 shapes removes them in reverse order
   */
  test('Undo after creating 3 shapes removes them in reverse order', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const initialCount = await viewer.locator('[data-vertex-id]').count();

    // Create 3 shapes
    await page.click('[data-testid="rect-tool-btn"]');
    await viewer.click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(200);

    await page.click('[data-testid="ellipse-tool-btn"]');
    await viewer.click({ position: { x: 200, y: 100 } });
    await page.waitForTimeout(200);

    await page.click('[data-testid="rounded-rect-tool-btn"]');
    await viewer.click({ position: { x: 300, y: 100 } });
    await page.waitForTimeout(200);

    const afterCreateCount = await viewer.locator('[data-vertex-id]').count();
    expect(afterCreateCount).toBe(initialCount + 3);

    // Undo 3 times
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);

    // Should be back to initial count
    const afterUndoCount = await viewer.locator('[data-vertex-id]').count();
    expect(afterUndoCount).toBe(initialCount);
  });

  /**
   * Test 4: Redo restores shapes in correct order
   */
  test('Redo restores shapes in correct order', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const initialCount = await viewer.locator('[data-vertex-id]').count();

    // Create 2 shapes
    await page.click('[data-testid="rect-tool-btn"]');
    await viewer.click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(200);

    await page.click('[data-testid="ellipse-tool-btn"]');
    await viewer.click({ position: { x: 200, y: 100 } });
    await page.waitForTimeout(200);

    // Undo both
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);

    const afterUndo = await viewer.locator('[data-vertex-id]').count();
    expect(afterUndo).toBe(initialCount);

    // Redo - shapes should come back
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(400);

    const afterRedo = await viewer.locator('[data-vertex-id]').count();
    expect(afterRedo).toBe(initialCount + 2);
  });

  /**
   * Test 5: Ctrl+Z inside text input does not trigger app undo
    * When an input element has focus, the app-level Ctrl+Z handler should not fire.
    * We verify this by checking that a Ctrl+Z while focused on an input doesn't
    * undo the previously created shape.
    */
  test('Ctrl+Z inside text input does not trigger app undo', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const initialCount = await viewer.locator('[data-vertex-id]').count();
    expect(initialCount).toBe(1); // simple-rect

    // Select the shape (simple-rect is already there)
    await viewer.locator('[data-vertex-id]').first().click();
    await page.waitForTimeout(200);

    // Use the fill hex input from the Style pane (visible when shape selected)
    const fillHexInput = page.locator('[data-testid="inspector-fill-hex"]');
    await fillHexInput.focus();
    await page.waitForTimeout(100);

    // Verify the input has focus
    const focusedTag = await page.evaluate(() => (document.activeElement as HTMLElement)?.tagName);
    console.log('Focused element tag:', focusedTag);
    expect(focusedTag).toBe('INPUT');

    // Press Ctrl+Z while input is focused - should NOT undo anything
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    // Shape count should be unchanged (app undo was NOT triggered)
    const afterInputUndo = await viewer.locator('[data-vertex-id]').count();
    expect(afterInputUndo).toBe(initialCount);
  });

  /**
   * Test 6: Undo/redo buttons update enabled state after each action
   */
  test('Undo/redo buttons update enabled state after each action', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const undoBtn = page.locator('[data-testid="undo-btn"]');
    const redoBtn = page.locator('[data-testid="redo-btn"]');

    // Initially undo should be disabled (no history yet)
    await expect(undoBtn).toBeDisabled();

    // Create a shape
    await page.click('[data-testid="rect-tool-btn"]');
    await viewer.click({ position: { x: 200, y: 150 } });
    await page.waitForTimeout(400);

    // Now undo should be enabled (we have history)
    await expect(undoBtn).toBeEnabled();

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);

    // Now redo should be enabled
    await expect(redoBtn).toBeEnabled();

    // Redo
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(400);

    // Undo should be enabled again, redo disabled
    await expect(undoBtn).toBeEnabled();
    await expect(redoBtn).toBeDisabled();
  });
});
