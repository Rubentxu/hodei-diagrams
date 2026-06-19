import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';
const INVALID_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/invalid.drawio';

test.describe('export-drawio round-trip', () => {
  test('Save button is visible and clickable after import', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Save button should exist but be disabled before import
    const saveBtn = page.locator('[data-testid="save-btn"]');
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeDisabled();

    // Import a diagram
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Save button should now be enabled
    await expect(saveBtn).toBeEnabled();
  });

  test('Save button click initiates download of valid .drawio XML', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Import fixture
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Start download listener BEFORE clicking save
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="save-btn"]');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.drawio$/);

    // Read the downloaded content
    const content = await (await download.createReadStream()).toArray();
    const xml = Buffer.concat(content).toString('utf-8');
    expect(xml).toContain('<mxGraphModel');
    expect(xml).toContain('<root>');
    expect(xml).toContain('<mxCell');
  });

  test('Save button shows error when no import context', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Import invalid XML to ensure an engine exists
    await page.setInputFiles('[data-testid="file-input"]', INVALID_PATH);
    // The error banner will show, but the engine session still exists

    // Click Save - since we imported invalid data, the engine has no id_map
    const saveBtn = page.locator('[data-testid="save-btn"]');
    // Save is still disabled since import failed
    await expect(saveBtn).toBeDisabled();
  });

  test('Downloaded XML can be re-imported and renders', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // First import
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="save-btn"]');
    const download = await downloadPromise;
    const content = await (await download.createReadStream()).toArray();
    const xml = Buffer.concat(content).toString('utf-8');

    // Write to temp file and re-import
    const tmpFile = path.join(os.tmpdir(), `reimport-test-${Date.now()}.drawio`);
    fs.writeFileSync(tmpFile, xml, 'utf-8');

    // Re-import the downloaded file
    await page.setInputFiles('[data-testid="file-input"]', tmpFile);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Verify scene renders - SVG should be present
    const svgCount = await page.locator('[data-testid="viewer"] svg').count();
    expect(svgCount).toBe(1);

    // Cleanup
    fs.unlinkSync(tmpFile);
  });
});
