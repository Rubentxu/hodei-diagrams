/**
 * resize-handles.ts — Resize handle overlay for shape resize editing.
 *
 * Renders 8 draggable handles (4 corners + 4 edge midpoints) on a single selected shape.
 * Shift+drag constrains resize to proportional aspect ratio.
 *
 * UX: Resize = direct drag of corner/edge handle (no modal, no click-then-edit).
 */

import type { SlotmapId, ScenePage } from './types.js';

/** Shape bounds in document coordinates. */
interface ShapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Resize handle positions. */
export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** A resize handle being dragged. */
interface ResizeDragState {
  handle: HandlePosition;
  vertexId: SlotmapId;
  origGeom: ShapeBounds;
  startMouseX: number;
  startMouseY: number;
}

/** State for proportional (Shift) constraint during resize drag. */
interface ProportionalState {
  aspectRatio: number; // width / height
  dominant: 'width' | 'height';
  locked: boolean;
}

/**
 * Resize handles overlay: renders 8 draggable handles on a single selected shape.
 *
 * Handles are only visible when exactly one shape is selected.
 * Corner handles: NW, NE, SE, SW
 * Edge handles: N, E, S, W
 */
export class ResizeHandlesOverlay {
  readonly #svgLayer: HTMLElement;
  readonly #sceneProvider: () => ScenePage[];
  readonly #getVertexGeometry: (id: SlotmapId) => ShapeBounds | null;
  readonly #setVertexGeometry: (
    id: SlotmapId,
    geom: ShapeBounds,
  ) => void;
  readonly #onGeometryChanged: () => void;
  #dragState: ResizeDragState | null = null;
  #proportionalState: ProportionalState = { aspectRatio: 1, dominant: 'width', locked: false };
  #onMoveBound: (_e: PointerEvent) => void;
  #onUpBound: (_e: PointerEvent) => void;

  constructor(
    svgLayer: HTMLElement,
    sceneProvider: () => ScenePage[],
    getVertexGeometry: (id: SlotmapId) => ShapeBounds | null,
    setVertexGeometry: (id: SlotmapId, geom: ShapeBounds) => void,
    onGeometryChanged: () => void,
  ) {
    this.#svgLayer = svgLayer;
    this.#sceneProvider = sceneProvider;
    this.#getVertexGeometry = getVertexGeometry;
    this.#setVertexGeometry = setVertexGeometry;
    this.#onGeometryChanged = onGeometryChanged;
    this.#onMoveBound = (e: PointerEvent) => this.#onDragMove(e);
    this.#onUpBound = (e: PointerEvent) => this.#onDragEnd(e);
  }

  /**
   * Render resize handles for single-shape selection.
   * @param selection Set of selected SlotmapIds (only renders for single shape)
   */
  render(selection: Set<SlotmapId>): void {
    // Remove existing handles
    this.#svgLayer.querySelectorAll('.resize-handle').forEach((el) => el.remove());

    // Only render for single shape selection
    if (selection.size !== 1) return;

    const scene = this.#sceneProvider();
    if (scene.length === 0) return;

    const vertexId = Array.from(selection)[0]!;
    const bounds = this.#findShapeBounds(scene, vertexId);
    if (!bounds) return;

    // Create 8 handles: corners + edge midpoints
    const positions: { pos: HandlePosition; x: number; y: number }[] = [
      { pos: 'nw', x: bounds.x, y: bounds.y },
      { pos: 'n', x: bounds.x + bounds.width / 2, y: bounds.y },
      { pos: 'ne', x: bounds.x + bounds.width, y: bounds.y },
      { pos: 'e', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
      { pos: 'se', x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { pos: 's', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
      { pos: 'sw', x: bounds.x, y: bounds.y + bounds.height },
      { pos: 'w', x: bounds.x, y: bounds.y + bounds.height / 2 },
    ];

    for (const { pos, x, y } of positions) {
      this.#createHandle(vertexId, bounds, pos, x, y);
    }
  }

  /**
   * Create a single resize handle circle element.
   */
  #createHandle(
    vertexId: SlotmapId,
    bounds: ShapeBounds,
    pos: HandlePosition,
    x: number,
    y: number,
  ): void {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', '5');
    circle.setAttribute('class', 'resize-handle');
    circle.setAttribute('data-vertex-idx', String(vertexId.idx));
    circle.setAttribute('data-vertex-version', String(vertexId.version));
    circle.setAttribute('data-handle', pos);
    circle.setAttribute('fill', '#4a9eff');
    circle.setAttribute('stroke', '#fff');
    circle.setAttribute('stroke-width', '1.5');
    circle.style.cursor = this.#cursorForPosition(pos);
    circle.style.pointerEvents = 'all';

    // Hover state
    circle.addEventListener('mouseenter', () => {
      circle.setAttribute('fill', '#2563eb');
    });
    circle.addEventListener('mouseleave', () => {
      if (this.#dragState?.handle !== pos) {
        circle.setAttribute('fill', '#4a9eff');
      }
    });

    // Mousedown initiates drag
    circle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.#startDrag(vertexId, bounds, pos, circle, e.clientX, e.clientY);
    });

    this.#svgLayer.appendChild(circle);
  }

  /**
   * Return cursor style for a handle position.
   */
  #cursorForPosition(pos: HandlePosition): string {
    switch (pos) {
      case 'nw':
      case 'se':
        return 'nwse-resize';
      case 'ne':
      case 'sw':
        return 'nesw-resize';
      case 'n':
      case 's':
        return 'ns-resize';
      case 'e':
      case 'w':
        return 'ew-resize';
    }
  }

  /**
   * Start dragging a resize handle.
   */
  #startDrag(
    vertexId: SlotmapId,
    origGeom: ShapeBounds,
    handle: HandlePosition,
    handleEl: SVGCircleElement,
    clientX: number,
    clientY: number,
  ): void {
    this.#dragState = {
      handle,
      vertexId,
      origGeom,
      startMouseX: clientX,
      startMouseY: clientY,
    };

    // Compute aspect ratio for proportional constraint
    const aspectRatio = origGeom.width / origGeom.height;
    this.#proportionalState = {
      aspectRatio,
      dominant: 'width',
      locked: false,
    };

    handleEl.style.cursor = 'grabbing';
    document.addEventListener('pointermove', this.#onMoveBound);
    document.addEventListener('pointerup', this.#onUpBound);
  }

  /**
   * Handle pointer move during a resize drag.
   */
  #onDragMove(e: PointerEvent): void {
    if (!this.#dragState) return;

    const { handle, origGeom, startMouseX, startMouseY } = this.#dragState;
    const rect = this.#svgLayer.getBoundingClientRect();
    const zoom = this.#getZoom();
    const docX = (e.clientX - rect.left) / zoom;
    const docY = (e.clientY - rect.top) / zoom;

    // Compute delta from drag start
    const startDocX = (startMouseX - rect.left) / zoom;
    const startDocY = (startMouseY - rect.top) / zoom;
    let dx = docX - startDocX;
    let dy = docY - startDocY;

    // Apply proportional constraint if Shift is held
    if (e.shiftKey) {
      // Determine dominant axis based on larger absolute delta
      if (!this.#proportionalState.locked) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx > 3 || absDy > 3) {
          this.#proportionalState.dominant = absDx >= absDy ? 'width' : 'height';
          this.#proportionalState.locked = true;
        }
      }

      if (this.#proportionalState.locked) {
        const ratio = this.#proportionalState.aspectRatio;
        if (this.#proportionalState.dominant === 'width') {
          // Width delta dominates: compute height from width
          dy = dx / ratio;
        } else {
          // Height delta dominates: compute width from height
          dx = dy * ratio;
        }
      }
    }

    // Compute new geometry based on handle position
    const newGeom = this.#computeResizeGeometry(origGeom, handle, dx, dy);

    // Update all handle positions visually (they move with the shape)
    this.#updateHandlePositions(newGeom);

    // Store for commit on pointerup
    this.#dragState.origGeom = newGeom;
  }

  /**
   * Compute new geometry for a resize operation.
   */
  #computeResizeGeometry(
    orig: ShapeBounds,
    handle: HandlePosition,
    dx: number,
    dy: number,
  ): ShapeBounds {
    const MIN_SIZE = 10;

    switch (handle) {
      case 'se':
        return {
          x: orig.x,
          y: orig.y,
          width: Math.max(MIN_SIZE, orig.width + dx),
          height: Math.max(MIN_SIZE, orig.height + dy),
        };
      case 'sw':
        return {
          x: Math.min(orig.x + orig.width - MIN_SIZE, orig.x + dx),
          y: orig.y,
          width: Math.max(MIN_SIZE, orig.width - dx),
          height: Math.max(MIN_SIZE, orig.height + dy),
        };
      case 'ne':
        return {
          x: orig.x,
          y: Math.min(orig.y + orig.height - MIN_SIZE, orig.y + dy),
          width: Math.max(MIN_SIZE, orig.width + dx),
          height: Math.max(MIN_SIZE, orig.height - dy),
        };
      case 'nw':
        return {
          x: Math.min(orig.x + orig.width - MIN_SIZE, orig.x + dx),
          y: Math.min(orig.y + orig.height - MIN_SIZE, orig.y + dy),
          width: Math.max(MIN_SIZE, orig.width - dx),
          height: Math.max(MIN_SIZE, orig.height - dy),
        };
      case 'e':
        return {
          x: orig.x,
          y: orig.y,
          width: Math.max(MIN_SIZE, orig.width + dx),
          height: orig.height,
        };
      case 'w':
        return {
          x: Math.min(orig.x + orig.width - MIN_SIZE, orig.x + dx),
          y: orig.y,
          width: Math.max(MIN_SIZE, orig.width - dx),
          height: orig.height,
        };
      case 's':
        return {
          x: orig.x,
          y: orig.y,
          width: orig.width,
          height: Math.max(MIN_SIZE, orig.height + dy),
        };
      case 'n':
        return {
          x: orig.x,
          y: Math.min(orig.y + orig.height - MIN_SIZE, orig.y + dy),
          width: orig.width,
          height: Math.max(MIN_SIZE, orig.height - dy),
        };
    }
  }

  /**
   * Update all resize handle positions to reflect new geometry.
   */
  #updateHandlePositions(bounds: ShapeBounds): void {
    const positions: { pos: HandlePosition; x: number; y: number }[] = [
      { pos: 'nw', x: bounds.x, y: bounds.y },
      { pos: 'n', x: bounds.x + bounds.width / 2, y: bounds.y },
      { pos: 'ne', x: bounds.x + bounds.width, y: bounds.y },
      { pos: 'e', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
      { pos: 'se', x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { pos: 's', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
      { pos: 'sw', x: bounds.x, y: bounds.y + bounds.height },
      { pos: 'w', x: bounds.x, y: bounds.y + bounds.height / 2 },
    ];

    for (const { pos, x, y } of positions) {
      const handle = this.#svgLayer.querySelector(
        `.resize-handle[data-handle="${pos}"]`,
      ) as SVGCircleElement | null;
      if (handle) {
        handle.setAttribute('cx', String(x));
        handle.setAttribute('cy', String(y));
      }
    }
  }

  /**
   * Handle pointer up to end resize drag.
   */
  #onDragEnd(e: PointerEvent): void {
    if (!this.#dragState) return;

    const { vertexId, origGeom, startMouseX, startMouseY } = this.#dragState;

    document.removeEventListener('pointermove', this.#onMoveBound);
    document.removeEventListener('pointerup', this.#onUpBound);

    // Check if drag actually moved (threshold)
    const dx = e.clientX - startMouseX;
    const dy = e.clientY - startMouseY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 3) {
      // Small movement, cancel
      this.#dragState = null;
      return;
    }

    // Commit the resize
    this.#setVertexGeometry(vertexId, origGeom);

    this.#dragState = null;
    this.#proportionalState = { aspectRatio: 1, dominant: 'width', locked: false };
  }

  /**
   * Find a shape's bounds in the scene.
   */
  #findShapeBounds(scene: ScenePage[], shapeId: SlotmapId): ShapeBounds | null {
    const SHAPE_KEYS = [
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
    ] as const;

    for (const page of scene) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        for (const key of SHAPE_KEYS) {
          const variant = e[key] as Record<string, unknown> | undefined;
          if (!variant) continue;
          const idField = variant['id'] as { idx?: number; version?: number } | undefined;
          if (!idField) continue;
          if (idField.idx === shapeId.idx && idField.version === shapeId.version) {
            const bounds = variant['bounds'] as
              | { origin?: Record<string, number>; size?: Record<string, number> }
              | undefined;
            if (!bounds?.origin || !bounds?.size) continue;
            return {
              x: (bounds.origin['x'] as number) ?? 0,
              y: (bounds.origin['y'] as number) ?? 0,
              width: (bounds.size['width'] as number) ?? 0,
              height: (bounds.size['height'] as number) ?? 0,
            };
          }
        }
      }
    }
    return null;
  }

  /** Get current zoom level from the SVG layer's transform. */
  #getZoom(): number {
    const style = this.#svgLayer.style.transform;
    const match = style.match(/scale\(([^)]+)\)/);
    if (match) {
      return parseFloat(match[1]!) || 1;
    }
    return 1;
  }

  /** Clean up event listeners. Call when editor is detached. */
  dispose(): void {
    document.removeEventListener('pointermove', this.#onMoveBound);
    document.removeEventListener('pointerup', this.#onUpBound);
    this.#dragState = null;
    this.#svgLayer.querySelectorAll('.resize-handle').forEach((el) => el.remove());
  }
}
