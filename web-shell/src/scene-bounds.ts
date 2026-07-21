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

/**
 * Canonical edge-key list. Matches the display-element variants the engine emits for edges.
 */
export const EDGE_KEYS = ['Line', 'Path'] as const;

// ─── Shape lookup helpers ────────────────────────────────────────────────────

/** Returns the variant record for a shape id, or null if not found. */
export function findShapeVariant(scene: ScenePage[], id: SlotmapId): Record<string, unknown> | null {
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

/**
 * Returns the variant record for an edge id, or null if not found.
 * Mirrors findShapeVariant but iterates EDGE_KEYS instead of SHAPE_KEYS.
 * Callers extract `source`/`target` from the returned variant:
 *   const v = findEdgeVariant(scene, edgeId);
 *   const s = v?.['source'] as { Vertex?: { idx?: number; version?: number } };
 */
export function findEdgeVariant(scene: ScenePage[], edgeId: SlotmapId): Record<string, unknown> | null {
  for (const page of scene) {
    for (const elem of page.display_list) {
      if (!elem) continue;
      const e = elem as Record<string, unknown>;
      for (const key of EDGE_KEYS) {
        const variant = e[key];
        if (!variant || typeof variant !== 'object') continue;
        const v = variant as Record<string, unknown>;
        const idField = v['id'];
        if (!idField || typeof idField !== 'object') continue;
        const idObj = idField as { idx?: unknown; version?: unknown };
        if (typeof idObj.idx !== 'number' || typeof idObj.version !== 'number') continue;
        if (idObj.idx === edgeId.idx && idObj.version === edgeId.version) {
          return v;
        }
      }
    }
  }
  return null;
}

/** Returns all shape SlotmapIds in z-order (top of stack first). */
export function findAllShapeIds(scene: ScenePage[]): SlotmapId[] {
  const result: SlotmapId[] = [];
  for (const page of scene) {
    for (const elem of page.display_list) {
      if (!elem) continue;
      const e = elem as Record<string, unknown>;
      for (const key of SHAPE_KEYS) {
        const variant = e[key] as Record<string, unknown> | undefined;
        if (!variant) continue;
        const idField = variant['id'] as { idx?: number; version?: number } | undefined;
        if (!idField) continue;
        result.push({ idx: idField.idx!, version: idField.version! });
      }
    }
  }
  return result;
}

/** Returns all shape bounds in z-order. */
export function findAllBounds(scene: ScenePage[]): ShapeBounds[] {
  const result: ShapeBounds[] = [];
  for (const page of scene) {
    for (const elem of page.display_list) {
      if (!elem) continue;
      const e = elem as Record<string, unknown>;
      for (const key of SHAPE_KEYS) {
        const variant = e[key] as Record<string, unknown> | undefined;
        if (!variant) continue;
        const bounds = variant['bounds'] as
          | { origin?: Record<string, unknown>; size?: Record<string, unknown> }
          | undefined;
        if (!bounds?.origin || !bounds?.size) continue;
        result.push({
          x: (bounds.origin['x'] as number) ?? 0,
          y: (bounds.origin['y'] as number) ?? 0,
          width: (bounds.size['width'] as number) ?? 0,
          height: (bounds.size['height'] as number) ?? 0,
        });
      }
    }
  }
  return result;
}

/**
 * Returns all shapes with their id and bounds, excluding the shape with excludeId.
 * Used by snapping logic.
 */
export function findAllShapesWithBounds(
  scene: ScenePage[],
  excludeId?: SlotmapId,
): Array<{ id: SlotmapId; bounds: ShapeBounds }> {
  const result: Array<{ id: SlotmapId; bounds: ShapeBounds }> = [];
  for (const page of scene) {
    for (const elem of page.display_list) {
      if (!elem) continue;
      const e = elem as Record<string, unknown>;
      for (const key of SHAPE_KEYS) {
        const variant = e[key] as Record<string, unknown> | undefined;
        if (!variant) continue;
        const idField = variant['id'] as { idx?: number; version?: number } | undefined;
        if (!idField) continue;
        const id = { idx: idField.idx!, version: idField.version! };
        if (excludeId && id.idx === excludeId.idx && id.version === excludeId.version) continue;
        const bounds = variant['bounds'] as
          | { origin?: Record<string, unknown>; size?: Record<string, unknown> }
          | undefined;
        if (!bounds?.origin || !bounds?.size) continue;
        result.push({
          id,
          bounds: {
            x: (bounds.origin['x'] as number) ?? 0,
            y: (bounds.origin['y'] as number) ?? 0,
            width: (bounds.size['width'] as number) ?? 0,
            height: (bounds.size['height'] as number) ?? 0,
          },
        });
      }
    }
  }
  return result;
}

/** Extract SlotmapId from a raw display list element. */
export function extractIdFromElem(elem: unknown): SlotmapId | null {
  const e = elem as Record<string, unknown>;
  for (const key of SHAPE_KEYS) {
    const variant = e[key] as Record<string, unknown> | undefined;
    if (!variant) continue;
    const idField = variant['id'] as { idx?: number; version?: number } | undefined;
    if (!idField) continue;
    return { idx: idField.idx!, version: idField.version! };
  }
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the bounds (x, y, width, height) for a shape, or null if not found.
 * Works for all engine shape variants including 'Group'.
 */
export function sceneBounds(scene: ScenePage[], id: SlotmapId): ShapeBounds | null {
  const variant = findShapeVariant(scene, id);
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
  const variant = findShapeVariant(scene, id);
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

/**
 * Compute normalized (0-1) anchor coordinates from shape bounds and a document-space point.
 * Projects the point onto the rectangle perimeter.
 * Returns {nx: 0.5, ny: 0.5} when the point is at the shape center (avoids NaN from
 * division by zero in the ray-projection math).
 */
export function perimeterNormalized(
  bounds: ShapeBounds,
  docX: number,
  docY: number,
): { nx: number; ny: number } {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const hw = bounds.width / 2;
  const hh = bounds.height / 2;

  const dx = docX - cx;
  const dy = docY - cy;

  // Guard: point at shape center produces NaN in the projection math — return center default.
  if (dx === 0 && dy === 0) {
    return { nx: 0.5, ny: 0.5 };
  }

  let anchorX: number;
  let anchorY: number;
  let nx: number;
  let ny: number;

  if (Math.abs(dx) * hh > Math.abs(dy) * hw) {
    if (dx > 0) {
      anchorX = bounds.x + bounds.width;
      anchorY = cy + (dy / Math.abs(dx || 1)) * hw;
      anchorY = Math.max(bounds.y, Math.min(bounds.y + bounds.height, anchorY));
      nx = 1.0;
      ny = (anchorY - bounds.y) / bounds.height;
    } else {
      anchorX = bounds.x;
      anchorY = cy - (dy / Math.abs(dx || 1)) * hw;
      anchorY = Math.max(bounds.y, Math.min(bounds.y + bounds.height, anchorY));
      nx = 0.0;
      ny = (anchorY - bounds.y) / bounds.height;
    }
  } else {
    if (dy > 0) {
      anchorY = bounds.y + bounds.height;
      anchorX = cx + (dx / Math.abs(dy || 1)) * hh;
      anchorX = Math.max(bounds.x, Math.min(bounds.x + bounds.width, anchorX));
      ny = 1.0;
      nx = (anchorX - bounds.x) / bounds.width;
    } else {
      anchorY = bounds.y;
      anchorX = cx - (dx / Math.abs(dy || 1)) * hh;
      anchorX = Math.max(bounds.x, Math.min(bounds.x + bounds.width, anchorX));
      ny = 0.0;
      nx = (anchorX - bounds.x) / bounds.width;
    }
  }

  nx = Math.max(0, Math.min(1, nx));
  ny = Math.max(0, Math.min(1, ny));

  return { nx, ny };
}

/** Anchor kind classification. */
export type AnchorKind = 'north' | 'south' | 'east' | 'west' | 'normalized';

/**
 * Classify normalized anchor coordinates as a cardinal direction or "normalized".
 * If within 5% of a cardinal axis, return that cardinal.
 */
export function classifyAnchorFromNormalized(
  nx: number,
  ny: number,
): AnchorKind {
  const threshold = 0.05;
  if (ny <= threshold) return 'north';
  if (ny >= 1 - threshold) return 'south';
  if (nx >= 1 - threshold) return 'east';
  if (nx <= threshold) return 'west';
  return 'normalized';
}

/**
 * Find a shape variant at a given document-space point (within tolerance).
 * Returns the variant record or null if not found.
 */
export function findShapeVariantAtPoint(
  scene: ScenePage[],
  x: number,
  y: number,
  tolerance = 1,
): Record<string, unknown> | null {
  for (const page of scene) {
    for (const elem of page.display_list) {
      if (!elem) continue;
      const e = elem as Record<string, unknown>;
      for (const key of SHAPE_KEYS) {
        const variant = e[key] as Record<string, unknown> | undefined;
        if (!variant) continue;
        const bounds = variant['bounds'] as
          | { origin?: Record<string, unknown>; size?: Record<string, unknown> }
          | undefined;
        if (!bounds?.origin || !bounds?.size) continue;
        const sx = (bounds.origin['x'] as number) ?? 0;
        const sy = (bounds.origin['y'] as number) ?? 0;
        if (Math.abs(sx - x) < tolerance && Math.abs(sy - y) < tolerance) {
          return variant;
        }
      }
    }
  }
  return null;
}

/**
 * Find a shape id at a given document-space point (within tolerance).
 * Returns the SlotmapId or null if not found.
 */
export function findShapeIdAtPoint(
  scene: ScenePage[],
  x: number,
  y: number,
  tolerance = 1,
): SlotmapId | null {
  const variant = findShapeVariantAtPoint(scene, x, y, tolerance);
  if (!variant) return null;
  const idField = variant['id'] as { idx?: number; version?: number } | undefined;
  if (!idField) return null;
  if (typeof idField.idx !== 'number' || typeof idField.version !== 'number') return null;
  return { idx: idField.idx, version: idField.version };
}
