/**
 * scene-bounds.ts — Typed read API over the duck-typed display list.
 *
 * All three scene-walk helpers in the codebase (editor, resize, port) duplicated
 * the same duck-typed iteration pattern with divergent SHAPE_KEYS lists.
 * This module consolidates the walk in one place with one canonical SHAPE_KEYS list
 * (including 'Group' — which the overlays previously omitted, a latent bug).
 *
 * Duck-typing of `elem as Record<string, unknown>` is hidden inside this module.
 * Callers receive typed results — no more `as` casts at call sites.
 */

import type { SlotmapId, ScenePage } from './types.js';

/** Bounds-only view — what overlays need for handle placement. */
export interface ShapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Full engine geometry — mirrors the Rust `CellGeometry` struct.
 * Used when caller needs to preserve rotation/flip across a geometry change.
 */
export interface CellGeometry extends ShapeBounds {
  rotation: number;
  flip_h: boolean;
  flip_v: boolean;
  relative: boolean;
}

/**
 * Canonical shape-key list. Matches the display-element variants the engine emits.
 * Source of truth — overlays must NOT keep their own copies.
 */
export const SHAPE_KEYS = [
  'Rect',
  'RoundedRect',
  'Ellipse',
  'Diamond',
  'Triangle',
  'Hexagon',
  'Cylinder',
  'Cloud',
  'Parallelogram',
  'Trapezoid',
  'Polygon',
  'Group',
] as const;

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Returns the variant record for a shape id, or null if not found. */
function findVariant(scene: ScenePage[], id: SlotmapId): Record<string, unknown> | null {
  for (const page of scene) {
    for (const elem of page.display_list) {
      if (!elem) continue;
      const e = elem as Record<string, unknown>;
      for (const key of SHAPE_KEYS) {
        const variant = e[key];
        if (!variant || typeof variant !== 'object') continue;
        const v = variant as Record<string, unknown>;
        const idField = v['id'];
        if (!idField || typeof idField !== 'object') continue;
        const idObj = idField as { idx?: unknown; version?: unknown };
        if (typeof idObj.idx !== 'number' || typeof idObj.version !== 'number') continue;
        if (idObj.idx === id.idx && idObj.version === id.version) {
          return v;
        }
      }
    }
  }
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the bounds (x, y, width, height) for a shape, or null if not found.
 * Works for all engine shape variants including 'Group'.
 */
export function sceneBounds(scene: ScenePage[], id: SlotmapId): ShapeBounds | null {
  const variant = findVariant(scene, id);
  if (!variant) return null;

  const bounds = variant['bounds'] as
    | { origin?: Record<string, unknown>; size?: Record<string, unknown> }
    | undefined;
  if (!bounds?.origin || !bounds?.size) return null;

  return {
    x: (bounds.origin['x'] as number) ?? 0,
    y: (bounds.origin['y'] as number) ?? 0,
    width: (bounds.size['width'] as number) ?? 0,
    height: (bounds.size['height'] as number) ?? 0,
  };
}

/**
 * Returns the full geometry (bounds + rotation + flip flags + relative) for a shape,
 * or null if not found. Used by Editor.setVertexGeometry to preserve rotation/flip
 * across resize without re-walking the scene.
 */
export function sceneGeometry(scene: ScenePage[], id: SlotmapId): CellGeometry | null {
  const variant = findVariant(scene, id);
  if (!variant) return null;

  const bounds = variant['bounds'] as
    | { origin?: Record<string, unknown>; size?: Record<string, unknown> }
    | undefined;
  if (!bounds?.origin || !bounds?.size) return null;

  return {
    x: (bounds.origin['x'] as number) ?? 0,
    y: (bounds.origin['y'] as number) ?? 0,
    width: (bounds.size['width'] as number) ?? 0,
    height: (bounds.size['height'] as number) ?? 0,
    rotation: (variant['rotation'] as number) ?? 0,
    flip_h: (variant['flip_h'] as boolean) ?? false,
    flip_v: (variant['flip_v'] as boolean) ?? false,
    relative: false,
  };
}

/**
 * Get the current zoom level from an SVG layer's CSS transform.
 * Handles both `scale(x)` and `scale(x, y)` formats.
 */
export function getZoom(svgLayer: HTMLElement): number {
  const style = svgLayer.style.transform;
  const match = style.match(/scale\(([^)]+)\)/);
  if (match) {
    return parseFloat(match[1]!) || 1;
  }
  return 1;
}
