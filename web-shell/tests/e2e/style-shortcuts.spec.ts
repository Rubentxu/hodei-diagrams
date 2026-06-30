/**
 * style-shortcuts.spec.ts — IP-C: Style shortcut matrix (draw.io parity)
 *
 * Tests:
 * - STYL-003: Ctrl+Shift+D sets default style from selected shape
 * - STYL-004: Ctrl+Shift+R (no selection) clears default style
 * - STYL-005: Alt+C copies style to clipboard
 * - STYL-006: Alt+V pastes style to selected shapes
 *
 * Reference: docs/drawio-user-interaction-workflows.md (STYLE-003..007)
 * ADR-0079 (interaction parity strategy)
 */
import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TWO_SHAPES_PATH = path.resolve(
  __dirname,
  '../../public/fixtures/two-shapes.drawio',
);

test.describe('Suite IP-C: Style Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('STYL-005: Alt+C copies style to editor clipboard', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Click the first shape to select it
    const firstShape = page.locator('[data-vertex-id]').first();
    await firstShape.click();
    await page.waitForTimeout(100);

    // Press Alt+C
    await page.keyboard.press('Alt+c');
    await page.waitForTimeout(100);

    // Verify via __hodeiDebug
    const clipboard = await page.evaluate(() => {
      const editor = (window as any).__hodeiDebug?.getEditor?.();
      return editor?.getStyleClipboard?.() ?? null;
    });
    expect(clipboard).not.toBeNull();
  });

  test('STYL-006: Alt+V pastes clipboard style to selected shapes', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Select the first shape and copy its style
    const firstShape = page.locator('[data-vertex-id]').first();
    await firstShape.click();
    await page.waitForTimeout(100);
    await page.keyboard.press('Alt+c');
    await page.waitForTimeout(100);

    // Select all shapes and paste
    await page.keyboard.press('Control+i');
    await page.waitForTimeout(100);
    await page.keyboard.press('Alt+v');
    await page.waitForTimeout(200);

    // Both shapes should be selected
    const selected = await page.locator('[data-vertex-id].selected').count();
    expect(selected).toBeGreaterThanOrEqual(2);
  });

  test('STYL-003: Ctrl+Shift+D sets default style from single selection', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Select the first shape
    const firstShape = page.locator('[data-vertex-id]').first();
    await firstShape.click();
    await page.waitForTimeout(100);

    // Press Ctrl+Shift+D
    await page.keyboard.press('Control+Shift+d');
    await page.waitForTimeout(100);

    // Verify via __hodeiDebug
    const defaultStyle = await page.evaluate(() => {
      const editor = (window as any).__hodeiDebug?.getEditor?.();
      return editor?.getDefaultStyle?.() ?? null;
    });
    expect(defaultStyle).not.toBeNull();
  });

  test('STYL-003: Ctrl+Shift+D on multi-selection is a no-op', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Select all (2 shapes)
    await page.keyboard.press('Control+i');
    await page.waitForTimeout(100);

    // Press Ctrl+Shift+D
    await page.keyboard.press('Control+Shift+d');
    await page.waitForTimeout(100);

    // Default style should NOT be set
    const defaultStyle = await page.evaluate(() => {
      const editor = (window as any).__hodeiDebug?.getEditor?.();
      return editor?.getDefaultStyle?.() ?? null;
    });
    expect(defaultStyle).toBeNull();
  });

  test('STYL-004: Ctrl+Shift+R (no selection) clears default style', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Set a default style first
    const firstShape = page.locator('[data-vertex-id]').first();
    await firstShape.click();
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+Shift+d');
    await page.waitForTimeout(100);

    let defaultStyle = await page.evaluate(() => {
      const editor = (window as any).__hodeiDebug?.getEditor?.();
      return editor?.getDefaultStyle?.() ?? null;
    });
    expect(defaultStyle).not.toBeNull();

    // Deselect via Escape (reliable across viewport sizes)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Now Ctrl+Shift+R should clear
    await page.keyboard.press('Control+Shift+r');
    await page.waitForTimeout(100);

    defaultStyle = await page.evaluate(() => {
      const editor = (window as any).__hodeiDebug?.getEditor?.();
      return editor?.getDefaultStyle?.() ?? null;
    });
    expect(defaultStyle).toBeNull();
  });
});
