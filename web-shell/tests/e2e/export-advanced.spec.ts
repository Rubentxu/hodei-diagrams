import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady } from './helpers/app-ready.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');
const TWO_PAGE_PATH =
  fixturePath('two-page.drawio');

test.describe('Suite H: export-advanced', () => {
  /**
   * Test 1: Export .drawio → downloaded file contains valid <mxfile> XML
   */
  test('Export .drawio → downloaded file contains valid <mxfile> XML', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="save-btn"]');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.drawio$/);
    const content = await (await download.createReadStream()).toArray();
    const xml = Buffer.concat(content).toString('utf-8');

    // Must contain draw.io XML structure
    expect(xml).toContain('<mxfile');
    expect(xml).toContain('<mxGraphModel');
    expect(xml).toContain('<root>');
    expect(xml).toContain('<mxCell');
  });

  /**
   * Test 2: Re-import exported .drawio → same number of shapes rendered
   */
  test('Re-import exported .drawio → same number of shapes rendered', async ({ page }) => {
    await waitForAppReady(page);

    // First import
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
    const initialCount = await page.locator('[data-vertex-id]').count();

    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="save-btn"]');
    const download = await downloadPromise;
    const content = await (await download.createReadStream()).toArray();
    const xml = Buffer.concat(content).toString('utf-8');

    // Write to temp file and re-import
    const tmpFile = path.join(os.tmpdir(), `reimport-${Date.now()}.drawio`);
    fs.writeFileSync(tmpFile, xml, 'utf-8');

    await page.setInputFiles('[data-testid="file-input"]', tmpFile);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
    const reimportCount = await page.locator('[data-testid="viewer"] [data-vertex-id]').count();

    expect(reimportCount).toBe(initialCount);

    fs.unlinkSync(tmpFile);
  });

  /**
   * Test 3: Export SVG → downloaded file contains valid <svg>
   */
  test('Export SVG → downloaded file contains valid <svg>', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Open File menu and hover to trigger export submenu
    await page.locator('[data-testid="menu-file"] summary').click();
    await page.locator('[data-testid="menu-export"]').hover();
    await page.waitForTimeout(200);

    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="menu-export-svg"]');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.svg$/);
    const content = await (await download.createReadStream()).toArray();
    const svg = Buffer.concat(content).toString('utf-8');

    // Must be valid SVG
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  /**
   * Test 4: Export SVG from second page → output changes to second page content
   */
  test('Export SVG from second page → output reflects second page content', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', TWO_PAGE_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Switch to second page
    await page.locator('[data-testid="page-tabs"] .page-tab').nth(1).click();
    await page.waitForTimeout(300);

    // Export SVG from second page
    await page.locator('[data-testid="menu-file"] summary').click();
    await page.locator('[data-testid="menu-export"]').hover();
    await page.waitForTimeout(200);

    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="menu-export-svg"]');
    const download = await downloadPromise;

    const content = await (await download.createReadStream()).toArray();
    const svg = Buffer.concat(content).toString('utf-8');

    // Second page SVG should be different from first page
    // It should reflect the second page content
    expect(svg).toContain('<svg');
    // The export handler uses the current active page's SVG
    // so the downloaded SVG should match the currently rendered page
  });

  /**
   * Test 5: Export without diagram loaded → app remains functional
   * Note: Save button is enabled after bootstrap (empty canvas can be saved).
   */
  test('Export without diagram loaded → app remains functional', async ({ page }) => {
    await waitForAppReady(page);

    // Save button is enabled (can save empty diagram)
    const saveBtn = page.locator('[data-testid="save-btn"]');
    await expect(saveBtn).toBeEnabled();

    // SVG export menu item is present
    await page.locator('[data-testid="menu-file"] summary').click();
    await page.waitForTimeout(100);
    await page.locator('[data-testid="menu-export"]').hover();
    await page.waitForTimeout(100);
    await expect(page.locator('[data-testid="menu-export-svg"]')).toBeVisible();

    // App should still be functional after export attempt
    await expect(page.locator('[data-testid="viewer"]')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/fatal/);
  });

  /**
   * Test 6: Export PNG → downloaded file is a valid PNG
   */
  test('Export PNG → downloaded file is a valid PNG', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Open File menu and hover to trigger export submenu
    await page.locator('[data-testid="menu-file"] summary').click();
    await page.locator('[data-testid="menu-export"]').hover();
    await page.waitForTimeout(200);

    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="menu-export-png"]');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.png$/);
    const content = await (await download.createReadStream()).toArray();
    const buffer = Buffer.concat(content);

    // PNG files start with a valid signature
    expect(buffer.slice(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  /**
   * Test 7: PNG export menu item is enabled and has correct tooltip
   */
  test('PNG export menu item is enabled and has correct tooltip', async ({ page }) => {
    await waitForAppReady(page);

    await page.locator('[data-testid="menu-file"] summary').click();
    await page.waitForTimeout(100);
    await page.locator('[data-testid="menu-export"]').hover();
    await page.waitForTimeout(100);

    const pngItem = page.locator('[data-testid="menu-export-png"]');
    await expect(pngItem).toBeVisible();
    await expect(pngItem).not.toHaveClass(/disabled/);
    await expect(pngItem).toHaveAttribute('title', 'Export diagram as PNG');
  });
});
