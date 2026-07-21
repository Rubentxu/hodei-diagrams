/**
 * bend-handles.ts — Bend handle overlay for waypoint editing.
 *
 * Renders draggable waypoint circles on selected edges with bends.
 * Handles are only visible when the edge is selected and has waypoints.
 *
 * UX: Drag a bend handle = direct move of the waypoint (no modal).
 */

import type { SlotmapId, ScenePage } from './types.js';
import type { DiagramEngineSession } from './session.js';
import { findEdgeVariant, clientToDoc } from './scene-bounds.js';
import { DragSession, type DragStateBase } from './dom-drag.js';
import type { OverlayHost } from './editor.js';

/** Bend drag state extending DragStateBase for DragSession<T>. */
interface BendDragState extends DragStateBase {
  edgeId: SlotmapId;
  bendIndex: number;
  startBend: { x: number; y: number };
  currentBend: { x: number; y: number };
}

/**
 * Bend handle overlay: renders draggable waypoint circles on selected edges.
 *
 * Drag semantics: LIVE-COMMIT. `moveBend` fires on every pointermove (inside
 * `onMove`). The DragSession 3px threshold only gates `onCommit` vs `onCancel`,
 * both of which are cursor-cleanup no-ops for bend. This preserves the current
 * "every move commits" feel exactly.
 *
 * Mirrors PortHandlesOverlay (r108) — same attach/detach/render/dispose shape,
 * same DragSession<BendDragState> FSM, same OverlayHost contract.
 */
export class BendHandlesOverlay {
  readonly #svgLayer: HTMLElement;
  readonly #viewer: HTMLElement;
  readonly #sceneProvider: () => ScenePage[];
  readonly #session: DiagramEngineSession;
  readonly #snapToGrid: (x: number, y: number) => { x: number; y: number };
  readonly #onError: (msg: string) => void;
  readonly #onBendSelect: (edgeId: SlotmapId | null, bendIndex: number | null) => void;

  // Bend drag session using DragSession FSM
  readonly #bendDragSession: DragSession<BendDragState>;

  // Overlay registration disposers for attach/detach
  #disposers: Array<() => void> = [];

  // Currently selected bend (updated via onBendSelect callback)
  #selectedBend: { edgeId: SlotmapId; bendIndex: number } | null = null;

  constructor(
    svgLayer: HTMLElement,
    viewer: HTMLElement,
    sceneProvider: () => ScenePage[],
    session: DiagramEngineSession,
    snapToGrid: (x: number, y: number) => { x: number; y: number },
    onError: (msg: string) => void,
    onBendSelect: (edgeId: SlotmapId | null, bendIndex: number | null) => void,
  ) {
    this.#svgLayer = svgLayer;
    this.#viewer = viewer;
    this.#sceneProvider = sceneProvider;
    this.#session = session;
    this.#snapToGrid = snapToGrid;
    this.#onError = onError;
    this.#onBendSelect = onBendSelect;

    // Initialize DragSession for bend drag FSM
    this.#bendDragSession = new DragSession<BendDragState>({
      threshold: 3,
      onMove: (e, state) => this.#bendOnMove(e, state),
      onCommit: () => { /* live-commit; nothing to do */ },
      onCancel: () => { /* live-commit; nothing to roll back */ },
    });
  }

  /**
   * Attach this overlay to the given host, registering its hit zones.
   */
  attach(host: OverlayHost): void {
    const dispose = host.registerOverlayHitZone({
      selector: '.bend-handle',
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
   * Route a pointer event from the overlay hit zone to the bend drag starter.
   * Returns true if the event was consumed, false otherwise.
   */
  beginFromEvent(target: Element, event: PointerEvent): boolean {
    const bendEl = target.closest('.bend-handle');
    if (!bendEl) return false;

    const edgeIdxStr = bendEl.getAttribute('data-edge-idx');
    const edgeVerStr = bendEl.getAttribute('data-edge-version');
    const bendIdxStr = bendEl.getAttribute('data-bend-index');
    if (!edgeIdxStr || !edgeVerStr || !bendIdxStr) return false;

    const edgeId: SlotmapId = { idx: Number(edgeIdxStr), version: Number(edgeVerStr) };
    const bendIndex = Number(bendIdxStr);

    const startBend = this.#readBendCoords(edgeId, bendIndex);
    if (!startBend) return false;

    // Track selected bend locally for Delete-key queries
    this.#selectedBend = { edgeId, bendIndex };

    // Notify editor of bend selection (Delete-key coupling)
    this.#onBendSelect(edgeId, bendIndex);

    this.#bendDragSession.begin({
      edgeId,
      bendIndex,
      startBend,
      currentBend: startBend,
      startClientX: event.clientX,
      startClientY: event.clientY,
    });
    event.stopPropagation();
    event.preventDefault();
    return true;
  }

  /**
   * Render bend handles for the currently selected edge.
   * Pass null to clear. Mirrors editor.ts:#renderBendHandles.
   */
  render(selectedEdgeId: SlotmapId | null): void {
    this.#viewer.querySelectorAll('.bend-handle').forEach((el) => el.remove());
    if (!selectedEdgeId) {
      this.#selectedBend = null;
      return;
    }

    const pts = this.#getEdgeWaypoints(selectedEdgeId);
    for (let i = 1; i < pts.length - 1; i++) {
      const pt = pts[i]!;
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      handle.setAttribute('cx', String(pt.x));
      handle.setAttribute('cy', String(pt.y));
      handle.setAttribute('r', '5');
      handle.setAttribute('class', 'bend-handle');
      handle.setAttribute('data-bend-index', String(i));
      handle.setAttribute('data-edge-idx', String(selectedEdgeId.idx));
      handle.setAttribute('data-edge-version', String(selectedEdgeId.version));
      handle.setAttribute('fill', '#4a9eff');
      handle.setAttribute('stroke', '#fff');
      handle.setAttribute('stroke-width', '1.5');
      handle.style.cursor = 'move';
      handle.style.pointerEvents = 'all';
      this.#viewer.appendChild(handle);
    }
  }

  /**
   * DragSession onMove callback for bend drag — live-commits on every pointermove.
   */
  #bendOnMove(e: PointerEvent, state: BendDragState): BendDragState {
    const doc = clientToDoc(this.#viewer, e.clientX, e.clientY);
    const snapped = this.#snapToGrid(doc.x, doc.y);
    const r = this.#session.moveBend(state.edgeId, state.bendIndex, snapped.x, snapped.y);
    if (!r.ok) this.#onError(r.error);
    return { ...state, currentBend: snapped };
  }

  /**
   * Read waypoints for an edge from the scene.
   * Mirrors editor.ts:#getEdgeWaypoints.
   */
  #getEdgeWaypoints(edgeId: SlotmapId): Array<{ x: number; y: number }> {
    const v = findEdgeVariant(this.#sceneProvider(), edgeId);
    if (!v) return [];

    // Line variant: from/to only (no waypoints)
    const from = v['from'] as { x?: number; y?: number } | undefined;
    const to = v['to'] as { x?: number; y?: number } | undefined;
    if (from && to) return [{ x: from.x ?? 0, y: from.y ?? 0 }, { x: to.x ?? 0, y: to.y ?? 0 }];

    // Path variant: points[]
    const points = v['points'] as Array<{ x?: number; y?: number }> | undefined;
    if (points && points.length > 0) return points.map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 }));

    return [];
  }

  /**
   * Read the coordinates of a specific bend waypoint.
   */
  #readBendCoords(edgeId: SlotmapId, bendIndex: number): { x: number; y: number } | null {
    const pts = this.#getEdgeWaypoints(edgeId);
    return pts[bendIndex] ?? null;
  }

  /**
   * Get the currently selected bend, if any.
   * Used by the Delete key handler to remove the selected bend.
   */
  getSelectedBend(): { edgeId: SlotmapId; bendIndex: number } | null {
    return this.#selectedBend;
  }

  /** Clean up event listeners and DOM. Call when editor is detached. */
  dispose(): void {
    this.#bendDragSession.dispose();
    this.detach();
    this.#selectedBend = null;
    this.#viewer.querySelectorAll('.bend-handle').forEach((el) => el.remove());
  }
}
