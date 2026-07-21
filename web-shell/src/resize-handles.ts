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
        this.#setVertexGeometry(state.vertexId, state.currentGeom);
        state.proportional = { aspectRatio: 1, dominant: 'width', locked: false };
      },
      onCancel: (_e, _state) => {},
    });

    // Rotation drag session (T10)
    this.#rotationSession = new DragSession<RotationDragState2>({
      threshold: 3,
      onMove: (e, state) => this.#rotationOnMove(e, state),
      onCommit: (_e, state) => {
        const MIN_ANGLE = Math.PI / 180;
        if (Math.abs(state.currentAngleDelta) >= MIN_ANGLE) {
          this.#rotateVertex(state.vertexId, state.currentAngleDelta);
        }
      },
      onCancel: (_e, _state) => {},
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

    this.#getSvgLayer().appendChild(circle);
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
    const doc = clientToDoc(this.#getSvgLayer(), e.clientX, e.clientY);
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
    state.currentGeom = newGeom;
    return state;
  }

  // ─── DragSession callbacks for rotation ──────────────────────────────────────

  #rotationOnMove(e: PointerEvent, state: RotationDragState2): RotationDragState2 {
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
    const line = this.#getSvgLayer().querySelector('.rotation-handle-link') as SVGLineElement | null;
    if (line) {
      line.setAttribute('x2', String(handleX));
      line.setAttribute('y2', String(handleY));
    }
    return state;
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
    this.#clearHandles(this.#getSvgLayer());
  }

  #clearHandles(svgLayer: HTMLElement): void {
    svgLayer
      .querySelectorAll('.resize-handle, .rotation-handle, .rotation-handle-link')
      .forEach((el) => el.remove());
  }
}
