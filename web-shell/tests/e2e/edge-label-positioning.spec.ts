/**
 * edge-label-positioning.spec.ts — E2E coverage for edge label rendering
 * (v0.53: draggable label along edge).
 *
 * Verifies that when an edge has a label (via .drawio `value` attribute
 * on the mxCell), the engine:
 * - emits a `<text data-edge-label="...">` element on the SVG <line>
 * - positions the text anchor at the edge midpoint (default) — y is
 *   the average of source.y and target.y
 * - the text content matches the label source verbatim
 *
 * Scope of this commit: only the rendering of pre-stored edge labels
 * is verified. The drag-to-reposition UI is NOT covered here because
 * the inspector pane doesn't expose label-offset controls (the engine
 * supports `SetEdgeLabelOffset` command but the TS editor has no
 * dispatcher for it). That's a separate scope.
 *
 * Screenshots committed under web-shell/tests/e2e/edge-label-positioning.spec.ts-snapshots/
 * — gitignored per ADR-0075 (PNG evidence is local-only).
 *
 * Spec scenarios: LABEL-001, LABEL-002.
 *
 * Run: `npx playwright test tests/e2e/edge-label-positioning.spec.ts`
 */

import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';

const EDGE_LABEL_PATH = fixturePath('two-shapes-with-edge-label.drawio');

test.describe('Suite LABEL: edge label rendering (ADR-0075)', () => {
  test('LABEL-001: edge label renders as <text data-edge-label>', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('[data-testid="file-input"]', EDGE_LABEL_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // The edge line is present (SVG <line> has a degenerate bounding box,
    // so we use toBeAttached rather than toBeVisible).
    const edge = page.locator('svg > line[data-edge-id]').first();
    await expect(edge).toBeAttached();

    // The label is emitted as a separate <text data-edge-label="...">
    // element, NOT as an attribute on the line. The value of
    // data-edge-label is the edge's slotmap id (used by the editor to
    // dispatch EditEdgeLabel on click).
    const labelText = page.locator('svg text[data-edge-label]');
    await expect(labelText).toHaveCount(1);
    await expect(labelText).toHaveText('Edge Label');
  });

  test('LABEL-002: default label anchor is the edge midpoint', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('[data-testid="file-input"]', EDGE_LABEL_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Source at (60, 60) w=80 h=40 → center (100, 80)
    // Target at (240, 60) w=80 h=40 → center (280, 80)
    // Edge midpoint: ((100+280)/2, (80+80)/2) = (190, 80)
    const labelText = page.locator('svg text[data-edge-label]').first();
    const x = await labelText.getAttribute('x');
    const y = await labelText.getAttribute('y');

    // Tolerate floating-point precision (1 decimal).
    expect(parseFloat(x ?? '')).toBeCloseTo(190, 0);
    expect(parseFloat(y ?? '')).toBeCloseTo(80, 0);
  });
});
