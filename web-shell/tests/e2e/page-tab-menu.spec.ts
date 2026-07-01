/**
 * page-tab-menu.spec.ts — IP-D: Page tab right-click context menu
 *
 * Tests:
 * - PAGE-002: Right-click on page tab opens context menu with all 5 items
 * - PAGE-004: Duplicate creates a new page with same contents
 * - PAGE-004b: Duplicate handles edge case of empty page
 * - PAGE-005: Move Left disabled at index 0; Move Right disabled at last
 * - PAGE-005b: moveActivePage reorders pages through the engine
 *
 * Reference: docs/drawio-user-interaction-workflows.md (PAGE-002, PAGE-004, PAGE-005)
 * ADR-0080 (not applicable; this is page tab menu per IP-D scope)
 */
import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const TWO_SHAPES_PATH = fixturePath('two-shapes.drawio');

test.describe('Suite IP-D: Page Tab Menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('PAGE-002: Right-click on page tab opens context menu with all 5 items', async ({ page }) => {
    // Load a file so we have a single page with content
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Add a second page so Delete is enabled (it requires 2+ pages)
    await page.locator('[data-testid="page-tab-add"]').click();
    await page.waitForTimeout(200);

    // Right-click on the first tab
    const firstTab = page.locator('[data-testid="page-tab-0"]');
    await firstTab.click({ button: 'right' });
    await page.waitForTimeout(200);

    // Verify the context menu has the expected items
    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible({ timeout: 2000 });
    await expect(contextMenu.locator('text=Rename')).toBeVisible();
    await expect(contextMenu.locator('text=Duplicate')).toBeVisible();
    await expect(contextMenu.locator('text=Move Left')).toBeVisible();
    await expect(contextMenu.locator('text=Move Right')).toBeVisible();
    await expect(contextMenu.locator('text=Delete')).toBeVisible();
  });

  test('PAGE-004: duplicateActivePage duplicates the loaded page and activates the copy', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const result = await page.evaluate(() => {
      const editor = (window as any).__hodeiDebug?.getEditor?.();
      if (!editor) return null;
      const ok = editor.duplicateActivePage?.();
      const scene = editor.getSceneCache?.()?.value ?? [];
      return {
        ok,
        activePageIdx: editor.activePageIdx,
        pages: scene.map((p: any) => ({
          name: p.name,
          elements: Array.isArray(p.display_list) ? p.display_list.length : -1,
        })),
      };
    });
    expect(result?.ok).toBe(true);
    expect(result?.pages).toHaveLength(2);
    expect(result?.pages?.[1]?.name).toContain('(copy)');
    expect(result?.pages?.[1]?.elements).toBe(result?.pages?.[0]?.elements);
    expect(result?.activePageIdx).toBe(1);
  });

  test('PAGE-004b: Duplicate handles empty page (creates new empty page)', async ({ page }) => {
    // Bootstrap (no file loaded) — first page is empty
    await page.evaluate(() => {
      const editor = (window as any).__hodeiDebug?.getEditor?.();
      editor?.duplicateActivePage?.();
    });
    await page.waitForTimeout(300);

    const tabCount = await page
      .locator('[data-testid^="page-tab-"]:not([data-testid="page-tab-add"])')
      .count();
    expect(tabCount).toBe(2);
  });

  test('PAGE-005: Move Left disabled at index 0; Move Right disabled at last', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
    await page.locator('[data-testid="page-tab-add"]').click();
    await page.waitForTimeout(200);

    const firstTab = page.locator('[data-testid="page-tab-0"]');
    await firstTab.click({ button: 'right' });
    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible();
    await expect(contextMenu.locator('button:has-text("Move Left")')).toBeDisabled();

    await page.locator('[data-testid="viewer"]').click({ position: { x: 4, y: 4 } });
    await expect(contextMenu).toBeHidden();

    const lastTab = page.locator('[data-testid="page-tab-1"]');
    await lastTab.click({ button: 'right' });
    await expect(contextMenu.locator('button:has-text("Move Right")')).toBeDisabled();
  });

  test('PAGE-005b: moveActivePage reorders pages through the engine', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', TWO_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
    await page.locator('[data-testid="page-tab-add"]').click();
    await page.locator('[data-testid="page-tab-add"]').click();
    await page.waitForTimeout(200);

    await page.locator('[data-testid="page-tab-0"] .page-tab-name').click();

    const result = await page.evaluate(() => {
      const editor = (window as any).__hodeiDebug?.getEditor?.();
      if (!editor) return null;
      const before = (editor.getSceneCache?.()?.value ?? []).map((p: any) => p.name);
      const ok = editor.moveActivePage?.('right');
      const after = (editor.getSceneCache?.()?.value ?? []).map((p: any) => p.name);
      return { ok, before, after, activePageIdx: editor.activePageIdx };
    });
    expect(result?.ok).toBe(true);
    expect(result?.before).toHaveLength(3);
    expect(result?.after?.[1]).toBe(result?.before?.[0]);
    expect(result?.activePageIdx).toBe(1);
  });
});
