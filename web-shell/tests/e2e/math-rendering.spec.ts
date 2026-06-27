/**
 * math-rendering.spec.ts — E2E tests for math typesetting UI.
 *
 * Spec scenarios covered:
 * - MATH-030: KaTeX overlay replaces math text + snapshot of rendered HTML
 * - MATH-031: No KaTeX fetch when math disabled
 * - MATH-032: Insert math formula via menu
 * - MATH-033: Edit math formula via double-click
 * - MATH-034: Fallback on malformed LaTeX + snapshot of fallback HTML
 *
 * Requires the dev server running on http://localhost:4100.
 * Run with: `npx playwright test web-shell/tests/e2e/math-rendering.spec.ts`
 *
 * If Playwright browsers are not installed, run `npx playwright install chromium` first.
 *
 * Snapshot baselines live in `web-shell/tests/e2e/math-rendering.spec.ts-snapshots/`.
 * They ARE committed to the repo so CI can detect regressions.
 *
 * To regenerate baselines when intentionally changing output (e.g. upgrading katex):
 *   npx playwright test web-shell/tests/e2e/math-rendering.spec.ts --update-snapshots
 * Then review the diff and commit the new snapshots.
 *
 * KaTeX renders deterministically for a given input expression (counter-based IDs
 * reset per page load), so snapshots are stable across runs. The `normalizeOverlayHtml`
 * helper strips `MathML-UniqueKey-N` counters that differ per render call.
 *
 * Tests that need math-enabled pages (math_030, math_033) load the
 * `math-enabled.drawio` fixture via the file picker. Tests that insert math
 * (math_032, math_034) work from the empty bootstrap canvas and toggle Math Mode.
 */

import { expect, test } from '@playwright/test';

const MATH_FIXTURE_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/math-enabled.drawio';

/**
 * Normalize KaTeX overlay HTML for snapshot comparison.
 *
 * KaTeX emits stable output for a given input, but two sources of non-determinism
 * need stripping before snapshotting:
 *
 * 1. `MathML-UniqueKey-N` — counter that increments per render call; stable within
 *    a page load but not guaranteed across reloads.
 * 2. Whitespace between tags — Vite dev vs build can differ slightly; collapse
 *    to a single normal form.
 *
 * Keep this minimal. Over-sanitizing defeats the purpose of snapshot tests
 * (catching real regressions in rendered markup).
 */
function normalizeOverlayHtml(html: string): string {
  return html
    .replace(/MathML-UniqueKey-\d+/g, 'MathML-UniqueKey-X')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

test.describe('math rendering (MATH-030..034)', () => {
  test('math_030_katex_overlay_replaces_math_text', async ({ page }) => {
    // Navigate to editor with a math-enabled .drawio loaded via the file picker.
    // The fixture has math="1" on mxGraphModel so the page-level math_enabled flag
    // is set on load and the overlay activates automatically.
    await page.goto('/');
    await page.waitForSelector('svg', { timeout: 10_000 });
    await page.setInputFiles('[data-testid="file-input"]', MATH_FIXTURE_PATH);
    // Wait for the SVG to re-render after fixture import
    await page.waitForSelector('text[data-math-id]', { timeout: 10_000 });

    // The math_enabled flag is set on the fixture; overlay should activate.
    // Wait for the overlay div to appear (it's async — KaTeX loads on demand).
    const overlay = page.locator('.math-overlay').first();
    await expect(overlay).toBeVisible({ timeout: 15_000 });

    // The original <text> with data-math-id should be visibility:hidden
    const text = page.locator('text[data-math-id]').first();
    await expect(text).toHaveCSS('visibility', 'hidden');

    // The overlay should contain KaTeX-rendered content (not just raw LaTeX)
    const html = await overlay.innerHTML();
    expect(html).toContain('katex');

    // Snapshot: lock the rendered KaTeX markup to catch regressions when KaTeX
    // or the overlay runner changes. Baseline must be generated with
    // `--update-snapshots` on first run (see file header).
    expect(normalizeOverlayHtml(html)).toMatchSnapshot('math-030-katex-overlay.txt');
  });

  test('math_031_no_katex_fetch_when_math_disabled', async ({ page }) => {
    const katexRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('katex')) katexRequests.push(url);
    });

    await page.goto('/');
    await page.waitForSelector('svg', { timeout: 10_000 });
    await page.waitForTimeout(2_000); // give lazy-load time to (not) fire

    // No KaTeX bundle should have been fetched
    expect(katexRequests).toHaveLength(0);
  });

  test('math_032_insert_math_formula', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg', { timeout: 10_000 });

    // Toggle Math Mode on
    await page.click('#menu-item-math-mode');

    // Open Insert > Math Formula dialog
    await page.click('#menu-item-insert-math');
    const input = page.locator('[data-testid="math-latex-input"]');
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill('\\sum_{i=0}^n i^2');
    await page.click('[data-testid="math-insert-dialog-insert"]');

    // A new math vertex should be present with data-math-id
    await expect(page.locator('text[data-math-id]')).toHaveCount(1, { timeout: 5_000 });
  });

  test('math_033_edit_math_formula_via_double_click', async ({ page }) => {
    // Load math-enabled fixture so the page has math vertices to edit.
    await page.goto('/');
    await page.waitForSelector('svg', { timeout: 10_000 });
    await page.setInputFiles('[data-testid="file-input"]', MATH_FIXTURE_PATH);
    await page.waitForSelector('text[data-math-id]', { timeout: 10_000 });

    const mathText = page.locator('text[data-math-id]').first();
    await mathText.dblclick({ force: true });

    const input = page.locator('[data-testid="math-latex-input"]');
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill('\\sum_{i=0}^n i');
    await page.click('[data-testid="math-edit-dialog-save"]');

    // data-latex should reflect the new source
    await expect(page.locator('text[data-math-id]').first()).toHaveAttribute(
      'data-latex',
      '\\sum_{i=0}^n i',
    );
  });

  test('math_034_fallback_on_malformed_latex', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg', { timeout: 10_000 });

    // Toggle Math Mode on
    await page.click('#menu-item-math-mode');

    // Insert malformed LaTeX
    await page.click('#menu-item-insert-math');
    const input = page.locator('[data-testid="math-latex-input"]');
    await input.fill('\\not_a_real_command{');
    await page.click('[data-testid="math-insert-dialog-insert"]');

    // Wait for the overlay to appear
    const overlay = page.locator('.math-overlay').first();
    await expect(overlay).toBeVisible({ timeout: 15_000 });

    // Overlay should contain raw LaTeX as monospace (fallback)
    const text = await overlay.textContent();
    expect(text).toContain('\\not_a_real_command{');

    // Snapshot: lock the fallback rendering path (raw LaTeX, not KaTeX-processed)
    // to catch regressions in error handling. Baseline must be generated with
    // `--update-snapshots` on first run (see file header).
    const fallbackHtml = await overlay.innerHTML();
    expect(normalizeOverlayHtml(fallbackHtml)).toMatchSnapshot('math-034-fallback.txt');

    // No uncaught exception should have reached console
    // (This is verified indirectly — if the page crashed, the overlay wouldn't render)
  });
});