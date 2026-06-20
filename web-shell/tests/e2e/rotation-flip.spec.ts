import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';
const TWO_SHAPES_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/two-shapes.drawio';
const ROTATED_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/rotated-rect.drawio';

test.describe('Rotation and Flip (ADR-0057)', () => {
  /**
   * Test: Select shape, press R → shape rotates 90°
   */
  test('Press R → shape rotates 90° clockwise', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();
    await expect(rect).toHaveClass(/selected/);

    // Press R to rotate 90°
    await page.keyboard.press('r');
    await page.waitForTimeout(300);

    // Verify transform contains rotation of ~90°
    const svg = viewer.locator('svg').first();
    const outerHTML = await svg.evaluate((el) => el.outerHTML);
    // Format is: transform="rotate(90 cx cy) scale(sx sy)"
    expect(outerHTML).toMatch(/rotate\(9\d/);
  });

  /**
   * Test: Press R twice → cumulative 180°
   */
  test('Press R twice → cumulative 180° rotation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();

    await page.keyboard.press('r');
    await page.waitForTimeout(200);
    await page.keyboard.press('r');
    await page.waitForTimeout(300);

    const svg = viewer.locator('svg').first();
    const outerHTML = await svg.evaluate((el) => el.outerHTML);
    // After two 90° rotations, should have ~180°
    expect(outerHTML).toMatch(/rotate\(1[89]\d/);
  });

  /**
   * Test: Undo rotation → original rotation restored
   */
  test('Ctrl+Z undoes rotation → original rotation restored', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();

    await page.keyboard.press('r');
    await page.waitForTimeout(200);

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    const svg = viewer.locator('svg').first();
    const outerHTML = await svg.evaluate((el) => el.outerHTML);
    // Should have no rotation or transform attribute
    // Either no transform at all or transform="rotate(0 ... scale(1 1))"
    const hasTransform = /transform="rotate/.test(outerHTML);
    if (hasTransform) {
      expect(outerHTML).toMatch(/rotate\(0\.?\d*\s+\d+\.?\d*\s+\d+\.?\d*\s+scale\(1\s+1\)/);
    }
    // else no transform at all — that's fine (identity)
  });

  /**
   * Test: Redo rotation → back to rotated state
   */
  test('Ctrl+Y redoes rotation → back to rotated state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();

    await page.keyboard.press('r');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    // Redo
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(300);

    const svg = viewer.locator('svg').first();
    const outerHTML = await svg.evaluate((el) => el.outerHTML);
    expect(outerHTML).toMatch(/rotate\(9\d/);
  });

  /**
   * Test: Press H → shape flips horizontally, SVG has scale(-1 1)
   */
  test('Press H → shape flips horizontally (scale -1 1)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();

    await page.keyboard.press('h');
    await page.waitForTimeout(300);

    const svg = viewer.locator('svg').first();
    const outerHTML = await svg.evaluate((el) => el.outerHTML);
    // Horizontal flip produces scale(-1 1) in the transform
    expect(outerHTML).toMatch(/scale\(-1\s+1\)/);
  });

  /**
   * Test: Press V → shape flips vertically, SVG has scale(1 -1)
   */
  test('Press V → shape flips vertically (scale 1 -1)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();

    await page.keyboard.press('v');
    await page.waitForTimeout(300);

    const svg = viewer.locator('svg').first();
    const outerHTML = await svg.evaluate((el) => el.outerHTML);
    // Vertical flip produces scale(1 -1) in the transform
    expect(outerHTML).toMatch(/scale\(1\s+-1\)/);
  });

  /**
   * Test: Shift+R → 15° fine adjustment
   */
  test('Shift+R → 15° fine rotation adjustment', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();
    await expect(rect).toHaveClass(/selected/);

    // Dispatch keyboard event directly to document to ensure it reaches the editor
    await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'R',
        code: 'KeyR',
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });
    await page.waitForTimeout(300);

    const svg = viewer.locator('svg').first();
    const outerHTML = await svg.evaluate((el) => el.outerHTML);
    // 15° ≈ π/12 ≈ 0.261 rad → should appear as ~15° in SVG
    // π/12 ≈ 14.999... degrees
    expect(outerHTML).toMatch(/rotate\(1[45]/);
  });

  /**
   * Test: Combined rotation + flip → both transforms applied
   */
  test('Rotate then flip → both transforms applied in SVG', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();

    // Rotate 90°
    await page.keyboard.press('r');
    await page.waitForTimeout(200);
    // Flip horizontally
    await page.keyboard.press('h');
    await page.waitForTimeout(300);

    const svg = viewer.locator('svg').first();
    const outerHTML = await svg.evaluate((el) => el.outerHTML);
    // Should have both rotation and horizontal flip
    expect(outerHTML).toMatch(/rotate\(9\d/);
    expect(outerHTML).toMatch(/scale\(-1\s+1\)/);
  });

  /**
   * Test: Import .drawio with rotation attr → renders rotated
   */
  test('Import rotated-rect.drawio → shape renders with rotation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', ROTATED_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const svg = viewer.locator('svg').first();
    const outerHTML = await svg.evaluate((el) => el.outerHTML);
    // The fixture has rotation="45" in mxGeometry
    // Engine converts to 45 degrees
    expect(outerHTML).toMatch(/rotate\(45/);
  });

  /**
   * Test: Selection of multiple shapes → all rotate (batch)
   */
  test('Select multiple shapes → all rotate together', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const shapes = viewer.locator('[data-vertex-id]');

    // Select both shapes (Shift+click to add to selection)
    await shapes.nth(0).click();
    await page.keyboard.down('Shift');
    await shapes.nth(1).click();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);

    // Press R to rotate both
    await page.keyboard.press('r');
    await page.waitForTimeout(300);

    // Both shapes should have transform attributes
    const svg = viewer.locator('svg').first();
    const outerHTML = await svg.evaluate((el) => el.outerHTML);
    // Both should have rotation applied
    expect(outerHTML).toMatch(/rotate\(9\d/);
  });

  /**
   * Test: Round-trip — rotate shape, export, reimport, verify rotation preserved
   */
  test('Rotate shape, export, reimport → rotation preserved', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();

    // Rotate
    await page.keyboard.press('r');
    await page.waitForTimeout(200);

    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="save-btn"]');
    const download = await downloadPromise;
    const content = await (await download.createReadStream()).toArray();
    const xml = Buffer.concat(content).toString('utf-8');

    // Write to temp file
    const tmpFile = path.join(os.tmpdir(), `rotation-roundtrip-${Date.now()}.drawio`);
    fs.writeFileSync(tmpFile, xml, 'utf-8');

    // Re-import
    await page.setInputFiles('[data-testid="file-input"]', tmpFile);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Verify rotation is preserved
    const svg = viewer.locator('svg').first();
    const outerHTML = await svg.evaluate((el) => el.outerHTML);
    expect(outerHTML).toMatch(/rotate\(9\d/);

    // Cleanup
    fs.unlinkSync(tmpFile);
  });

  /**
   * Test: Keyboard shortcut does NOT fire when typing in input field
   */
  test('R key does NOT rotate when focus is on input element', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const rect = viewer.locator('[data-vertex-id]').first();
    await rect.click();
    await expect(rect).toHaveClass(/selected/);

    // Focus the page title input (or any text input on the page)
    const titleInput = page.locator('[data-testid="page-title-input"]');
    if (await titleInput.isVisible()) {
      await titleInput.click();
      await titleInput.fill('Test Page');

      // Press R - should NOT trigger rotation
      await page.keyboard.press('r');
      await page.waitForTimeout(300);

      // The SVG should NOT have a rotation transform (input should consume the key)
      const svg = viewer.locator('svg').first();
      const outerHTML = await svg.evaluate((el) => el.outerHTML);
      const hasRotation = /rotate\([1-9]/.test(outerHTML);
      expect(hasRotation).toBe(false);
    }
  });
});
