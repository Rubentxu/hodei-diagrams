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
import { sceneBounds, getZoom, clientToDoc, type ShapeBounds } from './scene-bounds.js';
import { DragSession, type DragStateBase } from './dom-drag.js';
import { TransformPreview } from './transform-preview.js';
import type { OverlayHost } from './editor.js';

/** Resize handle positions. */
export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** State for proportional (Shift) constraint during resize drag. */
interface ProportionalState {
  aspectRatio: number; // width / height
  dominant: 'width' | 'height';
  locked: boolean;
}

// DragSession state for resize gestures
interface ResizeDragState2 extends DragStateBase {
  handle: HandlePosition;
  vertexId: SlotmapId;
  startGeom: ShapeBounds;
  currentGeom: ShapeBounds;
  startDocX: number;
  startDocY: number;
  proportional: ProportionalState;
}

// DragSession state for rotation gestures
interface RotationDragState2 extends DragStateBase {
  vertexId: SlotmapId;
  centerX: number;
  centerY: number;
  radius: number;
  startAngle: number;
  currentAngleDelta: number;
}

/**
 * Resize handles overlay: renders 8 draggable handles on a single selected shape.
 *
 * Handles are only visible when exactly one shape is selected.
 * Corner handles: NW, NE, SE, SW
 * Edge handles: N, E, S, W
 */
export class ResizeHandlesOverlay {
  // Viewer element — needed for clientToDoc coordinate conversion
  readonly #viewer: HTMLElement;
  // Getter instead of direct reference — re-queries DOM on each call so we always
  // get the current SVG element (avoids stale reference after mountSvg replaces innerHTML)
  readonly #getSvgLayer: () => HTMLElement;
  readonly #sceneProvider: () => ScenePage[];
  readonly #setVertexGeometry: (_id: SlotmapId, _geom: ShapeBounds) => void;
  readonly #rotateVertex: (_id: SlotmapId, _angleDelta: number) => void;

  // Pre-built drag sessions — reused across gestures via .begin()
  readonly #resizeSession: DragSession<ResizeDragState2>;
  readonly #rotationSession: DragSession<RotationDragState2>;

  // Overlay registration disposers for attach/detach
  #disposers: Array<() => void> = [];

  // Transform preview for live resize/rotation drag previews
  readonly #transformPreview: TransformPreview = new TransformPreview();

  constructor(
    viewer: HTMLElement,
    getSvgLayer: () => HTMLElement,
    sceneProvider: () => ScenePage[],
    setVertexGeometry: (_id: SlotmapId, _geom: ShapeBounds) => void,
    rotateVertex: (_id: SlotmapId, _angleDelta: number) => void,
  ) {
    this.#viewer = viewer;
    this.#getSvgLayer = getSvgLayer;
    this.#sceneProvider = sceneProvider;
    this.#setVertexGeometry = setVertexGeometry;
    this.#rotateVertex = rotateVertex;

    // Resize drag session (T10)
    this.#resizeSession = new DragSession<ResizeDragState2>({
      threshold: 3,
      onMove: (e, state) => this.#resizeOnMove(e, state),
      onCommit: (_e, state) => {
        // Restore preview before engine mutation so DOM matches engine state post-replay
        this.#transformPreview.restore(state.vertexId);
        this.#setVertexGeometry(state.vertexId, state.currentGeom);
        this.#transformPreview.commit(state.vertexId);
        state.proportional = { aspectRatio: 1, dominant: 'width', locked: false };
      },
      onCancel: (_e, state) => {
        // Restore original DOM state without engine mutation
        this.#transformPreview.restore(state.vertexId);
        this.#transformPreview.commit(state.vertexId);
      },
    });

    // Rotation drag session (T10)
    this.#rotationSession = new DragSession<RotationDragState2>({
      threshold: 3,
      onMove: (e, state) => this.#rotationOnMove(e, state),
      onCommit: (_e, state) => {
        // Restore preview before engine mutation
        this.#transformPreview.restore(state.vertexId);
        const MIN_ANGLE = Math.PI / 180;
        if (Math.abs(state.currentAngleDelta) >= MIN_ANGLE) {
          this.#rotateVertex(state.vertexId, state.currentAngleDelta);
        }
        this.#transformPreview.commit(state.vertexId);
      },
      onCancel: (_e, state) => {
        // Restore original DOM state without engine mutation
        this.#transformPreview.restore(state.vertexId);
        this.#transformPreview.commit(state.vertexId);
      },
    });
  }

  /**
   * Attach this overlay to the given host, registering its hit zones.
   */
  attach(host: OverlayHost): void {
    const dispose = host.registerOverlayHitZone({
      selector: '.resize-handle, .rotation-handle',
      handler: (target, event) => this.beginFromEvent(target, event),
    });
    this.#disposers.push(dispose);
  }

  /**
   * Detach this overlay from its host, removing all registered hit zones.
   */
  detach(): void {
    for (const dispose of this.#disposers) dispose();
    this.#disposers = [];
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
    const bounds = sceneBounds(scene, vertexId);
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

    this.#appendToShapeGroup(circle, vertexId);
  }

  /**
   * Begin a resize drag (Pattern D 9c — zone handler in editor calls this).
   * Exposed publicly so the editor's OverlayHitZone registry can route events.
   */
  beginResize(
    vertexId: SlotmapId,
    origGeom: ShapeBounds,
    handle: HandlePosition,
    handleEl: SVGCircleElement,
    clientX: number,
    clientY: number,
  ): void {
    handleEl.style.cursor = 'grabbing';

    // Capture shape element for transform preview before any preview is applied
    const shapeEl = this.#getShapeElement(vertexId);
    if (shapeEl) {
      this.#transformPreview.capture(shapeEl, vertexId);
    }

    const startDoc = this.#clientToDoc(clientX, clientY);
    this.#resizeSession.begin({
      handle,
      vertexId,
      startGeom: origGeom,
      currentGeom: { ...origGeom },
      startDocX: startDoc.x,
      startDocY: startDoc.y,
      startClientX: clientX,
      startClientY: clientY,
      proportional: {
        aspectRatio: origGeom.width / origGeom.height,
        dominant: 'width',
        locked: false,
      },
    });
  }

  /**
   * Begin a rotation drag (Pattern D 9c — zone handler in editor calls this).
   * Exposed publicly so the editor's OverlayHitZone registry can route events.
   */
  beginRotationDrag(
    vertexId: SlotmapId,
    bounds: ShapeBounds,
    handleEl: SVGCircleElement,
    clientX: number,
    clientY: number,
  ): void {
    handleEl.style.cursor = 'grabbing';

    // Capture shape element for transform preview before any preview is applied
    const shapeEl = this.#getShapeElement(vertexId);
    if (shapeEl) {
      this.#transformPreview.capture(shapeEl, vertexId);
    }

    const { centerX, centerY, radius } = this.#rotationHandleGeometry(bounds);
    this.#rotationSession.begin({
      vertexId,
      centerX,
      centerY,
      radius,
      startAngle: this.#angleFromCenter(centerX, centerY, clientX, clientY),
      currentAngleDelta: 0,
      startClientX: clientX,
      startClientY: clientY,
    });
  }

  /**
   * Route a pointer event from the overlay hit zone to the appropriate drag starter.
   * Returns true if the event was consumed, false otherwise.
   */
  beginFromEvent(target: Element, event: PointerEvent): boolean {
    const resizeTarget = target.closest('.resize-handle');
    if (resizeTarget) {
      const vidIdx = resizeTarget.getAttribute('data-vertex-idx');
      const vidVersion = resizeTarget.getAttribute('data-vertex-version');
      const handle = resizeTarget.getAttribute('data-handle') as HandlePosition | null;
      if (!vidIdx || !vidVersion || !handle) return false;
      const vertexId = { idx: parseInt(vidIdx), version: parseInt(vidVersion) };
      const scene = this.#sceneProvider();
      const bounds = sceneBounds(scene, vertexId);
      if (!bounds) return false;
      this.beginResize(vertexId, bounds, handle, target as SVGCircleElement, event.clientX, event.clientY);
      event.stopPropagation();
      event.preventDefault();
      return true;
    }

    const rotationTarget = target.closest('.rotation-handle');
    if (rotationTarget) {
      const vidIdx = rotationTarget.getAttribute('data-vertex-idx');
      const vidVersion = rotationTarget.getAttribute('data-vertex-version');
      if (!vidIdx || !vidVersion) return false;
      const vertexId = { idx: parseInt(vidIdx), version: parseInt(vidVersion) };
      const scene = this.#sceneProvider();
      const bounds = sceneBounds(scene, vertexId);
      if (!bounds) return false;
      this.beginRotationDrag(vertexId, bounds, target as SVGCircleElement, event.clientX, event.clientY);
      event.stopPropagation();
      event.preventDefault();
      return true;
    }

    return false;
  }

  /**
   * Apply a CSS translate offset to all handles (used during drag-to-move preview).
   * Exposed publicly so the editor's move FSM can preview handle movement without
   * committing a vertex move command.
   */
  applyDragOffset(dx: number, dy: number): void {
    const transform = dx === 0 && dy === 0 ? '' : `translate(${dx}px, ${dy}px)`;
    this.#getSvgLayer()
      .querySelectorAll('.resize-handle, .rotation-handle, .rotation-handle-link')
      .forEach((handle) => {
        (handle as SVGElement).style.transform = transform;
      });
  }

  // ─── DragSession callbacks for resize ────────────────────────────────────────

  #resizeOnMove(e: PointerEvent, state: ResizeDragState2): ResizeDragState2 {
    const doc = this.#clientToDoc(e.clientX, e.clientY);
    const docX = doc.x;
    const docY = doc.y;
    let dx = docX - state.startDocX;
    let dy = docY - state.startDocY;

    // Proportional constraint (Shift)
    if (e.shiftKey) {
      if (!state.proportional.locked) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx > 3 || absDy > 3) {
          state.proportional.dominant = absDx >= absDy ? 'width' : 'height';
          state.proportional.locked = true;
        }
      }
      if (state.proportional.locked) {
        const ratio = state.proportional.aspectRatio;
        if (state.proportional.dominant === 'width') {
          dy = dx / ratio;
        } else {
          dx = dy * ratio;
        }
      }
    } else {
      state.proportional.locked = false;
    }

    const newGeom = this.#computeResizeGeometry(state.startGeom, state.handle, dx, dy);
    this.#updateHandlePositions(newGeom);

    // Apply live resize preview transform to the actual shape element
    // This uses an affine matrix that maps from original bounds to new bounds
    this.#transformPreview.applyResize(
      state.vertexId,
      state.startGeom.x,
      state.startGeom.y,
      state.startGeom.width,
      state.startGeom.height,
      newGeom.x,
      newGeom.y,
      newGeom.width,
      newGeom.height,
    );

    state.currentGeom = newGeom;
    return state;
  }

  // ─── DragSession callbacks for rotation ──────────────────────────────────────

  #rotationOnMove(e: PointerEvent, state: RotationDragState2): RotationDragState2 {
    const angle = this.#angleFromCenter(state.centerX, state.centerY, e.clientX, e.clientY);
    state.currentAngleDelta = this.#normalizeAngleDelta(angle - state.startAngle);

    const handleAngle = state.startAngle + state.currentAngleDelta;
    // Handle circle is a child of the rotated shape <g> at fixed local offset (0, -radius).
    // Its visual position is: center + R_handleAngle × (0, -radius).
    // Do NOT update cx,cy here — the group's CSS rotation moves it automatically.
    const line = this.#getSvgLayer().querySelector('.rotation-handle-link') as SVGLineElement | null;
    if (line) {
      // Line endpoint in document space = center + R_handleAngle × (0, -radius)
      const handleX = state.centerX + Math.sin(handleAngle) * state.radius;
      const handleY = state.centerY - Math.cos(handleAngle) * state.radius;
      line.setAttribute('x2', String(handleX));
      line.setAttribute('y2', String(handleY));
    }

    // Apply live rotation preview transform to the actual shape element
    // Rotate around the document-space center point
    if (state.currentAngleDelta !== 0) {
      this.#transformPreview.applyRotate(
        state.vertexId,
        state.currentAngleDelta,
        state.centerX,
        state.centerY,
      );
    }
    return state;
  }

  /** Create the rotation handle above the selected shape. */
  #createRotationHandle(vertexId: SlotmapId, bounds: ShapeBounds): void {
    const { centerX, centerY, radius } = this.#rotationHandleGeometry(bounds);

    // Circle goes INSIDE the shape's <g> wrapper at local offset (0, -radius).
    // The group's CSS rotation will move it to the correct visual position automatically.
    // Local coords: cx=0 (centerX), cy=-radius (top of shape in local space).
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '0');
    circle.setAttribute('cy', String(-radius));
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

    // Dashed line stays at SVG layer level; its endpoint is in document space.
    // Initial endpoint at handleAngle=0: center + R_0 × (0, -radius) = (centerX, centerY - radius)
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'rotation-handle-link');
    line.setAttribute('x1', String(centerX));
    line.setAttribute('y1', String(centerY));
    line.setAttribute('x2', String(centerX));
    line.setAttribute('y2', String(centerY - radius));
    line.setAttribute('stroke', '#4a9eff');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '4 3');
    line.style.pointerEvents = 'none';

    const svgLayer = this.#getSvgLayer();
    svgLayer.appendChild(line);
    this.#appendToShapeGroup(circle, vertexId);
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
    // handleX === centerX always, so the distance is just |handleY - centerY|
    const radius = offset + bounds.height / 2;
    return {
      centerX,
      centerY,
      handleX,
      handleY,
      radius,
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

  /** Convert a browser point to document coordinates using the shared clientToDoc helper. */
  #clientToDoc(clientX: number, clientY: number): { x: number; y: number } {
    return clientToDoc(this.#viewer, clientX, clientY);
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

  /** Clean up event listeners. Call when editor is detached. */
  dispose(): void {
    this.detach();
    this.#resizeSession.dispose();
    this.#rotationSession.dispose();
    this.#transformPreview.dispose();
    this.#clearHandles(this.#getSvgLayer());
  }

  /**
   * Get the shape element for a given vertex ID.
   * Returns null if not found.
   */
  #getShapeElement(id: SlotmapId): SVGElement | null {
    const selector = `[data-vertex-id="${id.idx}:${id.version}"]`;
    return this.#getSvgLayer().querySelector(selector) as SVGElement | null;
  }

  /**
   * Append an SVG element to the shape's <g data-vertex-id="..."> wrapper group.
   * Falls back to the SVG layer if the wrapper is not found (e.g. pre-wrap shapes).
   *
   * SVG does not render children of primitive shape elements (<rect>, <ellipse>,
   * <image>). When the data-vertex-id attribute is on the shape element itself
   * (not on a wrapper <g>), we must append to the parent <g> if it exists,
   * otherwise the handle has a zero bounding box.
   *
   * If shapeEl itself IS the <g data-vertex-id> group (not a child of it),
   * append directly to that <g>.
   */
  #appendToShapeGroup(el: SVGElement, vertexId: SlotmapId): void {
    const shapeEl = this.#getShapeElement(vertexId);
    if (!shapeEl) {
      this.#getSvgLayer().appendChild(el);
      return;
    }
    const tagName = shapeEl.tagName.toLowerCase();
    const isPrimitive = ['rect', 'ellipse', 'circle', 'path', 'polygon', 'polyline', 'image', 'text'].includes(tagName);
    if (isPrimitive) {
      // Check if parent is a <g data-vertex-id> wrapper
      const parent = shapeEl.parentElement;
      if (
        parent?.tagName.toLowerCase() === 'g' &&
        parent?.getAttribute('data-vertex-id') === `${vertexId.idx}:${vertexId.version}`
      ) {
        parent.appendChild(el);
        return;
      }
    }
    // If shapeEl itself is the <g data-vertex-id> group (<g data-vertex-id>),
    // append directly to it. Otherwise fall back to SVG layer.
    if (shapeEl.getAttribute('data-vertex-id') === `${vertexId.idx}:${vertexId.version}`) {
      shapeEl.appendChild(el);
      return;
    }
    this.#getSvgLayer().appendChild(el);
  }

  #clearHandles(svgLayer: HTMLElement): void {
    svgLayer
      .querySelectorAll('.resize-handle, .rotation-handle, .rotation-handle-link')
      .forEach((el) => el.remove());
  }
}
