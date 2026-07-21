/**
 * port-handles.ts — Port handle overlay for connection-point editing.
 *
 * Renders small draggable circles at the perimeter anchor points of selected edges.
 * Handles are only visible when the edge is selected (less visual noise).
 *
 * UX: Re-anchor = direct drag of the handle (no modal, no click-then-edit).
 */

import type { SlotmapId, ScenePage } from './types.js';
import type { DiagramEngineSession } from './session.js';
import { sceneBounds, getZoom, perimeterNormalized, classifyAnchorFromNormalized, type ShapeBounds } from './scene-bounds.js';
import { DragSession, type DragStateBase } from './dom-drag.js';
import type { OverlayHost } from './editor.js';

/** Anchor specification compatible with the WASM interface. */
export interface AnchorSpec {
  kind: 'auto' | 'north' | 'south' | 'east' | 'west' | 'normalized';
  nx?: number;
  ny?: number;
}

/** Port drag state extending DragStateBase for DragSession<T>. */
interface PortDragState extends DragStateBase {
  edgeId: SlotmapId;
  end: 0 | 1; // 0 = source, 1 = target
  vertexId: SlotmapId;
  shapeBounds: ShapeBounds;
  handleEl: SVGCircleElement;
  shift: { axis: 'H' | 'V' | null; locked: boolean };
}

/**
 * Port handle overlay: renders draggable anchor handles on selected edges.
 *
 * Handles are small circles (radius 5px) at the perimeter of the source/target
 * shapes. They are only visible when the parent edge is selected.
 *
 * Hit-test radius is 12px (distinct from bend handles which use parametric
 * positions along the polyline).
 */
export class PortHandlesOverlay {
  readonly #svgLayer: HTMLElement;
  readonly #sceneProvider: () => ScenePage[];
  readonly #session: DiagramEngineSession;

  // Port drag session using DragSession FSM
  readonly #portDragSession: DragSession<PortDragState>;

  // Overlay registration disposers for attach/detach
  #disposers: Array<() => void> = [];

  constructor(
    svgLayer: HTMLElement,
    sceneProvider: () => ScenePage[],
    session: DiagramEngineSession,
  ) {
    this.#svgLayer = svgLayer;
    this.#sceneProvider = sceneProvider;
    this.#session = session;

    // Initialize DragSession for port drag FSM
    this.#portDragSession = new DragSession<PortDragState>({
      threshold: 3,
      onMove: (e, state) => this.#portOnMove(e, state),
      onCommit: (e, state) => this.#portOnCommit(e, state),
      onCancel: (_e, state) => this.#portOnCancel(state),
    });
  }

  /**
   * Attach this overlay to the given host, registering its hit zones.
   */
  attach(host: OverlayHost): void {
    const dispose = host.registerOverlayHitZone({
      selector: '.port-handle',
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
   * Route a pointer event from the overlay hit zone to the port drag starter.
   * Returns true if the event was consumed, false otherwise.
   * Mirrors ResizeHandlesOverlay.beginFromEvent (resize-handles.ts L227-260).
   */
  beginFromEvent(target: Element, event: PointerEvent): boolean {
    const portEl = target.closest('.port-handle');
    if (!portEl) return false;

    // data-vertex-idx/version added in commit 3 (REQUIRED for bounds resolution)
    const vidIdx = portEl.getAttribute('data-vertex-idx');
    const vidVersion = portEl.getAttribute('data-vertex-version');
    if (!vidIdx || !vidVersion) return false;
    const vertexId: SlotmapId = { idx: parseInt(vidIdx), version: parseInt(vidVersion) };

    const scene = this.#sceneProvider();
    const shapeBounds = sceneBounds(scene, vertexId);
    if (!shapeBounds) return false;

    // data-edge-idx/version + data-end already written on circle (commit 3)
    const edgeIdxStr = portEl.getAttribute('data-edge-idx');
    const edgeVersionStr = portEl.getAttribute('data-edge-version');
    const endStr = portEl.getAttribute('data-end');
    if (!edgeIdxStr || !edgeVersionStr || endStr === null) return false;

    const edgeId: SlotmapId = { idx: parseInt(edgeIdxStr), version: parseInt(edgeVersionStr) };
    const end: 0 | 1 = endStr === '0' ? 0 : 1; // session.setEdgeAnchor takes 0|1, NOT 'source'|'target'

    this.#beginPortDrag(edgeId, end, vertexId, shapeBounds, portEl as SVGCircleElement, event.clientX, event.clientY);
    event.stopPropagation();
    event.preventDefault();
    return true;
  }

  /**
   * Render port handles for all selected edges.
   * @param selection Set of selected edge SlotmapIds
   */
  render(selection: Set<SlotmapId>): void {
    // Remove existing handles
    this.#svgLayer.querySelectorAll('.port-handle').forEach((el) => el.remove());

    if (selection.size === 0) return;

    const scene = this.#sceneProvider();
    if (scene.length === 0) return;

    for (const edgeId of selection) {
      const edgeData = this.#findEdgeInScene(scene, edgeId);
      if (!edgeData) continue;

      const { sourceId, targetId } = edgeData;
      const sourceBounds = sceneBounds(scene, sourceId);
      const targetBounds = sceneBounds(scene, targetId);

      if (!sourceBounds || !targetBounds) continue;

      // Compute anchor positions
      const sourcePos = this.#computeAnchorPosition(sourceBounds, targetBounds);
      const targetPos = this.#computeAnchorPosition(targetBounds, sourceBounds);

      // Source handle
      this.#createHandle(edgeId, 0, sourceId, sourceBounds, sourcePos.x, sourcePos.y);
      // Target handle
      this.#createHandle(edgeId, 1, targetId, targetBounds, targetPos.x, targetPos.y);
    }
  }

  /**
   * Create a single port handle circle element.
   */
  #createHandle(
    edgeId: SlotmapId,
    end: 0 | 1,
    vertexId: SlotmapId,
    shapeBounds: ShapeBounds,
    anchorX: number,
    anchorY: number,
  ): void {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(anchorX));
    circle.setAttribute('cy', String(anchorY));
    circle.setAttribute('r', '5');
    circle.setAttribute('class', 'port-handle');
    circle.setAttribute('data-edge-idx', String(edgeId.idx));
    circle.setAttribute('data-edge-version', String(edgeId.version));
    circle.setAttribute('data-end', String(end));
    circle.setAttribute('data-vertex-idx', String(vertexId.idx));
    circle.setAttribute('data-vertex-version', String(vertexId.version));
    circle.setAttribute('fill', '#4a9eff');
    circle.setAttribute('stroke', '#fff');
    circle.setAttribute('stroke-width', '1.5');
    circle.style.cursor = 'grab';
    circle.style.pointerEvents = 'all';

    // Event routing is handled via OverlayHost attach/detach pattern (commit 5).
    // The zone handler in editor.ts delegates to beginFromEvent, which calls #startDrag.

    this.#svgLayer.appendChild(circle);
  }

  /**
   * Begin a port drag session.
   */
  #beginPortDrag(
    edgeId: SlotmapId,
    end: 0 | 1,
    vertexId: SlotmapId,
    shapeBounds: ShapeBounds,
    handleEl: SVGCircleElement,
    clientX: number,
    clientY: number,
  ): void {
    handleEl.style.cursor = 'grabbing';
    this.#portDragSession.begin({
      edgeId,
      end,
      vertexId,
      shapeBounds,
      handleEl,
      shift: { axis: null, locked: false },
      startClientX: clientX,
      startClientY: clientY,
    });
  }

  /**
   * DragSession onMove callback for port drag.
   */
  #portOnMove(e: PointerEvent, state: PortDragState): PortDragState {
    const { shapeBounds, handleEl, shift } = state;

    // Get current document position from client
    const rect = this.#svgLayer.getBoundingClientRect();
    const zoom = getZoom(this.#svgLayer);
    let docX = (e.clientX - rect.left) / zoom;
    let docY = (e.clientY - rect.top) / zoom;

    // Apply Shift-axis constraint: after 3px, lock to dominant axis (H or V)
    if (e.shiftKey) {
      const dx = e.clientX - state.startClientX;
      const dy = e.clientY - state.startClientY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (!shift.locked) {
        const THRESHOLD = 3;
        if (absDx > THRESHOLD || absDy > THRESHOLD) {
          shift.axis = absDx >= absDy ? 'H' : 'V';
          shift.locked = true;
        }
      }

      if (shift.locked) {
        if (shift.axis === 'H') {
          // Lock vertical: keep docY at start position
          const startDocY = (state.startClientY - rect.top) / zoom;
          docY = this.#projectOntoPerimeter(shapeBounds, docX, startDocY).y;
        } else {
          // Lock horizontal: keep docX at start position
          const startDocX = (state.startClientX - rect.left) / zoom;
          docX = this.#projectOntoPerimeter(shapeBounds, startDocX, docY).x;
        }
      }
    }

    // Compute the perimeter anchor position (clamped to shape bounds)
    const anchorPos = this.#projectOntoPerimeter(shapeBounds, docX, docY);

    // Update handle visual position
    handleEl.setAttribute('cx', String(anchorPos.x));
    handleEl.setAttribute('cy', String(anchorPos.y));

    return state;
  }

  /**
   * DragSession onCommit callback for port drag.
   */
  #portOnCommit(e: PointerEvent, state: PortDragState): void {
    const { edgeId, end, shapeBounds, handleEl } = state;

    // Reset cursor/fill
    handleEl.style.cursor = 'grab';
    handleEl.setAttribute('fill', '#4a9eff');

    // Get final document position
    const rect = this.#svgLayer.getBoundingClientRect();
    const zoom = getZoom(this.#svgLayer);
    const docX = (e.clientX - rect.left) / zoom;
    const docY = (e.clientY - rect.top) / zoom;

    // Compute normalized anchor
    const { nx, ny } = perimeterNormalized(shapeBounds, docX, docY);
    const anchorKind = classifyAnchorFromNormalized(nx, ny);

    // Call WASM to set the anchor
    const anchor: AnchorSpec =
      anchorKind === 'normalized'
        ? { kind: 'normalized', nx, ny }
        : { kind: anchorKind };

    const result = this.#session.setEdgeAnchor(edgeId, end, anchor);
    if (!result.ok) {
      console.error('[port-handles] Failed to set edge anchor:', result.error);
    }
  }

  /**
   * DragSession onCancel callback for port drag.
   */
  #portOnCancel(state: PortDragState): void {
    // Reset cursor/fill only — no command issued
    state.handleEl.style.cursor = 'grab';
    state.handleEl.setAttribute('fill', '#4a9eff');
  }

  /**
   * Compute the perimeter anchor position for an edge endpoint.
   * Returns the point on the shape perimeter closest to the other shape's center.
   */
  #computeAnchorPosition(
    bounds: ShapeBounds,
    otherBounds: ShapeBounds,
  ): { x: number; y: number } {
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const otherCenterX = otherBounds.x + otherBounds.width / 2;
    const otherCenterY = otherBounds.y + otherBounds.height / 2;

    const dx = otherCenterX - centerX;
    const dy = otherCenterY - centerY;

    // Find which side to use based on direction to other shape
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal: exit east or west
      if (dx > 0) {
        return { x: bounds.x + bounds.width, y: centerY };
      } else {
        return { x: bounds.x, y: centerY };
      }
    } else {
      // Vertical: exit north or south
      if (dy > 0) {
        return { x: centerX, y: bounds.y + bounds.height };
      } else {
        return { x: centerX, y: bounds.y };
      }
    }
  }

  /** Project a mouse point onto the perimeter of a rectangle. */
  #projectOntoPerimeter(
    bounds: ShapeBounds,
    mouseX: number,
    mouseY: number,
  ): { x: number; y: number } {
    const { nx, ny } = perimeterNormalized(bounds, mouseX, mouseY);
    return {
      x: bounds.x + nx * bounds.width,
      y: bounds.y + ny * bounds.height,
    };
  }

  /** Find an edge in the scene and return its source/target IDs. */
  #findEdgeInScene(
    scene: ScenePage[],
    edgeId: SlotmapId,
  ): { sourceId: SlotmapId; targetId: SlotmapId } | null {
    for (const page of scene) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        // Check for LineElement
        const line = e['Line'] as Record<string, unknown> | undefined;
        if (line) {
          const idField = line['id'] as { idx?: number; version?: number } | undefined;
          if (idField?.idx === edgeId.idx && idField?.version === edgeId.version) {
            const source = line['source'] as { Vertex?: { idx?: number; version?: number } } | undefined;
            const target = line['target'] as { Vertex?: { idx?: number; version?: number } } | undefined;
            if (source?.Vertex && target?.Vertex) {
              return {
                sourceId: { idx: source.Vertex.idx!, version: source.Vertex.version! },
                targetId: { idx: target.Vertex.idx!, version: target.Vertex.version! },
              };
            }
          }
        }
        // Check for PathElement
        const path = e['Path'] as Record<string, unknown> | undefined;
        if (path) {
          const idField = path['id'] as { idx?: number; version?: number } | undefined;
          if (idField?.idx === edgeId.idx && idField?.version === edgeId.version) {
            const source = path['source'] as { Vertex?: { idx?: number; version?: number } } | undefined;
            const target = path['target'] as { Vertex?: { idx?: number; version?: number } } | undefined;
            if (source?.Vertex && target?.Vertex) {
              return {
                sourceId: { idx: source.Vertex.idx!, version: source.Vertex.version! },
                targetId: { idx: target.Vertex.idx!, version: target.Vertex.version! },
              };
            }
          }
        }
      }
    }
    return null;
  }

  /** Clean up event listeners. Call when editor is detached. */
  dispose(): void {
    this.detach();
    this.#portDragSession.dispose();
    this.#svgLayer.querySelectorAll('.port-handle').forEach((el) => el.remove());
  }
}
