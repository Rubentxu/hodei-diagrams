/**
 * viewport.ts — Immutable viewport state and coordinate transforms for the infinite canvas.
 *
 * Design: viewBox-native camera (no CSS transform). The SVG `viewBox` attribute encodes
 * the full transform state, making zoom/pan a pure data operation with no DOM side-
 * effects beyond setting the attribute.
 *
 * Coordinate system:
 * - Client coords: browser window pixels (PointerEvent.clientX/Y)
 * - Doc coords: diagram document units (scene geometry)
 *
 * The Viewport encodes: panX, panY (doc-space origin of the viewBox) and zoom.
 * Viewer dimensions (width, height) are stored so we can compute the viewBox.
 */

export interface Point {
  x: number;
  y: number;
}

export interface ShapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Zoom limits */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10.0;

/**
 * Canonical snap points for keyboard and menu zoom.
 * Must be sorted ascending for the nearest-point algorithm.
 */
export const ZOOM_SNAP_POINTS: readonly number[] = Object.freeze([0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0]);

/** Inclusive absolute distance threshold for snapping. */
export const ZOOM_SNAP_THRESHOLD = 0.05;

/**
 * Snap `zoom` to the nearest entry in `points` if within inclusive `threshold`.
 * Input is clamped to [MIN_ZOOM, MAX_ZOOM] first (NaN → 1.0 via clampZoom).
 * Returns the target unchanged when no point is within threshold.
 */
export function snapToZoom(
  zoom: number,
  threshold: number = ZOOM_SNAP_THRESHOLD,
  points: readonly number[] = ZOOM_SNAP_POINTS,
): number {
  const clamped = clampZoom(zoom);
  let nearest = clamped;
  let nearestDist = Infinity;
  // Use a small epsilon to handle floating-point rounding at the boundary.
  // e.g. Math.abs(1.05 - 1.0) === 0.050000000000000044 in JS.
  const eps = 1e-9;
  for (const p of points) {
    const dist = Math.abs(clamped - p);
    if (dist <= threshold + eps && dist < nearestDist + eps) {
      nearestDist = dist;
      nearest = p;
    }
  }
  return nearest;
}

/**
 * Immutable viewport state for the infinite canvas.
 *
 * All mutation returns a new Viewport instance (pure update).
 * The `applyToSvgElement` method is the only side effect — it sets the SVG viewBox
 * to encode the full camera transform.
 *
 * For the shared-viewport pattern (editor + renderer share one mutable instance),
 * the mutable methods below cast through `MutableViewport` to bypass readonly.
 */
export class Viewport {
  /** Document-space X of the viewBox origin */
  readonly panX: number;
  /** Document-space Y of the viewBox origin */
  readonly panY: number;
  /** Current zoom level (1.0 = no scale) */
  readonly zoom: number;
  /** Viewer width in client pixels */
  readonly width: number;
  /** Viewer height in client pixels */
  readonly height: number;

  constructor(panX: number, panY: number, zoom: number, width: number, height: number) {
    this.panX = panX;
    this.panY = panY;
    this.zoom = zoom;
    this.width = width;
    this.height = height;
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  /**
   * Default viewport at origin, zoom 1.0.
   * Use this for the initial empty canvas state.
   */
  static fromInitial(viewerW: number, viewerH: number): Viewport {
    return new Viewport(0, 0, 1.0, viewerW, viewerH);
  }

  /**
   * Zoom-to-fit factory: positions the viewport so `bounds` fills the viewer
   * with `padding` fraction of extra space on each side.
   *
   * @param bounds  Document-space bounding box of all content to fit
   * @param viewerW Viewer width in client pixels
   * @param viewerH Viewer height in client pixels
   * @param padding Fraction of viewer dimension to add as padding (default 0.1 = 10%)
   */
  static fromRect(
    bounds: ShapeBounds,
    viewerW: number,
    viewerH: number,
    padding = 0.1,
  ): Viewport {
    if (bounds.width <= 0 || bounds.height <= 0 || viewerW <= 0 || viewerH <= 0) {
      return new Viewport(0, 0, 1.0, viewerW, viewerH);
    }

    // Apply padding: add `padding` fraction of viewer dimension on each axis
    const paddedW = bounds.width * (1 + 2 * padding);
    const paddedH = bounds.height * (1 + 2 * padding);

    // Zoom to fit — use the smaller scale so both axes fit
    const zoom = Math.min(viewerW / paddedW, viewerH / paddedH);

    // Clamp zoom to valid range
    const clampedZoom = clampZoom(zoom);

    // Center the content horizontally and vertically within the padded bounds
    // The doc-space center of the bounds
    const boundsCenterX = bounds.x + bounds.width / 2;
    const boundsCenterY = bounds.y + bounds.height / 2;

    // In client-space (viewBox units), the viewer center is at (width/2, height/2)
    // In doc-space, that same point is: pan + (viewerDim/2) / zoom
    const panX = boundsCenterX - (viewerW / 2) / clampedZoom;
    const panY = boundsCenterY - (viewerH / 2) / clampedZoom;

    return new Viewport(panX, panY, clampedZoom, viewerW, viewerH);
  }

  // ─── Coordinate transforms ───────────────────────────────────────────────

  /**
   * Convert browser client coordinates to document-space coordinates.
   *
   * Uses the current viewBox mapping:
   *   docX = panX + (clientX - rect.left) * (width / viewerW) / zoom
   *
   * @param clientX Browser client-space X
   * @param clientY Browser client-space Y
   * @param svgRect Bounding rect of the SVG element (from getBoundingClientRect)
   */
  clientToDoc(clientX: number, clientY: number, svgRect: DOMRect): Point {
    // W1: guard against NaN inputs and zero zoom
    if (Number.isNaN(clientX) || Number.isNaN(clientY) || this.zoom === 0) {
      return { x: 0, y: 0 };
    }
    const scaleX = this.width / svgRect.width;
    const scaleY = this.height / svgRect.height;
    return {
      x: this.panX + (clientX - svgRect.left) * scaleX / this.zoom,
      y: this.panY + (clientY - svgRect.top) * scaleY / this.zoom,
    };
  }

  /**
   * Convert document-space coordinates to browser client coordinates.
   * Exact inverse of `clientToDoc`.
   *
   * @param docX Document-space X
   * @param docY Document-space Y
   * @param svgRect Bounding rect of the SVG element
   */
  docToClient(docX: number, docY: number, svgRect: DOMRect): Point {
    // W1: guard against NaN inputs and zero zoom
    if (Number.isNaN(docX) || Number.isNaN(docY) || this.zoom === 0) {
      return { x: 0, y: 0 };
    }
    const scaleX = this.width / svgRect.width;
    const scaleY = this.height / svgRect.height;
    return {
      x: svgRect.left + (docX - this.panX) * this.zoom / scaleX,
      y: svgRect.top + (docY - this.panY) * this.zoom / scaleY,
    };
  }

  // ─── Immutability-preserving mutators ────────────────────────────────────

  /**
   * Zoom centered on a cursor position (cursor point stays fixed in doc space).
   *
   * Formula: newPan = cursorDoc - (cursorClient - svgRect) * newScale
   * where cursorDoc = this.clientToDoc(cursorClient)
   *       newScale = newZoom / (width / svgRect.width)  (in doc units per client px)
   *
   * @param newZoom      Target zoom level (will be clamped)
   * @param cursorClientX Cursor browser X (optional — defaults to viewer center)
   * @param cursorClientY Cursor browser Y (optional — defaults to viewer center)
   * @param svgRect       Bounding rect of the SVG element
   */
  withZoom(
    newZoom: number,
    cursorClientX?: number,
    cursorClientY?: number,
    svgRect?: DOMRect,
  ): Viewport {
    const clamped = clampZoom(newZoom);
    const cx = cursorClientX ?? this.width / 2;
    const cy = cursorClientY ?? this.height / 2;

    // If no svgRect, compute doc point using current zoom (for pure math use)
    let cursorDoc: Point;
    if (svgRect) {
      cursorDoc = this.clientToDoc(cx, cy, svgRect);
    } else {
      // Approximate using center of viewer
      cursorDoc = {
        x: this.panX + cx / this.zoom,
        y: this.panY + cy / this.zoom,
      };
    }

    // W2: When svgRect.width ≠ viewport.width, use the correct scale factor.
    // Derivation:
    //   cursorDoc.x = panX + (cursorX - svgRect.left) * this.width / (this.zoom * svgRect.width)
    //   After zoom to newZoom:
    //     cursorDoc.x = newPanX + (cursorX - svgRect.left) * this.width / (newZoom * svgRect.width)
    //   Solving for newPanX:
    //     newPanX = cursorDoc.x - (cursorX - svgRect.left) * this.width / (newZoom * svgRect.width)
    //              = cursorDoc.x - (cursorX - svgRect.left) / newZoom * (this.width / svgRect.width)
    //   The scale factor is this.width / svgRect.width (not svgRect.width / this.width).
    const scaleX = svgRect ? this.width / svgRect.width : 1;
    const scaleY = svgRect ? this.height / svgRect.height : 1;

    // New pan such that cursorDoc is still at cursorClient after zoom
    // Note: includes svgRect.left/top offset correction (was missing in original formula)
    const newPanX = cursorDoc.x - (cx - (svgRect?.left ?? 0)) * scaleX / clamped;
    const newPanY = cursorDoc.y - (cy - (svgRect?.top ?? 0)) * scaleY / clamped;

    return new Viewport(newPanX, newPanY, clamped, this.width, this.height);
  }

  /**
   * Pan the viewport by the given document-space delta.
   * @param newPanX New panX value
   * @param newPanY New panY value
   */
  withPan(newPanX: number, newPanY: number): Viewport {
    return new Viewport(newPanX, newPanY, this.zoom, this.width, this.height);
  }

  /**
   * Update viewport dimensions (e.g., on window resize).
   * @param w New viewer width
   * @param h New viewer height
   */
  withSize(w: number, h: number): Viewport {
    return new Viewport(this.panX, this.panY, this.zoom, w, h);
  }

  // ─── Mutable updates (for shared-viewport pattern) ────────────────────────

  /**
   * Mutate pan in-place. Used when a shared mutable Viewport reference is held
   * by both the editor (for pan-drag) and the renderer (for applyToSvgElement).
   * Both parties see the same mutation immediately.
   */
  panBy(dx: number, dy: number): void {
    const m = this as unknown as MutableViewport;
    m.panX = this.panX + dx;
    m.panY = this.panY + dy;
  }

  /**
   * Set absolute pan values in-place.
   */
  setPan(panX: number, panY: number): void {
    const m = this as unknown as MutableViewport;
    m.panX = panX;
    m.panY = panY;
  }

  /**
   * Mutate zoom in-place.
   */
  setZoom(zoom: number): void {
    const m = this as unknown as MutableViewport;
    m.zoom = clampZoom(zoom);
  }

  /**
   * Mutate size in-place (e.g., on window resize).
   */
  setSize(w: number, h: number): void {
    const m = this as unknown as MutableViewport;
    m.width = w;
    m.height = h;
  }

  /**
   * Zoom around a cursor position, mutating in-place.
   * Cursor point stays fixed in document space while zoom changes.
   *
   * @param cursorClientX  Cursor browser X (optional — defaults to viewer center)
   * @param cursorClientY  Cursor browser Y (optional — defaults to viewer center)
   * @param newZoom        Target zoom level (will be clamped)
   * @param svgRect         Bounding rect of the SVG element
   */
  zoomAround(
    newZoom: number,
    cursorClientX?: number,
    cursorClientY?: number,
    svgRect?: DOMRect,
  ): void {
    const clamped = clampZoom(newZoom);
    const cx = cursorClientX ?? this.width / 2;
    const cy = cursorClientY ?? this.height / 2;

    let cursorDoc: Point;
    if (svgRect) {
      cursorDoc = this.clientToDoc(cx, cy, svgRect);
    } else {
      cursorDoc = { x: this.panX + cx / this.zoom, y: this.panY + cy / this.zoom };
    }

    // Compute new pan so cursorDoc stays fixed after zoom change.
    // When svgRect is available, use the scale-aware formula:
    //   docPoint.x = panX + (clientX - svgRect.left) * scaleX / zoom
    //   => newPanX = cursorDoc.x - (clientX - svgRect.left) * scaleX / newZoom
    // When no svgRect, both terms are in viewport space (simple division).
    let newPanX: number;
    let newPanY: number;
    if (svgRect) {
      const scaleX = this.width / svgRect.width;
      const scaleY = this.height / svgRect.height;
      newPanX = cursorDoc.x - (cx - svgRect.left) * scaleX / clamped;
      newPanY = cursorDoc.y - (cy - svgRect.top) * scaleY / clamped;
    } else {
      newPanX = cursorDoc.x - cx / clamped;
      newPanY = cursorDoc.y - cy / clamped;
    }

    const m = this as unknown as MutableViewport;
    m.zoom = clamped;
    m.panX = newPanX;
    m.panY = newPanY;
  }

  // ─── Rendering ──────────────────────────────────────────────────────────

  /**
   * Apply the current viewport state to an SVG element by setting its viewBox.
   *
   * viewBox format: "panX panY viewW viewH"
   * where viewW = width / zoom, viewH = height / zoom
   *
   * This encodes the full camera transform in the SVG viewBox attribute,
   * which the browser renders natively — no CSS transform needed.
   */
  applyToSvgElement(svg: SVGSVGElement): void {
    const viewW = this.width / this.zoom;
    const viewH = this.height / this.zoom;
    svg.setAttribute('viewBox', `${this.panX} ${this.panY} ${viewW} ${viewH}`);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────
}

/** Mutable view of Viewport fields — used by in-place mutation methods */
type MutableViewport = {
  panX: number;
  panY: number;
  zoom: number;
  width: number;
  height: number;
};

/**
 * Clamp zoom to the valid range [MIN_ZOOM, MAX_ZOOM].
 * Returns 1.0 when input is NaN.
 */
export function clampZoom(z: number): number {
  if (Number.isNaN(z)) return 1.0;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}
