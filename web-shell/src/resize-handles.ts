/**
 * resize-handles.ts — Resize handle overlay for shape resize editing.
 *
 * Renders 8 draggable resize handles (4 corners + 4 edge midpoints) plus one
 * rotation handle on a single selected shape.
 * Shift+drag constrains resize to proportional aspect ratio.
 *
 * UX: Resize = direct drag of corner/edge handle (no modal, no click-then-edit).
 */

import type { SlotmapId, ScenePage } from './types.js';
import { sceneBounds } from './scene-bounds.js';

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
  startGeom: ShapeBounds;
  currentGeom: ShapeBounds;
  startMouseX: number;
  startMouseY: number;
}

/** A rotation handle being dragged. */
interface RotationDragState {
  vertexId: SlotmapId;
  centerX: number;
  centerY: number;
  radius: number;
  startAngle: number;
  currentAngleDelta: number;
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
  // Getter instead of direct reference — re-queries DOM on each call so we always
  // get the current SVG element (avoids stale reference after mountSvg replaces innerHTML)
  readonly #getSvgLayer: () => HTMLElement;
  readonly #sceneProvider: () => ScenePage[];
  readonly #setVertexGeometry: (_id: SlotmapId, _geom: ShapeBounds) => void;
  readonly #rotateVertex: (_id: SlotmapId, _angleDelta: number) => void;
  #dragState: ResizeDragState | null = null;
  #rotationDragState: RotationDragState | null = null;
  #proportionalState: ProportionalState = { aspectRatio: 1, dominant: 'width', locked: false };
  #onMoveBound: (_e: PointerEvent) => void;
  #onUpBound: (_e: PointerEvent) => void;
  #onRotateMoveBound: (_e: PointerEvent) => void;
  #onRotateUpBound: (_e: PointerEvent) => void;

  constructor(
    getSvgLayer: () => HTMLElement,
    sceneProvider: () => ScenePage[],
    setVertexGeometry: (_id: SlotmapId, _geom: ShapeBounds) => void,
    rotateVertex: (_id: SlotmapId, _angleDelta: number) => void,
  ) {
    this.#getSvgLayer = getSvgLayer;
    this.#sceneProvider = sceneProvider;
    this.#setVertexGeometry = setVertexGeometry;
    this.#rotateVertex = rotateVertex;
    this.#onMoveBound = (e: PointerEvent) => this.#onDragMove(e);
    this.#onUpBound = (e: PointerEvent) => this.#onDragEnd(e);
    this.#onRotateMoveBound = (e: PointerEvent) => this.#onRotateMove(e);
    this.#onRotateUpBound = (e: PointerEvent) => this.#onRotateEnd(e);
  }

  /**
   * Render resize handles for single-shape selection.
   * @param selection Set of selected SlotmapIds (only renders for single shape)
   */
  render(selection: Set<SlotmapId>): void {
    const svgLayer = this.#getSvgLayer();
    this.#clearHandles(svgLayer);

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
    this.#createRotationHandle(vertexId, bounds);
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

    // Pointerdown initiates drag. This MUST stop propagation before the
    // editor-level pointerdown handler sees the event, otherwise the handle
    // click is interpreted as an empty-canvas click and clears selection.
    circle.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.#startDrag(vertexId, bounds, pos, circle, e.clientX, e.clientY);
    });

    this.#getSvgLayer().appendChild(circle);
  }

  /** Create the rotation handle above the selected shape. */
  #createRotationHandle(vertexId: SlotmapId, bounds: ShapeBounds): void {
    const { centerX, handleX, handleY } = this.#rotationHandleGeometry(bounds);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'rotation-handle-link');
    line.setAttribute('x1', String(centerX));
    line.setAttribute('y1', String(bounds.y));
    line.setAttribute('x2', String(handleX));
    line.setAttribute('y2', String(handleY));
    line.setAttribute('stroke', '#4a9eff');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '4 3');
    line.style.pointerEvents = 'none';

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(handleX));
    circle.setAttribute('cy', String(handleY));
    circle.setAttribute('r', '6');
    circle.setAttribute('class', 'rotation-handle');
    circle.setAttribute('data-testid', 'rotation-handle');
    circle.setAttribute('data-vertex-idx', String(vertexId.idx));
    circle.setAttribute('data-vertex-version', String(vertexId.version));
    circle.setAttribute('fill', '#f59e0b');
    circle.setAttribute('stroke', '#fff');
    circle.setAttribute('stroke-width', '1.5');
    circle.style.cursor = 'grab';
    circle.style.pointerEvents = 'all';

    circle.addEventListener('mouseenter', () => {
      circle.setAttribute('fill', '#d97706');
    });
    circle.addEventListener('mouseleave', () => {
      if (!this.#rotationDragState) {
        circle.setAttribute('fill', '#f59e0b');
      }
    });

    circle.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.#startRotationDrag(vertexId, bounds, circle, e.clientX, e.clientY);
    });

    const svgLayer = this.#getSvgLayer();
    svgLayer.appendChild(line);
    svgLayer.appendChild(circle);
  }

  /** Geometry for the rotation handle in document coordinates. */
  #rotationHandleGeometry(bounds: ShapeBounds): {
    centerX: number;
    centerY: number;
    handleX: number;
    handleY: number;
    radius: number;
  } {
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const offset = Math.max(28, Math.min(44, bounds.height * 0.35));
    const handleX = centerX;
    const handleY = bounds.y - offset;
    return {
      centerX,
      centerY,
      handleX,
      handleY,
      radius: Math.hypot(handleX - centerX, handleY - centerY),
    };
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
      startGeom: origGeom,
      currentGeom: origGeom,
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

    const { handle, startGeom, startMouseX, startMouseY } = this.#dragState;
    const rect = this.#getSvgLayer().getBoundingClientRect();
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
    const newGeom = this.#computeResizeGeometry(startGeom, handle, dx, dy);

    // Update all handle positions visually (they move with the shape)
    this.#updateHandlePositions(newGeom);

    // Store for commit on pointerup
    this.#dragState.currentGeom = newGeom;
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
      const handle = this.#getSvgLayer().querySelector(
        `.resize-handle[data-handle="${pos}"]`,
      ) as SVGCircleElement | null;
      if (handle) {
        handle.setAttribute('cx', String(x));
        handle.setAttribute('cy', String(y));
      }
    }
    this.#updateRotationHandlePosition(bounds);
  }

  /** Update the rotation handle and its guide line to match current bounds. */
  #updateRotationHandlePosition(bounds: ShapeBounds): void {
    const { centerX, handleX, handleY } = this.#rotationHandleGeometry(bounds);
    const handle = this.#getSvgLayer().querySelector('.rotation-handle') as SVGCircleElement | null;
    if (handle) {
      handle.setAttribute('cx', String(handleX));
      handle.setAttribute('cy', String(handleY));
    }
    const line = this.#getSvgLayer().querySelector(
      '.rotation-handle-link',
    ) as SVGLineElement | null;
    if (line) {
      line.setAttribute('x1', String(centerX));
      line.setAttribute('y1', String(bounds.y));
      line.setAttribute('x2', String(handleX));
      line.setAttribute('y2', String(handleY));
    }
  }

  /** Start dragging the rotation handle. */
  #startRotationDrag(
    vertexId: SlotmapId,
    bounds: ShapeBounds,
    handleEl: SVGCircleElement,
    clientX: number,
    clientY: number,
  ): void {
    const { centerX, centerY, radius } = this.#rotationHandleGeometry(bounds);
    this.#rotationDragState = {
      vertexId,
      centerX,
      centerY,
      radius,
      startAngle: this.#angleFromCenter(centerX, centerY, clientX, clientY),
      currentAngleDelta: 0,
      startMouseX: clientX,
      startMouseY: clientY,
    };
    handleEl.style.cursor = 'grabbing';
    document.addEventListener('pointermove', this.#onRotateMoveBound);
    document.addEventListener('pointerup', this.#onRotateUpBound);
  }

  /** Handle pointer movement while rotating. */
  #onRotateMove(e: PointerEvent): void {
    if (!this.#rotationDragState) return;
    const state = this.#rotationDragState;
    const angle = this.#angleFromCenter(state.centerX, state.centerY, e.clientX, e.clientY);
    state.currentAngleDelta = this.#normalizeAngleDelta(angle - state.startAngle);

    const handleAngle = state.startAngle + state.currentAngleDelta;
    const handleX = state.centerX + Math.cos(handleAngle) * state.radius;
    const handleY = state.centerY + Math.sin(handleAngle) * state.radius;
    const handle = this.#getSvgLayer().querySelector('.rotation-handle') as SVGCircleElement | null;
    if (handle) {
      handle.setAttribute('cx', String(handleX));
      handle.setAttribute('cy', String(handleY));
    }
    const line = this.#getSvgLayer().querySelector(
      '.rotation-handle-link',
    ) as SVGLineElement | null;
    if (line) {
      line.setAttribute('x2', String(handleX));
      line.setAttribute('y2', String(handleY));
    }
  }

  /** End rotation drag and commit an engine rotation command. */
  #onRotateEnd(e: PointerEvent): void {
    if (!this.#rotationDragState) return;
    const state = this.#rotationDragState;
    document.removeEventListener('pointermove', this.#onRotateMoveBound);
    document.removeEventListener('pointerup', this.#onRotateUpBound);

    const dx = e.clientX - state.startMouseX;
    const dy = e.clientY - state.startMouseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angleDelta = this.#normalizeAngleDelta(
      this.#angleFromCenter(state.centerX, state.centerY, e.clientX, e.clientY) - state.startAngle,
    );
    this.#rotationDragState = null;

    if (dist >= 3 && Math.abs(angleDelta) >= Math.PI / 180) {
      this.#rotateVertex(state.vertexId, angleDelta);
    }
  }

  /** Convert a browser point to document coordinates using the same model as resize. */
  #clientToDoc(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.#getSvgLayer().getBoundingClientRect();
    const zoom = this.#getZoom();
    return {
      x: (clientX - rect.left) / zoom,
      y: (clientY - rect.top) / zoom,
    };
  }

  #angleFromCenter(centerX: number, centerY: number, clientX: number, clientY: number): number {
    const doc = this.#clientToDoc(clientX, clientY);
    return Math.atan2(doc.y - centerY, doc.x - centerX);
  }

  #normalizeAngleDelta(angle: number): number {
    let normalized = angle;
    while (normalized > Math.PI) normalized -= Math.PI * 2;
    while (normalized < -Math.PI) normalized += Math.PI * 2;
    return normalized;
  }

  /**
   * Handle pointer up to end resize drag.
   */
  #onDragEnd(e: PointerEvent): void {
    if (!this.#dragState) return;

    const { vertexId, currentGeom, startMouseX, startMouseY } = this.#dragState;

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
    this.#setVertexGeometry(vertexId, currentGeom);

    this.#dragState = null;
    this.#proportionalState = { aspectRatio: 1, dominant: 'width', locked: false };
  }

  /**
   * Find a shape's bounds in the scene.
   */
  #findShapeBounds(scene: ScenePage[], shapeId: SlotmapId): ShapeBounds | null {
    return sceneBounds(scene, shapeId);
  }

  /** Get current zoom level from the SVG layer's transform. */
  #getZoom(): number {
    const style = this.#getSvgLayer().style.transform;
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
    document.removeEventListener('pointermove', this.#onRotateMoveBound);
    document.removeEventListener('pointerup', this.#onRotateUpBound);
    this.#dragState = null;
    this.#rotationDragState = null;
    this.#clearHandles(this.#getSvgLayer());
  }

  #clearHandles(svgLayer: HTMLElement = this.#getSvgLayer()): void {
    svgLayer
      .querySelectorAll('.resize-handle, .rotation-handle, .rotation-handle-link')
      .forEach((el) => el.remove());
  }
}
