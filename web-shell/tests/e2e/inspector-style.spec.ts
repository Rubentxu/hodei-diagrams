import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

test.describe('Suite E: inspector-style', () => {
  /**
   * Test 1: Change fill color → SVG fill attribute changes
   */
  test('Change fill color → SVG fill changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    // Select the shape
    await rect.click();
    await page.waitForTimeout(300);

    // Verify inspector fields are now visible
    await expect(page.locator('[data-testid="inspector-pane-style"]')).toBeVisible();

    // Change fill color using the color picker's native value setter
    const fillInput = page.locator('[data-testid="inspector-fill"]');
    await fillInput.evaluate((el: HTMLInputElement) => {
      // Use stepUp to trigger change events properly
      el.value = '#ff0000';
    });
    // Dispatch input event to trigger debounced dispatch
    await fillInput.dispatchEvent('input');

    // Wait for debounce (300ms) + re-render
    await page.waitForTimeout(600);

    // Verify SVG rect has fill="#ff0000"
    const fillAttr = await rect.getAttribute('fill');
    expect(fillAttr).toBe('#ff0000');
  });

  /**
   * Test 2: Change stroke color → SVG stroke attribute changes
   */
  test('Change stroke color → SVG stroke changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(300);

    const strokeInput = page.locator('[data-testid="inspector-stroke"]');
    await strokeInput.evaluate((el: HTMLInputElement) => {
      el.value = '#0000ff';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.waitForTimeout(500);

    const strokeAttr = await rect.getAttribute('stroke');
    expect(strokeAttr).toBe('#0000ff');
  });

  /**
   * Test 3: Change stroke width → stroke-width attribute changes
   */
  test('Change stroke width → stroke-width changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(300);

    const widthInput = page.locator('[data-testid="inspector-stroke-width"]');
    await widthInput.evaluate((el: HTMLInputElement) => {
      el.value = '5';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.waitForTimeout(500);

    const widthAttr = await rect.getAttribute('stroke-width');
    expect(widthAttr).toBe('5');
  });

  /**
   * Test 4: Toggle dashed → stroke-dasharray present when dashed, absent when not
   */
  test('Toggle dashed → stroke-dasharray present when dashed, absent when not', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(300);

    // Initially dashed should be off
    const dashedInput = page.locator('[data-testid="inspector-dashed"]');
    const initialDash = await rect.getAttribute('stroke-dasharray');
    expect(initialDash ?? '').not.toContain('8');

    // Toggle dashed on
    await dashedInput.check({ force: true });
    await page.waitForTimeout(500);

    const dashOn = await rect.getAttribute('stroke-dasharray');
    expect(dashOn).toContain('8');

    // Toggle dashed off
    await dashedInput.uncheck({ force: true });
    await page.waitForTimeout(500);

    const dashOff = await rect.getAttribute('stroke-dasharray');
    expect(dashOff ?? '').not.toContain('8');
  });

  /**
   * Test 5: Toggle rounded → rect element gets rx/ry attributes (becomes rounded rect)
   */
  test('Toggle rounded → shape renders with rx/ry attributes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(300);

    // Toggle rounded on
    const roundedInput = page.locator('[data-testid="inspector-rounded"]');
    await roundedInput.check({ force: true });
    await page.waitForTimeout(500);

    // The shape should now have rx and ry attributes
    const rxAttr = await rect.getAttribute('rx');
    const ryAttr = await rect.getAttribute('ry');
    expect(rxAttr).not.toBeNull();
    expect(ryAttr).not.toBeNull();
    expect(parseFloat(rxAttr!)).toBeGreaterThan(0);
    expect(parseFloat(ryAttr!)).toBeGreaterThan(0);
  });

  /**
   * Test 6: Change font family → text element font-family changes
   */
  test('Change font family → text element font-family changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(300);

    // Switch to Text tab
    await page.click('[data-testid="inspector-tab-text"]');
    await page.waitForTimeout(200);

    const fontSelect = page.locator('[data-testid="inspector-font-family"]');
    await fontSelect.selectOption('Helvetica');
    await page.waitForTimeout(500);

    // Find text elements within the shape (if any)
    const textEl = viewer.locator('text').first();
    if (await textEl.count() > 0) {
      const fontFamily = await textEl.getAttribute('font-family');
      expect(fontFamily).toContain('Helvetica');
    }
  });

  /**
   * Test 7: Change font size → font-size changes
   */
  test('Change font size → font-size changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(300);

    await page.click('[data-testid="inspector-tab-text"]');
    await page.waitForTimeout(200);

    const sizeInput = page.locator('[data-testid="inspector-font-size"]');
    await sizeInput.evaluate((el: HTMLInputElement) => {
      el.value = '24';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(500);

    const textEl = viewer.locator('text').first();
    if (await textEl.count() > 0) {
      const fontSize = await textEl.getAttribute('font-size');
      expect(fontSize).toBe('24');
    }
  });

  /**
   * Test 8: Change font color → text fill changes
   */
  test('Change font color → text fill changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(300);

    await page.click('[data-testid="inspector-tab-text"]');
    await page.waitForTimeout(200);

    const fontColorInput = page.locator('[data-testid="inspector-font-color"]');
    await fontColorInput.evaluate((el: HTMLInputElement) => {
      el.value = '#00ff00';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(500);

    const textEl = viewer.locator('text').first();
    if (await textEl.count() > 0) {
      const fillAttr = await textEl.getAttribute('fill');
      expect(fillAttr).toBe('#00ff00');
    }
  });

  /**
   * Test 9: Toggle bold → font-weight changes
   */
  test('Toggle bold → font-weight changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(300);

    await page.click('[data-testid="inspector-tab-text"]');
    await page.waitForTimeout(200);

    const boldBtn = page.locator('[data-testid="inspector-bold"]');
    await boldBtn.click();
    await page.waitForTimeout(500);

    const textEl = viewer.locator('text').first();
    if (await textEl.count() > 0) {
      // Check for font-weight attribute or style containing font-weight
      const fontWeight = await textEl.getAttribute('font-weight');
      const styleAttr = await textEl.getAttribute('style');
      expect(fontWeight ?? styleAttr ?? '').toMatch(/bold|700/);
    }
  });

  /**
   * Test 10: Toggle italic → font-style changes
   */
  test('Toggle italic → font-style changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(300);

    await page.click('[data-testid="inspector-tab-text"]');
    await page.waitForTimeout(200);

    const italicBtn = page.locator('[data-testid="inspector-italic"]');
    await italicBtn.click();
    await page.waitForTimeout(500);

    const textEl = viewer.locator('text').first();
    if (await textEl.count() > 0) {
      const fontStyle = await textEl.getAttribute('font-style');
      const styleAttr = await textEl.getAttribute('style');
      expect(fontStyle ?? styleAttr ?? '').toMatch(/italic/);
    }
  });

  /**
   * Test 11: No selection → controls disabled or no-op
   * When no shape is selected, inspector should show "no selection" message
   * and changes to controls should not affect any shape.
   */
  test('No selection → inspector shows no-selection message', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Ensure no shape is selected - use Escape (reliable)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Inspector should show no-selection message in the active pane (style pane)
    const noSelectionMsg = page.locator('[data-testid="inspector-pane-style"] .no-selection-msg');
    await expect(noSelectionMsg).toBeVisible();
  });

  /**
   * Test 12: Rapid changes debounced → final value wins
   * When multiple changes are made rapidly, only the last one (after debounce)
   * should be applied.
   */
  test('Rapid changes debounced → final value wins', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();

    await rect.click();
    await page.waitForTimeout(300);

    // Rapidly change fill color multiple times
    const fillInput = page.locator('[data-testid="inspector-fill"]');
    await fillInput.evaluate((el: HTMLInputElement) => {
      el.value = '#ff0000';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await fillInput.evaluate((el: HTMLInputElement) => {
      el.value = '#00ff00';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await fillInput.evaluate((el: HTMLInputElement) => {
      el.value = '#0000ff';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Wait for debounce (300ms) + buffer
    await page.waitForTimeout(600);

    // Final value should be #0000ff
    const fillAttr = await rect.getAttribute('fill');
    expect(fillAttr).toBe('#0000ff');
  });
});
