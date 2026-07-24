/**
 * viewport-helpers.ts — viewBox-based viewport assertion helpers.
 *
 * After the viewBox-native migration (infinite-canvas), zoom/pan state is
 * stored in the SVG `viewBox` attribute instead of CSS `transform` on the
 * canvas container.
 *
 * viewBox format: "panX panY viewW viewH"
 *   - panX, panY: document-space origin of the viewBox
 *   - viewW = containerWidth / zoom, viewH = containerHeight / zoom
 *
 * Usage:
 *   import { getViewBox, parseViewBoxZoom, hasZoomChanged } from './helpers/viewport-helpers.js';
 *
 *   // Check that zoom changed
 *   const before = await getViewBox(page);
 *   await canvas.hover().mouse.wheel(0, -10);
 *   const after = await getViewBox(page);
 *   expect(hasZoomChanged(before, after)).toBe(true);
 */

import { type Page } from '@playwright/test';

/**
 * Get the current SVG viewBox as a string.
 * Selector: [data-testid="viewer"] svg
 */
export async function getViewBox(page: Page): Promise<string | null> {
  return await page.locator('[data-testid="viewer"] svg').getAttribute('viewBox');
}

/**
 * Parse a viewBox string into its components.
 * Format: "panX panY viewW viewH"
 */
export function parseViewBox(vb: string | null): { panX: number; panY: number; viewW: number; viewH: number } | null {
  if (!vb) return null;
  const tokens = vb.trim().split(/[\s,]+/);
  if (tokens.length !== 4) return null;
  const panX = parseFloat(tokens[0]!);
  const panY = parseFloat(tokens[1]!);
  const viewW = parseFloat(tokens[2]!);
  const viewH = parseFloat(tokens[3]!);
  if (Number.isNaN(panX) || Number.isNaN(panY) || Number.isNaN(viewW) || Number.isNaN(viewH)) return null;
  return { panX, panY, viewW, viewH };
}

/**
 * Compute zoom level from viewBox and viewer dimensions.
 * zoom = viewerWidth / viewW (or viewerHeight / viewH)
 */
export async function getZoomLevel(page: Page): Promise<number | null> {
  const vb = await getViewBox(page);
  const parsed = parseViewBox(vb);
  if (!parsed) return null;

  // Get the viewer element for its rendered dimensions
  const viewerBox = await page.locator('[data-testid="viewer"]').boundingBox();
  if (!viewerBox || viewerBox.width === 0) return null;

  return viewerBox.width / parsed.viewW;
}

/**
 * Check if zoom has changed between two viewBox strings.
 */
export function hasZoomChanged(vbBefore: string | null, vbAfter: string | null): boolean {
  const before = parseViewBox(vbBefore);
  const after = parseViewBox(vbAfter);
  if (!before || !after) return vbBefore !== vbAfter;
  return before.viewW !== after.viewW || before.viewH !== after.viewH;
}

/**
 * Check if pan has changed between two viewBox strings.
 */
export function hasPanChanged(vbBefore: string | null, vbAfter: string | null): boolean {
  const before = parseViewBox(vbBefore);
  const after = parseViewBox(vbAfter);
  if (!before || !after) return vbBefore !== vbAfter;
  return before.panX !== after.panX || before.panY !== after.panY;
}

/**
 * Check if viewBox has changed at all.
 */
export function hasViewBoxChanged(vbBefore: string | null, vbAfter: string | null): boolean {
  return vbBefore !== vbAfter;
}

/**
 * Assert that zoom percentage matches expected value.
 * Works with HUD zoom display which shows values like "100%", "150%", etc.
 */
export async function expectZoomPercent(page: Page, expectedPercent: number, tolerance = 5): Promise<void> {
  const zoom = await getZoomLevel(page);
  if (zoom === null) throw new Error('Could not determine zoom level from viewBox');
  const actualPercent = Math.round(zoom * 100);
  const diff = Math.abs(actualPercent - expectedPercent);
  expect(diff).toBeLessThanOrEqual(tolerance);
}
