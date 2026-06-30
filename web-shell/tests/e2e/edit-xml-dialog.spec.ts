/**
 * edit-xml-dialog.spec.ts — E2E coverage for Extras > Edit XML (PR #111).
 *
 * The Edit XML dialog lets the user view and modify the raw .drawio
 * XML for the current page, then re-imports the result. Tests cover
 * the happy path (open → edit → apply → verify canvas) and the
 * error path (invalid XML → apply → error banner, no crash).
 *
 * Screenshots are committed to
 *   web-shell/tests/e2e/edit-xml-dialog.spec.ts-snapshots/
 * — gitignored per ADR-0075.
 *
 * Spec scenarios: EXML-001..EXML-003.
 *
 * Run: `npx playwright test tests/e2e/edit-xml-dialog.spec.ts`
 */

import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady } from './helpers/app-ready.js';

const SIMPLE_RECT_PATH = fixturePath('simple-rect.drawio');

test.describe('Suite EXML: Edit XML dialog (PR #111, ADR-0075)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
  });

  test('EXML-001: Extras > Edit XML opens dialog with current XML', async ({ page }) => {
    // Open Extras menu
    await page.locator('summary:has-text("Extras")').first().click();
    await page.waitForTimeout(200);
    // Click Edit XML item
    await page.click('#menu-item-edit-xml');

    // Dialog should appear with the current page XML
    const dialog = page.locator('[data-testid="edit-xml-dialog"]');
    await expect(dialog).toBeVisible();

    // The textarea should contain the current .drawio source (mxfile root).
    const textarea = page.locator('[data-testid="edit-xml-textarea"]');
    const value = await textarea.inputValue();
    expect(value).toContain('<mxfile');
    expect(value).toContain('<mxCell');

    // Cancel button is visible (clicking it closes the dialog)
    await expect(page.locator('[data-testid="edit-xml-cancel"]')).toBeVisible();
    await expect(page.locator('[data-testid="edit-xml-apply"]')).toBeVisible();
  });

  test('EXML-002: editing the XML and clicking Apply re-imports the canvas', async ({ page }) => {
    // Open dialog
    await page.locator('summary:has-text("Extras")').first().click();
    await page.waitForTimeout(200);
    await page.click('#menu-item-edit-xml');
    await expect(page.locator('[data-testid="edit-xml-dialog"]')).toBeVisible();

    // Replace the entire canvas with a single new vertex at a known location.
    // The fixture has 1 vertex; the new XML should produce 2 vertices so
    // we can verify the canvas reflects the edit.
    const newXml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net">
  <diagram name="Page-1" id="page-1">
    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" pageWidth="800" pageHeight="600">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="2" vertex="1">
          <mxGeometry x="100" y="100" width="80" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="3" vertex="1">
          <mxGeometry x="300" y="100" width="80" height="40" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    await page.locator('[data-testid="edit-xml-textarea"]').fill(newXml);
    await page.click('[data-testid="edit-xml-apply"]');

    // Dialog should close on successful Apply
    await expect(page.locator('[data-testid="edit-xml-dialog"]')).not.toBeVisible();

    // Canvas should now show 2 vertices
    const vertices = page.locator('svg [data-vertex-id]');
    await expect(vertices).toHaveCount(2, { timeout: 5000 });
  });

  test('EXML-003: invalid XML shows error banner (dialog stays open)', async ({ page }) => {
    // Open dialog
    await page.locator('summary:has-text("Extras")').first().click();
    await page.waitForTimeout(200);
    await page.click('#menu-item-edit-xml');
    await expect(page.locator('[data-testid="edit-xml-dialog"]')).toBeVisible();

    // Type obviously invalid XML
    await page
      .locator('[data-testid="edit-xml-textarea"]')
      .fill('this is not valid xml at all');

    // Click Apply
    await page.click('[data-testid="edit-xml-apply"]');

    // Dialog stays open (Apply returns false → no close)
    await expect(page.locator('[data-testid="edit-xml-dialog"]')).toBeVisible();

    // Error banner becomes visible (with the import failure reason)
    const errorBanner = page.locator('[data-testid="error-banner"]:not([hidden])');
    await expect(errorBanner).toBeVisible({ timeout: 5000 });
  });
});
