import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady } from './helpers/app-ready.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');
const INVALID_PATH =
  fixturePath('invalid.drawio');

type SvgCacheSession = {
  importDrawio(xml: string): { ok: boolean; error?: string };
  executeCommand(cmdJson: string): { ok: boolean; error?: string };
  getScene(): { ok: boolean; value?: unknown[]; error?: string };
  renderPage(pageIdx: number): { ok: boolean; value?: string; error?: string };
  getPage(token: number): string | null;
};

test.describe('viewer-only web shell', () => {
  test('viewer page mounts with Open button and viewer container', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="open-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="viewer"]')).toBeVisible();
  });

  test('importing simple-rect.drawio renders an <svg>', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const svgCount = await page.locator('[data-testid="viewer"] svg').count();
    expect(svgCount).toBe(1);
  });

  test('editor edit buttons from old toolbar are not present (tools are in sidebar/inspector)', async ({ page }) => {
    await page.goto('/');

    // These were toolbar buttons from the v1 viewer that no longer exist
    // Note: "Properties" menu item exists in File menu, but no toolbar button with that text
    await expect(page.locator('.quick-controls button:has-text("Properties")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Add")')).toHaveCount(0);
  });

  test('importing invalid XML shows an error banner', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', INVALID_PATH);
    await page.waitForSelector('[data-testid="error-banner"]:not([hidden])', { timeout: 3000 });

    // Error banner is visible
    const banner = page.locator('[data-testid="error-banner"]');
    await expect(banner).toBeVisible();

    // Engine renders a fallback SVG (empty canvas) even on error
    const svgCount = await page.locator('[data-testid="viewer"] svg').count();
    expect(svgCount).toBeGreaterThanOrEqual(1);
  });

  test('error banner can be dismissed', async ({ page }) => {
    await page.goto('/');

    await page.setInputFiles('[data-testid="file-input"]', INVALID_PATH);
    await page.waitForSelector('[data-testid="error-banner"]:not([hidden])', { timeout: 3000 });
    await page.click('[data-testid="dismiss-error"]');
    await expect(page.locator('[data-testid="error-banner"][hidden]')).toBeAttached();
  });

  test('canvas area fills remaining space in the 5-zone layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 768 });
    await page.goto('/');

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // At 1280px with sidebar (240px) + inspector (280px), canvas = 760px
    const viewer = page.locator('[data-testid="viewer"]');
    const box = await viewer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(700); // approx 760
  });

  test('SVG cache invalidates after command mutation', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Access session via page.evaluate to reach browser window
    const debug = await page.evaluate(async () => {
      const hodeiDebug = (window as unknown as {
        __hodeiDebug: { getSession: () => SvgCacheSession };
      }).__hodeiDebug;

      if (!hodeiDebug) return { error: 'no hodeiDebug', ok: false, svgBefore: '', svgAfter: '' };

      const session = hodeiDebug.getSession();
      if (!session) return { error: 'no session', ok: false, svgBefore: '', svgAfter: '' };

      // Get the page token (slotmap index) from the scene
      const sceneResult = session.getScene();
      if (!sceneResult.ok) return { error: 'sceneResult failed: ' + String(sceneResult.error), ok: false, svgBefore: '', svgAfter: '' };
      const pages = sceneResult.value as { page_id: { idx: number; version: number } }[];
      const pageToken = pages[0]?.page_id.idx ?? 0;

      // Render the page to populate the SVG cache
      const renderResult = session.renderPage(pageToken);
      if (!renderResult.ok) return { error: 'renderResult failed: ' + String(renderResult.error), ok: false, svgBefore: '', svgAfter: '' };
      const svgBefore = renderResult.value ?? '';

      // Execute a command that mutates the scene (AddVertex)
      // Note: CellGeometry requires rotation, flip_h, flip_v fields
      const cmd = JSON.stringify({
        AddVertex: {
          vertex: {
            geometry: { x: 300, y: 200, width: 80, height: 40, relative: false, rotation: 0.0, flip_h: false, flip_v: false },
            label: { text: 'cache-test-vertex' },
            page_id: { idx: pageToken, version: 0 },
            parent: null,
            style_id: null,
            z_order: 0,
            locked: false,
            visible: true,
          },
        },
      });
      const cmdResult = session.executeCommand(cmd);
      if (!cmdResult.ok) return { error: 'cmdResult failed: ' + String(cmdResult.error), ok: false, svgBefore, svgAfter: '' };

      // Re-render the page — the SVG should reflect the mutation
      const renderAfterResult = session.renderPage(pageToken);
      if (!renderAfterResult.ok) return { error: 'renderAfterResult failed: ' + String(renderAfterResult.error), ok: false, svgBefore, svgAfter: '' };
      const svgAfter = renderAfterResult.value ?? '';

      return { ok: true, svgBefore, svgAfter };
    });

    expect(debug.ok).toBe(true);
    // SVG must have changed after the mutation
    expect(debug.svgAfter).not.toBe(debug.svgBefore);
  });
});
