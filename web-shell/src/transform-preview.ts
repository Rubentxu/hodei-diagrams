/**
 * transform-preview.ts — Generic SVG transform-preview abstraction for live drag previews.
 *
 * Problem: Move/resize/rotation drag previews were using CSS `translate(dxpx, dypx)`
 * which breaks under CSS zoom (CSS px ≠ document px). Resize/rotation previews
 * only moved handles, not the actual shape element.
 *
 * Solution: A reversible, generic abstraction that:
 * 1. Captures a selected `[data-vertex-id]` element's original transform attribute
 *    and inline style
 * 2. Applies document-space preview transforms via SVG `transform` attribute
 *    (translate, rotate, or matrix) that compose with any original transform
 * 3. Restores faithfully on pointerup, pointercancel, explicit cancel, or disposal
 *
 * No new dependencies. No renderer-output wrapper migration required.
 * Works with any SVG element that has a `data-vertex-id` attribute.
 */

import type { SlotmapId } from './types.js';

/** A captured element's original DOM state for faithful restoration. */
interface CapturedElement {
  el: SVGElement;
  /** Original SVG `transform` attribute value (may be null/empty) */
  originalTransform: string | null;
  /** Original inline `style.cssText` (full snapshot for restoration) */
  originalStyle: string;
}

/** Kind of transform preview. */
export type TransformPreviewKind = 'move' | 'resize' | 'rotation';

/** A concrete preview transform operation. */
export type TransformOperation =
  | { kind: 'translate'; tx: number; ty: number }
  | { kind: 'rotate'; angle: number; cx: number; cy: number }
  | { kind: 'matrix'; a: number; b: number; c: number; d: number; e: number; f: number };

/**
 * TransformPreview applies reversible, document-space SVG transform previews to
 * selected shape elements during move/resize/rotation drag gestures.
 *
 * Design principles:
 * - Captures original state before any preview is applied
 * - Uses SVG `transform` attribute (document-space) not CSS `style.transform` (screen-space)
 * - Composes preview transforms with the element's original transform
 * - Restores original state on cancel/pointerup/disposal
 * - Multiple captures can be held simultaneously (for multi-shape moves)
 */
export class TransformPreview {
  /** Captured elements keyed by "idx:version" string */
  readonly #captures: Map<string, CapturedElement> = new Map();

  /**
   * Capture the original DOM state of an element identified by SlotmapId.
   * Idempotent — calling twice for the same element just overwrites with same values.
   * Should be called BEFORE any preview transform is applied.
   */
  capture(el: SVGElement, id: SlotmapId): void {
    const key = `${id.idx}:${id.version}`;
    if (this.#captures.has(key)) return; // already captured

    this.#captures.set(key, {
      el,
      originalTransform: el.getAttribute('transform'),
      originalStyle: el.style.cssText,
    });
  }

  /**
   * Apply a translate preview to a previously captured element.
   * Uses SVG document-space `translate(tx, ty)` — correct at all zoom levels.
   */
  applyTranslate(id: SlotmapId, tx: number, ty: number): void {
    const key = `${id.idx}:${id.version}`;
    const capture = this.#captures.get(key);
    if (!capture) return;

    // Build the preview transform: translate(tx, ty)
    // If the element had an original transform, we prepend so it composes correctly.
    // SVG transform composition: new × original means "apply new, then original"
    // We want: translate(tx, ty) × originalTransform
    const previewTransform = `translate(${tx}, ${ty})`;
    const combined = capture.originalTransform
      ? `${previewTransform} ${capture.originalTransform}`
      : previewTransform;

    capture.el.setAttribute('transform', combined);
  }

  /**
   * Apply a rotate preview around a document-space center point.
   * Uses SVG `rotate(angle, cx, cy)` — correct at all zoom levels.
   */
  applyRotate(id: SlotmapId, angle: number, cx: number, cy: number): void {
    const key = `${id.idx}:${id.version}`;
    const capture = this.#captures.get(key);
    if (!capture) return;

    const previewTransform = `rotate(${(angle * 180) / Math.PI}, ${cx}, ${cy})`;
    const combined = capture.originalTransform
      ? `${previewTransform} ${capture.originalTransform}`
      : previewTransform;

    capture.el.setAttribute('transform', combined);
  }

  /**
   * Apply an affine matrix preview.
   * Matrix is in document-space coordinates.
   * The matrix [a b c d e f] represents: [a c e; b d f; 0 0 1] in SVG matrix form.
   */
  applyMatrix(id: SlotmapId, a: number, b: number, c: number, d: number, e: number, f: number): void {
    const key = `${id.idx}:${id.version}`;
    const capture = this.#captures.get(key);
    if (!capture) return;

    const previewTransform = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
    const combined = capture.originalTransform
      ? `${previewTransform} ${capture.originalTransform}`
      : previewTransform;

    capture.el.setAttribute('transform', combined);
  }

  /**
   * Apply a resize preview: computes an affine matrix from original bounds to current bounds,
   * then applies it as a preview transform.
   *
   * @param id - SlotmapId of the element
   * @param origX - Original X position (document space)
   * @param origY - Original Y position (document space)
   * @param origW - Original width
   * @param origH - Original height
   * @param newX - New X position (document space)
   * @param newY - New Y position (document space)
   * @param newW - New width
   * @param newH - New height
   */
  applyResize(
    id: SlotmapId,
    origX: number,
    origY: number,
    origW: number,
    origH: number,
    newX: number,
    newY: number,
    newW: number,
    newH: number,
  ): void {
    // Compute scale factors
    const scaleX = origW > 0 ? newW / origW : 1;
    const scaleY = origH > 0 ? newH / origH : 1;

    // Translate to origin, scale, translate back to new position
    // The matrix transforms points from original bbox to new bbox
    // M = T(newX, newY) × S(scaleX, scaleY) × T(-origX, -origY)
    // In SVG matrix form: matrix(a,b,c,d,e,f)
    // T(tx, ty) = [1 0 tx; 0 1 ty; 0 0 1]
    // S(sx, sy) = [sx 0 0; 0 sy 0; 0 0 1]
    // M = T × S × T(-ox, -oy)
    //   = [1 0 newX; 0 1 newY; 0 0 1] × [sx 0 0; 0 sy 0; 0 0 1] × [1 0 -ox; 0 1 -oy; 0 0 1]
    //   = [sx 0 newX - sx*ox; 0 sy newY - sy*oy; 0 0 1]

    const a = scaleX;
    const b = 0;
    const c = 0;
    const d = scaleY;
    const e = newX - scaleX * origX;
    const f = newY - scaleY * origY;

    this.applyMatrix(id, a, b, c, d, e, f);
  }

  /**
   * Remove all preview transforms from a captured element, restoring original state.
   */
  restore(id: SlotmapId): void {
    const key = `${id.idx}:${id.version}`;
    const capture = this.#captures.get(key);
    if (!capture) return;

    // Restore transform attribute
    if (capture.originalTransform !== null) {
      capture.el.setAttribute('transform', capture.originalTransform);
    } else {
      capture.el.removeAttribute('transform');
    }

    // Restore inline style (full snapshot restore)
    capture.el.style.cssText = capture.originalStyle;
  }

  /**
   * Restore ALL captured elements to their original state.
   */
  restoreAll(): void {
    for (const key of this.#captures.keys()) {
      const parts = key.split(':');
      if (parts.length !== 2) continue;
      const idxStr: string = parts[0]!;
      const versionStr: string = parts[1]!;
      this.restore({ idx: parseInt(idxStr), version: parseInt(versionStr) });
    }
  }

  /**
   * Commit: restore the element and remove from captures.
   * Call this when the preview has been accepted (pointerup above threshold).
   * The engine already has the committed geometry; we just clean up preview state.
   */
  commit(id: SlotmapId): void {
    this.restore(id);
    this.#captures.delete(`${id.idx}:${id.version}`);
  }

  /**
   * Commit ALL captured elements.
   */
  commitAll(): void {
    this.restoreAll();
    this.#captures.clear();
  }

  /**
   * Check if an element is currently captured.
   */
  isCaptured(id: SlotmapId): boolean {
    return this.#captures.has(`${id.idx}:${id.version}`);
  }

  /**
   * Dispose: restore all elements and clear all captures.
   * Idempotent. Call when the gesture ends (success or cancel).
   */
  dispose(): void {
    this.restoreAll();
    this.#captures.clear();
  }
}
