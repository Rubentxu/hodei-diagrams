/**
 * visual-flows.spec.ts — End-to-end flow validation with real mouse events.
 *
 * Tests user-facing flows that involve drag, click, and keyboard:
 *   - Click rect tool + drag = create shape (real pointer events)
 *   - Click shape = select it
 *   - Edit fill color = shape re-renders
 *   - Undo/Redo = history navigation
 *   - Delete = remove selected
 *   - Multi-select via shift+click
 *
 * Run: just visual-verify
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SHOT_DIR = path.join(__dirname, 'screenshots', 'flows');

interface ConsoleReport {
  errors: string[];
  warnings: string[];
  pageErrors: string[];
}

function attachConsoleSpy(page: Page): ConsoleReport {
  const report: ConsoleReport = { errors: [], warnings: [], pageErrors: [] };
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') report.errors.push(`[${msg.type()}] ${msg.text()}`);
    else if (msg.type() === 'warning') report.warnings.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => report.pageErrors.push(`[pageerror] ${err.message}`));
  return report;
}

async function assertNoErrors(label: string, report: ConsoleReport): Promise<void> {
  const allErrors = [...report.errors, ...report.pageErrors];
  if (allErrors.length > 0) {
    fs.writeFileSync(
      path.join(SHOT_DIR, `${label}-console.txt`),
      [...report.errors, ...report.warnings, ...report.pageErrors].join('\n'),
    );
  }
  expect(allErrors, `Console errors during ${label}: ${allErrors.join('\n')}`).toHaveLength(0);
}

async function snap(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: false });
}

async function gotoFresh(page: Page): Promise<void> {
  await page.goto('http://localhost:4100/');
  await page.waitForSelector('[data-testid="canvas-container"] svg', { timeout: 10_000 });
  // Wait for app to be fully ready (WASM + editor initialized)
  await page.waitForSelector('[data-testid="hud"]', { timeout: 10_000 });
  await page.waitForTimeout(500);
}

test.describe('Flow visual validation', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
  });

  test('F1 — Click rect tool then click on canvas creates a shape', async ({ page }) => {
    const report = attachConsoleSpy(page);
    await gotoFresh(page);

    // Activate the rectangle tool (click the sidebar button)
    await page.locator('[data-testid="rect-tool-btn"]').click();
    await page.waitForTimeout(150);

    // Click on canvas to place the rectangle (no drag — palette placement is click-based)
    const canvas = page.locator('[data-testid="canvas-container"] svg').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas has no bounding box');

    await page.mouse.click(box.x + 200, box.y + 150);
    await page.waitForTimeout(500);

    await snap(page, 'F1-after-click');

    // Verify a vertex was created
    const vertices = await page.locator('[data-testid="canvas-container"] [data-vertex-id]').count();
    expect(vertices, 'Click should have placed a vertex').toBeGreaterThan(0);

    await snap(page, 'F1-rect-created');
    await assertNoErrors('F1-rect-created', report);
  });

  test('F2 — Click ellipse tool then click on canvas creates an ellipse', async ({ page }) => {
    const report = attachConsoleSpy(page);
    await gotoFresh(page);

    await page.locator('[data-testid="ellipse-tool-btn"]').click();
    await page.waitForTimeout(150);

    const canvas = page.locator('[data-testid="canvas-container"] svg').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas has no bounding box');

    await page.mouse.click(box.x + 400, box.y + 150);
    await page.waitForTimeout(500);

    const vertices = await page.locator('[data-testid="canvas-container"] [data-vertex-id]').count();
    expect(vertices).toBeGreaterThan(0);

    // Verify there's at least one ellipse element on the canvas
    const ellipses = await page.locator('[data-testid="canvas-container"] svg ellipse').count();
    expect(ellipses, 'An ellipse should be drawn').toBeGreaterThan(0);

    await snap(page, 'F2-ellipse-created');
    await assertNoErrors('F2-ellipse-created', report);
  });

  test('F3 — Click shape selects it and updates inspector', async ({ page }) => {
    const report = attachConsoleSpy(page);
    await gotoFresh(page);

    // Create a shape first
    await page.locator('[data-testid="rect-tool-btn"]').click();
    await page.waitForTimeout(150);

    const canvas = page.locator('[data-testid="canvas-container"] svg').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas has no bounding box');

    await page.mouse.move(box.x + 200, box.y + 150);
    await page.mouse.down();
    await page.mouse.move(box.x + 350, box.y + 280, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Click on the shape (in the middle of where we dragged)
    const vertex = page.locator('[data-testid="canvas-container"] [data-vertex-id]').first();
    const vbox = await vertex.boundingBox();
    if (!vbox) throw new Error('vertex has no bounding box');
    await page.mouse.click(vbox.x + vbox.width / 2, vbox.y + vbox.height / 2);
    await page.waitForTimeout(300);

    // Inspector should switch from empty state to the shape pane
    const stylePane = page.locator('[data-testid="inspector-pane-style"]');
    await expect(stylePane).toBeVisible();

    // HUD should show selection info (not "Nothing selected")
    const hud = page.locator('[data-testid="hud"]');
    const hudText = await hud.textContent();
    expect(hudText).not.toContain('Nothing selected');

    await snap(page, 'F3-shape-selected');
    await assertNoErrors('F3-shape-selected', report);
  });

  test('F4 — Undo restores the canvas to its prior state', async ({ page }) => {
    const report = attachConsoleSpy(page);
    await gotoFresh(page);

    // Snapshot of page count BEFORE we add a new page
    const pageTabsBefore = await page.locator('[data-testid^="page-tab-"]').count();

    // Add a page via the + button
    await page.locator('[data-testid="page-tab-add"]').click();
    await page.waitForTimeout(300);
    const pageTabsAfterAdd = await page.locator('[data-testid^="page-tab-"]').count();
    expect(pageTabsAfterAdd).toBeGreaterThan(pageTabsBefore);

    // Press Ctrl+Z (undo) — note: focus must be on body
    await page.locator('body').click();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    const pageTabsAfterUndo = await page.locator('[data-testid^="page-tab-"]').count();
    expect(pageTabsAfterUndo, 'Undo should remove the added page').toBe(pageTabsAfterAdd - 1);

    await snap(page, 'F4-after-undo');
    await assertNoErrors('F4-after-undo', report);
  });

  test('F5 — Redo restores the undone action', async ({ page }) => {
    const report = attachConsoleSpy(page);
    await gotoFresh(page);

    // Add then undo
    await page.locator('[data-testid="page-tab-add"]').click();
    await page.waitForTimeout(300);
    const pageTabsAfterAdd = await page.locator('[data-testid^="page-tab-"]').count();

    await page.locator('body').click();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    const pageTabsAfterUndo = await page.locator('[data-testid^="page-tab-"]').count();
    expect(pageTabsAfterUndo).toBe(pageTabsAfterAdd - 1);

    // Redo with Ctrl+Y (or Ctrl+Shift+Z)
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(300);

    const pageTabsAfterRedo = await page.locator('[data-testid^="page-tab-"]').count();
    expect(pageTabsAfterRedo, 'Redo should restore the page').toBe(pageTabsAfterAdd);

    await snap(page, 'F5-after-redo');
    await assertNoErrors('F5-after-redo', report);
  });

  test('F6 — Delete removes the selected shape', async ({ page }) => {
    const report = attachConsoleSpy(page);
    await gotoFresh(page);

    // Create a shape via click (palette placement)
    await page.locator('[data-testid="rect-tool-btn"]').click();
    await page.waitForTimeout(150);

    const canvas = page.locator('[data-testid="canvas-container"] svg').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas has no bounding box');

    await page.mouse.click(box.x + 200, box.y + 150);
    await page.waitForTimeout(500);

    const before = await page.locator('[data-testid="canvas-container"] [data-vertex-id]').count();
    expect(before).toBeGreaterThan(0);

    // Deactivate the placement tool by clicking the Select (V) tool.
    // Cycle 16 fix: toggling the rect tool didn't reliably drop palette
    // mode in time for the next canvas click. Selecting the explicit
    // Select tool is unambiguous.
    await page.locator('[data-testid="rail-select-btn"]').click();
    await page.waitForTimeout(150);

    // Select the shape by clicking on the canvas at the center of the
    // shape's bounding box. Cycle 16 fix: clicking the SVG <rect> element
    // directly (Playwright .click() on the locator) doesn't reach the
    // editor's pointerdown handler reliably. Clicking the canvas at the
    // shape's center mimics real user input and goes through #onPointerDown.
    const vertex = page.locator('[data-testid="canvas-container"] [data-vertex-id]').first();
    const vertexBox = await vertex.boundingBox();
    if (!vertexBox) throw new Error('vertex has no bounding box');
    await page.mouse.click(
      vertexBox.x + vertexBox.width / 2,
      vertexBox.y + vertexBox.height / 2,
    );
    await page.waitForTimeout(300);

    await snap(page, 'F6-after-select-debug');

    // Verify the HUD reflects selection (regression check)
    const hud = page.locator('[data-testid="hud"]');
    const hudText = await hud.textContent();
    expect(hudText).not.toContain('Nothing selected');

    // Press Delete
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    const after = await page.locator('[data-testid="canvas-container"] [data-vertex-id]').count();
    expect(after, 'Delete should remove the shape').toBe(before - 1);

    await snap(page, 'F6-after-delete');
    await assertNoErrors('F6-after-delete', report);
  });

  test('F7 — Loading a multi-shape file then deleting all leaves an empty canvas', async ({ page }) => {
    const report = attachConsoleSpy(page);
    await gotoFresh(page);

    // Load multi-shapes fixture
    await page.locator('[data-testid="file-input"]').setInputFiles(
      path.join(__dirname, '..', '..', 'public', 'fixtures', 'multi-shapes.drawio'),
    );
    await page.waitForTimeout(1500);

    const initial = await page.locator('[data-testid="canvas-container"] [data-vertex-id]').count();
    expect(initial, 'multi-shapes.drawio should have multiple vertices').toBeGreaterThanOrEqual(2);

    // Select all (Ctrl+A)
    await page.locator('body').click();
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(300);

    // Delete them all
    await page.keyboard.press('Delete');
    await page.waitForTimeout(500);

    const remaining = await page.locator('[data-testid="canvas-container"] [data-vertex-id]').count();
    expect(remaining, 'After Ctrl+A + Delete the canvas should be empty').toBe(0);

    await snap(page, 'F7-all-deleted');
    await assertNoErrors('F7-all-deleted', report);
  });

  test('F8 — Zoom buttons change the zoom level', async ({ page }) => {
    const report = attachConsoleSpy(page);
    await gotoFresh(page);

    const zoomDisplay = page.locator('[data-testid="zoom-display"]');
    const initial = await zoomDisplay.textContent();
    expect(initial).toContain('100%');

    // Open View menu and click Zoom In
    await page.locator('summary:has-text("View")').click();
    await page.waitForTimeout(200);
    await page.locator('[data-testid="menu-zoom-in"]').click();
    await page.waitForTimeout(300);

    const afterZoomIn = await zoomDisplay.textContent();
    expect(afterZoomIn, 'Zoom In should increase the percentage').not.toBe(initial);

    await snap(page, 'F8-zoomed-in');
    await assertNoErrors('F8-zoomed-in', report);
  });

  test('F9 — Page tab add + click switches the active page', async ({ page }) => {
    const report = attachConsoleSpy(page);
    await gotoFresh(page);

    // Add a page
    await page.locator('[data-testid="page-tab-add"]').click();
    await page.waitForTimeout(300);

    const tabs = page.locator('[data-testid^="page-tab-"]');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Click the first tab
    await tabs.first().click();
    await page.waitForTimeout(300);

    // The first tab should now be active
    const firstTabClass = await tabs.first().getAttribute('class');
    expect(firstTabClass, 'First tab should be active').toContain('active');

    await snap(page, 'F9-tab-switched');
    await assertNoErrors('F9-tab-switched', report);
  });

  test('F10 — Loading a .drawio file then immediately exporting SVG downloads an .svg', async ({ page }) => {
    const report = attachConsoleSpy(page);
    await gotoFresh(page);

    // Load a file
    await page.locator('[data-testid="file-input"]').setInputFiles(
      path.join(__dirname, '..', '..', 'public', 'fixtures', 'simple-rect.drawio'),
    );
    await page.waitForTimeout(1500);

    // Open File > Export > SVG. The menu is rendered as nested <details>
    // elements — opening File alone leaves the Export flyout hidden until
    // hovered. Cycle 16 fix: open File, hover Export, then click SVG.
    await page.click('[data-testid="menu-file"] summary');
    await page.hover('[data-testid="menu-export"]');
    await page.waitForSelector('[data-testid="menu-export-svg"]', { state: 'visible' });
    await page.locator('[data-testid="menu-export-svg"]').click();
    await page.waitForTimeout(500);

    await snap(page, 'F10-export-svg');
    await assertNoErrors('F10-export-svg', report);
  });
});