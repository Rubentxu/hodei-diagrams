/**
 * edge-curved.spec.ts — E2E tests for curved edge rendering (v0.48).
 *
 * Verifies that when an edge has edgeStyle=curvedEdgeStyle in its
 * .drawio source, the engine renders it as an SVG <path> with
 * cubic Bezier commands (C), not as a straight <line>.
 *
 * Why fixture-driven: the inspector pane doesn't expose edge-style
 * controls, and the curved-style is meaningful only for multi-point
 * paths (orthogonal routing handles 2-point edges). Fixtures with
 * 3 explicit waypoints exercise the Catmull-Rom path in the engine.
 *
 * Each test captures a screenshot for visual evidence (ADR-0075).
 * Screenshots: web-shell/tests/e2e/edge-curved.spec.ts-snapshots/
 *
 * Spec scenarios: CURVED-001..CURVED-002.
 *
 * Run: `npx playwright test tests/e2e/edge-curved.spec.ts`
 */

import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';

const EDGE_CURVED_PATH = fixturePath('edge-curved-with-bends.drawio');
const EDGE_STRAIGHT_PATH = fixturePath('edge-straight-with-bends.drawio');

test.describe('Suite CURVED: curved edge rendering (ADR-0075)', () => {
  test('CURVED-001: edgeStyle=curvedEdgeStyle emits path with C (cubic Bezier) commands', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('[data-testid="file-input"]', EDGE_CURVED_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Curved edges are rendered as <path> (multi-point with curve),
    // not <line>. Look for a path that starts with M and contains C.
    const curvedPath = page.locator('svg path[data-edge-id]').first();
    await expect(curvedPath).toHaveCount(1);
    const d = await curvedPath.getAttribute('d');
    expect(d).toBeTruthy();
    expect(d).toMatch(/^M /); // starts with Move
    expect(d).toContain(' C '); // contains cubic Bezier commands (Catmull-Rom output)

    await page
      .locator('[data-testid="viewer"] svg')
      .screenshot({ path: 'tests/e2e/edge-curved.spec.ts-snapshots/CURVED-001-curved-bezier.png' });
  });

  test('CURVED-002: edgeStyle=orthogonalEdgeStyle emits path with L (line) commands only', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('[data-testid="file-input"]', EDGE_STRAIGHT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Orthogonal edges with 3+ points render as <path> with L commands.
    const straightPath = page.locator('svg path[data-edge-id]').first();
    await expect(straightPath).toHaveCount(1);
    const d = await straightPath.getAttribute('d');
    expect(d).toBeTruthy();
    expect(d).toMatch(/^M /);
    expect(d).toContain(' L '); // line commands only
    expect(d).not.toContain(' C '); // no cubic Beziers

    await page
      .locator('[data-testid="viewer"] svg')
      .screenshot({ path: 'tests/e2e/edge-curved.spec.ts-snapshots/CURVED-002-orthogonal-lines.png' });
  });
});
