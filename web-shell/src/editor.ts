import type { DiagramEngineSession } from './session.js';
import type {
  ResolvedStyle,
  SlotmapId,
  ScenePage,
  Vertex,
  GlassConfig,
  GradientConfig,
  EngineError,
  Result,
  SelectionTarget,
  SelectionModifiers,
} from './types.js';
import { parseSlotmapAttr, slotmapIdToField } from './types.js';
import { sceneGeometry, sceneBounds, findAllShapeIds, findShapeVariant, findAllBounds, findAllShapesWithBounds, extractIdFromElem, findShapeIdAtPoint, perimeterNormalized, classifyAnchorFromNormalized, clientToDoc } from './scene-bounds.js';
import { showContextMenu, type ContextMenuItem } from './context-menu.js';
import { openMathEditDialog } from './math/math-dialog.js';
import { PortHandlesOverlay } from './port-handles.js';
import { ResizeHandlesOverlay } from './resize-handles.js';
import { BendHandlesOverlay } from './bend-handles.js';

/** Active tool from the palette. */
export type ToolKind =
  | 'rectangle'
  | 'rounded-rect'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'hexagon'
  | 'cylinder'
  | 'cloud'
  | 'parallelogram'
  | 'trapezoid'
  | 'polygon'
  | 'rectangle-stencil'
  | 'ellipse-stencil'
  | 'diamond-stencil'
  | 'triangle-stencil'
  | 'hexagon-stencil'
  | 'cylinder-stencil'
  | 'cloud-stencil'
  | 'parallelogram-stencil'
  | 'trapezoid-stencil'
  | 'blockArrow-stencil'
  | 'connector'
  | null;

/**
 * A registered hit zone for overlay pointer events (Pattern D 9a).
 * Zones are checked in registration order; the first matching zone handles the event.
 */
export interface OverlayHitZone {
  /** CSS selector to match against e.target. */
  selector: string;
  /**
   * Handler called when a pointerdown event matches this zone.
   * Return true to consume the event (stop propagation + prevent default).
   */
  handler: (target: Element, event: PointerEvent) => boolean;
}

/**
 * Narrow host surface overlays use to register pointer hit zones.
  * Editor implements this; overlays depend on the interface, not Editor.
  *
  * Bend handles are managed by BendHandlesOverlay (r109+), attached via
  * BendHandlesOverlay.attach(this) in the Editor constructor.
 */
export interface OverlayHost {
  /** Register an overlay's hit zone. Returns a disposer for symmetry. */
  registerOverlayHitZone(zone: OverlayHitZone): () => void;
}

/** Drag FSM state (single-shape drag). */
interface DragState {
  vertexId: SlotmapId;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

/** Move-area gesture state (MOVE-016). All shapes whose bounds intersect
 *  the rect swept by the drag are translated by the drag delta on release. */
interface MoveAreaState {
  /** Doc-space origin of the gesture (start of the drag). */
  originX: number;
  originY: number;
  /** Doc-space current pointer position (end of the drag, updated on
   *  pointermove). */
  currentX: number;
  currentY: number;
}

/** Marquee selection state. */
interface MarqueeState {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  /** 'select' adds to selection, 'deselect' removes from selection. */
  intent: 'select' | 'deselect';
  /** Containment filter: 'contain' = only shapes fully inside, 'intersect'
   *  = any shape that the box touches. Default draw.io mode is contain. */
  containment: 'contain' | 'intersect';
}

/** Connect-mode FSM state (drag-based edge creation with anchor resolution). */
interface ConnectState {
  sourceId: SlotmapId;
  /** Document-space position of source center for preview line. */
  sourceX: number;
  sourceY: number;
  /** Client-space X of the source click (for port computation). */
  sourceClientX: number;
  /** Client-space Y of the source click (for port computation). */
  sourceClientY: number;
  /** Source shape bounds for normalized anchor computation. */
  sourceBounds: { x: number; y: number; width: number; height: number };
  /**
   * IP-C: Modifier-driven connect mode (EDG-003..005).
   * - 'floating' (default): standard connect, anchor on target
   * - 'fixed-only': Shift held — only fixed connection points are valid targets
   * - 'anywhere': Alt held — anchor at any position on shape boundary
   * - 'ignore': Alt+Shift held (less common) — drop without connecting
   */
  mode: 'floating' | 'fixed-only' | 'anywhere' | 'ignore';
  /**
   * Document-level pointermove handler that updates the preview line endpoint
   * as the cursor moves between the source click and the target click. Added
   * when entering connect mode on the first click so click-click flows
   * (no drag) still get cursor tracking. Removed when leaving connect state.
   */
  previewMoveHandler?: (e: PointerEvent) => void;
}

/** Drag tracking for connect mode. */
interface ConnectDrag {
  sourceId: SlotmapId;
  sourceBounds: { x: number; y: number; width: number; height: number };
  startClientX: number;
  startClientY: number;
  moveHandler: (_e: PointerEvent) => void;
  upHandler: (_e: PointerEvent) => void;
}

/** Error callback type. */
type ErrorCallback = (_msg: string) => void;
/** State-change callback type (fired after every successful command). */
type StateChangeCallback = () => void;
/** Selection-change callback type (fired when selection changes). */
type SelectionChangeCallback = (_ids: SlotmapId[]) => void;
/** Tool-change callback type (fired when active tool changes). */
type ToolChangeCallback = (_tool: ToolKind) => void;

/** Inline text edit state — null when not editing. */
type TextEditState = {
  vertexId: SlotmapId;
  isEdge: boolean;
  input: HTMLInputElement;
  originalLabel: string;
} | null;

/**
 * Editor class: owns hit-testing, selection, drag FSM, and command construction.
 *
 * Invariants:
 * - Never imports `./wasm` — all mutations via session.executeCommand()
 * - Selection is ephemeral CSS-only (no DOM mutation of engine SVG)
 * - Drag commits MoveVertex on mouseup with absolute geometry
 */
export class Editor {
  readonly #session: DiagramEngineSession;
  readonly #viewer: HTMLElement;
  #selection: Set<SlotmapId> = new Set();
  #marquee: MarqueeState | null = null;
  #moveArea: MoveAreaState | null = null;
  #dragState: DragState | null = null;
  #activeTool: ToolKind = null;
  #connectState: ConnectState | null = null;
  #connectDrag: ConnectDrag | null = null;
  #previewLine: SVGSVGElement | null = null;
  #sceneCache: ScenePage[] = [];
  #activePageSlotId: SlotmapId | null = null;
  #activePageIdx = 0;
  #onError: ErrorCallback;
  #onStateChange: StateChangeCallback;
  #onSelectionChange: SelectionChangeCallback;
  #onToolChange: ToolChangeCallback;
  #getZoom: () => number;
  #zoomIn: (() => void) | null = null;
  #zoomOut: (() => void) | null = null;
  #resetZoom: (() => void) | null = null;
  #pan: ((_dx: number, _dy: number) => void) | null = null;
  #abortController: AbortController | null = null;

  // ─── Stencil Drag Preview ────────────────────────────────────────────────
  #stencilPreviewEl: SVGGElement | null = null;
  #stencilDragTool: string | null = null;

  // ─── Cursor Move Callback (rAF-throttled) ─────────────────────────────────
  #cursorMoveCb: ((_p: { x: number; y: number }) => void) | null = null;
  #cursorMoveRafId: number | null = null;

  // ─── Snap ────────────────────────────────────────────────────────────────
  #snapEnabled: boolean = false;
  #snapThreshold: number = 8;

  // ─── Inline Text Edit ─────────────────────────────────────────────────────
  #textEdit: TextEditState = null;

  get isTextEditing(): boolean {
    return this.#textEdit !== null;
  }

  // ─── Group Drill-Down FSM ────────────────────────────────────────────────
  /** Tracks the pending group drill-down state entered via Alt+click on a group. */
  #drillDown: { groupId: SlotmapId; groupElement: Element } | null = null;

  /** Set zoom control callbacks for keyboard shortcuts. */
  setZoomCallbacks(opts: {
    zoomIn?: () => void;
    zoomOut?: () => void;
    resetZoom?: () => void;
    pan?: (_dx: number, _dy: number) => void;
  }): void {
    if (opts.zoomIn) this.#zoomIn = opts.zoomIn;
    if (opts.zoomOut) this.#zoomOut = opts.zoomOut;
    if (opts.resetZoom) this.#resetZoom = opts.resetZoom;
    if (opts.pan) this.#pan = opts.pan;
  }

  // ─── Edge / Bend Editing ───────────────────────────────────────────────────
  #selectedEdgeId: SlotmapId | null = null;
  #bendDrag: { edgeId: SlotmapId; bendIndex: number } | null = null;

  // ─── Overlay Hit Zone Registry (Pattern D 9a) ──────────────────────────────
  /**
   * Registered overlay hit zones. Each zone maps a CSS selector to a handler.
   * Used to route pointerdown events to overlay handlers without tight coupling.
   */
  readonly #overlayHitZones: OverlayHitZone[] = [];

  // ─── Port Handles Overlay ──────────────────────────────────────────────────
  readonly #portHandles: PortHandlesOverlay;

  // ─── Bend Handles Overlay ──────────────────────────────────────────────
  readonly #bendHandles: BendHandlesOverlay;

  // ─── Resize Handles Overlay ──────────────────────────────────────────────
  readonly #resizeHandles: ResizeHandlesOverlay;

  // Internal clipboard for copy/paste
  #clipboard: { vertices: Vertex[]; offset: number } | null = null;

  // IP-C: Style clipboard (Alt+C / Alt+V) and default style (Ctrl+Shift+D / Ctrl+Shift+R)
  // In-memory only, not persisted across page reloads. Same lifecycle as #clipboard.
  #styleClipboard: Record<string, unknown> | null = null;
  #defaultStyle: Record<string, unknown> | null = null;

  constructor(
    session: DiagramEngineSession,
    viewer: HTMLElement,
    onError?: ErrorCallback,
    onStateChange?: StateChangeCallback,
    onSelectionChange?: SelectionChangeCallback,
    onToolChange?: ToolChangeCallback,
    getZoom?: () => number,
  ) {
    this.#session = session;
    this.#viewer = viewer;
    this.#onError = onError ?? (() => {});
    this.#onStateChange = onStateChange ?? (() => {});
    this.#onSelectionChange = onSelectionChange ?? (() => {});
    this.#onToolChange = onToolChange ?? (() => {});
    this.#getZoom = getZoom ?? (() => 1);

    // Initialize port handles overlay
    this.#portHandles = new PortHandlesOverlay(viewer, () => this.#sceneCache, session);

    // Attach port handles via OverlayHost (Pattern D 9a)
    this.#portHandles.attach(this);

    // Initialize bend handles overlay
    const getSvgLayer = () => {
      const svgEl = viewer.querySelector('svg');
      if (!svgEl) throw new Error('SVG element not found in viewer');
      return svgEl as unknown as HTMLElement;
    };
    this.#bendHandles = new BendHandlesOverlay(
      viewer,
      () => this.#sceneCache,
      session,
      (x, y) => this.#snapToGrid(x, y),
      (msg) => this.#onError(msg),
      (edgeId, _bendIndex) => {
        this.#selectedEdgeId = edgeId;
      },
    );
    this.#bendHandles.attach(this);

    // Initialize resize handles overlay — use SVG element so handles are in SVG coordinate space
    // Note: we must look up the SVG dynamically because mountSvg replaces viewer.innerHTML
    this.#resizeHandles = new ResizeHandlesOverlay(
      viewer,
      getSvgLayer as () => HTMLElement,
      () => this.#sceneCache,
      (id, geom) => this.setVertexGeometry(id, geom),
      (id, angleDelta) => {
        // Single-shape rotation: delegate directly to the engine command.
        // No need to check selection — rotation handles only appear on
        // single-selected shapes (multi-select hides them).
        this.#session.rotateVertex(id, angleDelta);
        this.#replay();
      },
    );

    // Attach resize handles via OverlayHost (Pattern D 9c)
    this.#resizeHandles.attach(this);
  }

  // ─── Public Selection API ──────────────────────────────────────────────────

  /**
   * Current selection as an array.
   * Backward-compat: returns null when selection is empty for code expecting SlotmapId|null.
   */
  get selection(): readonly SlotmapId[] {
    // Return empty array for null-compatible backward compat
    return Array.from(this.#selection);
  }

  /** Check if an id is currently selected (deep equality). */
  isSelected(id: SlotmapId): boolean {
    return this.#selectionIds().some((s) => s.idx === id.idx && s.version === id.version);
  }

  /** Replace selection with a single id. */
  selectOnly(id: SlotmapId): void {
    this.#applySelection(new Set([id]));
  }

  /** Add an id to the current selection. */
  addToSelection(id: SlotmapId): void {
    if (this.isSelected(id)) return;
    const next = new Set(this.#selection);
    next.add(id);
    this.#applySelection(next);
  }

  /** Remove an id from the current selection. */
  removeFromSelection(id: SlotmapId): void {
    const next = new Set(this.#selection);
    for (const s of next) {
      if (s.idx === id.idx && s.version === id.version) {
        next.delete(s);
        break;
      }
    }
    this.#applySelection(next);
  }

  /** Toggle an id in the selection. */
  toggleSelection(id: SlotmapId): void {
    const next = new Set(this.#selection);
    let found = false;
    let foundKey: SlotmapId | null = null;
    for (const s of next) {
      if (s.idx === id.idx && s.version === id.version) {
        foundKey = s;
        found = true;
        break;
      }
    }
    if (found && foundKey) {
      next.delete(foundKey);
    } else {
      next.add(id);
    }
    this.#applySelection(next);
  }

  /** Clear all selection. */
  clearSelection(): void {
    this.#applySelection(new Set());
  }

  // ─── Engine-Backed Selection (Slice 3) ──────────────────────────────────────

  /**
   * Resolve a click point + modifiers into an engine-owned SelectionTarget.
   *
   * Uses the engine's scene hit-testing and SelectionService to apply
   * the correct selection semantics (SEL-015, SEL-016).
   *
   * @param x Document-space X coordinate
   * @param y Document-space Y coordinate
   * @param modifiers Keyboard modifiers
   * @returns The resolved SelectionTarget, or null on error
   */
  resolveSelection(
    x: number,
    y: number,
    modifiers: SelectionModifiers,
  ): SelectionTarget | null {
    const result = this.#session.resolveSelection(x, y, modifiers);
    if (!result.ok) {
      this.#onError(result.error);
      return null;
    }
    return result.value;
  }

  /**
   * Convert an engine SelectionTarget to a SlotmapId for DOM selection.
   *
   * Engine targets carry typed IDs (Vertex/Group/Edge with {idx, version}),
   * while DOM selection uses SlotmapId format.
   *
   * Returns null if the target is 'None' or has an unknown type.
   */
  #engineTargetToSlotmapId(target: SelectionTarget): SlotmapId | null {
    switch (target.type) {
      case 'Vertex':
      case 'Group':
      case 'Edge':
        // The id field is already a SlotmapId-compatible {idx, version}
        return target.id;
      case 'None':
      default:
        return null;
    }
  }

  /**
   * Select an engine-owned target via the engine's selection model.
   * After engine selection, updates DOM selection state.
   *
   * @param target The SelectionTarget to select
   */
  selectTarget(target: SelectionTarget): void {
    const result = this.#session.selectTarget(target);
    if (!result.ok) {
      this.#onError(result.error);
      return;
    }
    // Use typed DOM selection so Group/Edge targets get correct attribute
    this.#applyTarget(target);
  }

  /**
   * Clear engine selection and DOM selection.
   */
  clearSelectionEngine(): void {
    const result = this.#session.clearSelection();
    if (!result.ok) {
      this.#onError(result.error);
      return;
    }
    this.#applySelection(new Set());
  }

  /** Replace selection with multiple ids. */
  selectMany(ids: SlotmapId[]): void {
    this.#applySelection(new Set(ids));
  }

  /**
   * Apply selection by marquee rect, filtering by containment mode.
   * - 'contain': only shapes whose bounds are fully inside the rect.
   * - 'intersect': any shape the rect touches (Alt modifier).
   * Implements SEL-005 (Alt = intersect) and the default Shift+drag = contain
   * marquee behavior in draw.io.
   */
  #applySelectInRect(
    rect: { x: number; y: number; width: number; height: number },
    containment: 'contain' | 'intersect',
  ): void {
    const ids =
      containment === 'contain'
        ? this.#getContainingIds(rect)
        : this.#getIntersectingIds(rect);
    this.#applySelection(new Set(ids));
  }

  /**
   * Remove selection by marquee rect, filtering by containment mode.
   * Implements SEL-006 (Alt+Shift+drag = deselect by intersection).
   */
  #applyDeselectInRect(
    rect: { x: number; y: number; width: number; height: number },
    containment: 'contain' | 'intersect',
  ): void {
    const ids =
      containment === 'contain'
        ? this.#getContainingIds(rect)
        : this.#getIntersectingIds(rect);
    const next = new Set(this.#selection);
    for (const id of ids) {
      next.delete(id);
    }
    this.#applySelection(next);
  }

  /**
   * Public wrapper preserved for the SEL-006 regression test: removes
   * currently-selected shapes whose bounds intersect the given rect.
   * Uses the intersect mode (matches the pre-SEL-005 behavior).
   */
  selectInRect(rect: { x: number; y: number; width: number; height: number }): void {
    this.#applySelectInRect(rect, 'intersect');
  }

  /**
   * Public wrapper preserved for the SEL-006 regression test: removes
   * currently-selected shapes whose bounds intersect the given rect.
   * Uses the intersect mode (matches the pre-SEL-005 behavior).
   */
  deselectInRect(rect: { x: number; y: number; width: number; height: number }): void {
    this.#applyDeselectInRect(rect, 'intersect');
  }

  /**
   * Get all shape SlotmapIds at a given document-space point, in z-order
   * (top of stack first). Used by Alt+click underneath to cycle through
   * overlapping shapes (SEL-014).
   */
  #getIdsAtPoint(x: number, y: number): SlotmapId[] {
    const all = findAllShapesWithBounds(this.#sceneCache);
    return all
      .filter(({ bounds }) => x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height)
      .map(({ id }) => id);
  }

  /**
   * Get the IDs of all shapes on the active page in DOM/z-order (top first).
   * Used by Tab/Shift+Tab to cycle selection (SEL-012).
   */
  #getAllShapeIdsZOrder(): SlotmapId[] {
    return findAllShapeIds(this.#sceneCache);
  }

  /**
   * Get the IDs of all edges on the active page.
   * Used by Ctrl+E "select all connectors" (SEL-009).
   */
  #getAllEdgeIds(): SlotmapId[] {
    const result: SlotmapId[] = [];
    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        const edge = e['Edge'] as Record<string, unknown> | undefined;
        if (!edge) continue;
        const idField = edge['id'] as { idx?: number; version?: number } | undefined;
        if (!idField) continue;
        result.push({ idx: idField.idx!, version: idField.version! });
      }
    }
    return result;
  }

  // ─── Batch Operations ──────────────────────────────────────────────────────

  /**
   * Move all selected shapes by (dx, dy).
   * Dispatches one MoveVertex per shape in a single transaction.
   */
  moveSelection(dx: number, dy: number): void {
    if (this.#selection.size === 0) return;

    const commands: string[] = [];
    for (const id of this.#selection) {
      const orig = sceneGeometry(this.#sceneCache, id);
      if (!orig) continue;
      // Carry rotation/flip/relative through. Without these, the engine's
      // MoveVertex deserializer fails with "missing field `rotation`" and
      // the move silently does nothing.
      const newGeom = {
        x: orig.x + dx,
        y: orig.y + dy,
        width: orig.width,
        height: orig.height,
        rotation: orig.rotation,
        flip_h: orig.flip_h,
        flip_v: orig.flip_v,
        relative: orig.relative,
      };
      commands.push(this.#buildMoveVertexCmd(id, newGeom));
    }

    if (commands.length === 0) return;
    this.#session.executeCommands(commands);
    this.#replay();
  }

  /**
   * Delete all selected shapes.
   * Dispatches one RemoveVertex per shape.
   */
  deleteSelection(): void {
    if (this.#selection.size === 0) return;

    const commands: string[] = [];
    for (const id of this.#selection) {
      commands.push(this.#buildRemoveVertexCmd(id));
    }
    this.#session.executeCommands(commands);
    this.#selection.clear();
    this.#notifySelectionChange();
    this.#replay();
  }

  /**
   * Copy all selected shapes to internal clipboard.
   */
  copySelection(): void {
    const vertices: Vertex[] = [];
    for (const id of this.#selection) {
      const v = this.#getVertex(id);
      if (v) vertices.push(this.#deepCloneVertex(v));
    }
    this.#clipboard = { vertices, offset: 0 };
  }

  /**
   * Cut selection: copy then delete.
   */
  cutSelection(): void {
    this.copySelection();
    this.deleteSelection();
  }

  /**
   * Paste clipboard contents with 20px offset per paste.
   * Re-selects pasted shapes.
   */
  paste(): SlotmapId[] {
    if (!this.#clipboard || this.#clipboard.vertices.length === 0) return [];

    this.#clipboard.offset += 20;
    const pastedIds: SlotmapId[] = [];

    for (const vertex of this.#clipboard.vertices) {
      const newGeom = {
        x: vertex.geometry.x + this.#clipboard.offset,
        y: vertex.geometry.y + this.#clipboard.offset,
        width: vertex.geometry.width,
        height: vertex.geometry.height,
      };
      const cmd = this.#buildAddVertexFromVertexCmd(vertex, newGeom);
      const r = this.#session.executeCommand(cmd);
      if (!r.ok) {
        this.#onError(r.error);
        continue;
      }
      // The command succeeds but we don't get back the new ID directly from executeCommand.
      // We need to find the newly created vertex by looking at scene after replay.
      // For now, we'll select based on position matching.
    }

    this.#replay();

    // Find pasted shapes by matching offset position
    // After replay, find vertices that match clipboard positions + offset
    for (const vertex of this.#clipboard.vertices) {
      const targetX = vertex.geometry.x + this.#clipboard.offset;
      const targetY = vertex.geometry.y + this.#clipboard.offset;
      const found = this.#findVertexAt(targetX, targetY);
      if (found) pastedIds.push(found);
    }

    if (pastedIds.length > 0) {
      this.#applySelection(new Set(pastedIds));
    }

    return pastedIds;
  }

  // ─── IP-C: Style Clipboard (Alt+C / Alt+V) ───────────────────────────────

  /**
   * Copy the current selection's first shape's style to the in-memory style
   * clipboard. Draw.io parity: STYL-005. Replaces any previous clipboard
   * contents. System clipboard is NOT touched.
   */
  copyStyle(): boolean {
    if (this.#selection.size === 0) return false;
    const firstId = this.#selection.values().next().value as SlotmapId;
    const vertex = this.#getVertex(firstId);
    if (!vertex) return false;
    // Store a defensive copy so later mutations to the scene don't affect us
    this.#styleClipboard = JSON.parse(JSON.stringify(vertex.style));
    return true;
  }

  /**
   * Paste the in-memory style clipboard to all selected shapes. Atomic
   * transaction. Draw.io parity: STYL-006. Clipboard is NOT cleared
   * (so multiple pastes reuse the same style).
   */
  pasteStyle(): boolean {
    if (!this.#styleClipboard || this.#selection.size === 0) return false;
    const style = this.#styleClipboard;
    const commands: string[] = [];
    for (const id of this.#selection) {
      commands.push(
        JSON.stringify({
          ChangeStyle: {
            id: slotmapIdToField(id),
            style,
          },
        }),
      );
    }
    if (commands.length === 0) return false;
    this.executeTransaction(commands);
    this.#replay();
    return true;
  }

  /**
   * Get the current style clipboard (for tests/UI). Returns null if empty.
   */
  getStyleClipboard(): Record<string, unknown> | null {
    return this.#styleClipboard;
  }

  // ─── IP-C: Default Style (Ctrl+Shift+D / Ctrl+Shift+R) ────────────────────

  /**
   * Set the editor's default style from the first selected shape. Draw.io
   * parity: STYL-003. Multi-selection is a no-op (draw.io convention).
   */
  /**
   * IP-E: Set the editor + engine default style from the first selected shape.
   * Persists to the engine so it survives file reloads.
   */
  setDefaultStyle(): boolean {
    if (this.#selection.size !== 1) return false;
    const firstId = this.#selection.values().next().value as SlotmapId;
    const vertex = this.#getVertex(firstId);
    if (!vertex) return false;
    const style = JSON.parse(JSON.stringify(vertex.style));
    this.#defaultStyle = style;
    // IP-E: persist to engine for cross-reload durability
    const cmd = JSON.stringify({
      SetDefaultStyle: { style },
    });
    this.executeTransaction([cmd]);
    this.#replay();
    return true;
  }

  /**
   * IP-E: Clear the editor + engine default style. Returns null
   * to draw.io original (white fill, black outline).
   */
  clearDefaultStyle(): void {
    this.#defaultStyle = null;
    // IP-E: persist to engine
    const cmd = JSON.stringify({
      SetDefaultStyle: { style: null },
    });
    this.executeTransaction([cmd]);
    this.#replay();
  }

  /**
   * Get the current default style (for the sidebar/inspector and tests).
   * Returns null if no default is set (use draw.io original).
   */
  getDefaultStyle(): Record<string, unknown> | null {
    return this.#defaultStyle;
  }

  /**
   * Insert a math formula at the center of the canvas.
   * Creates a rectangle with the LaTeX text as its label.
   * The caller is responsible for ensuring the page has math_enabled=true
   * so that the math overlay will render the KaTeX output.
   */
  insertMathFormula(latex: string): void {
    const svgEl = this.#viewer.querySelector('svg');
    const cx = svgEl ? parseFloat(svgEl.getAttribute('width') ?? '800') / 2 : 400;
    const cy = svgEl ? parseFloat(svgEl.getAttribute('height') ?? '600') / 2 : 300;

    const cmd = this.#buildAddVertexCmd('Rectangle', cx - 60, cy - 40, latex);
    const r = this.#session.executeCommand(cmd);
    if (!r.ok) {
      this.#onError(r.error);
    } else {
      this.#replay();
    }
  }

  /** Select all shapes in the current page. */
  selectAll(): void {
    const allIds = findAllShapeIds(this.#sceneCache);
    this.#applySelection(new Set(allIds));
  }

  /**
   * Rotate all selected shapes by the given angle delta (radians).
   * Dispatches one RotateVertex per shape in a single transaction.
   */
  rotateSelection(angleDelta: number): void {
    if (this.#selection.size === 0) return;

    const commands: string[] = [];
    for (const id of this.#selection) {
      commands.push(
        JSON.stringify({
          RotateVertex: {
            id: slotmapIdToField(id),
            angle_delta: angleDelta,
          },
        }),
      );
    }

    this.#session.executeCommands(commands);
    this.#replay();
  }

  /**
   * Flip all selected shapes along the given axis.
   * Dispatches one FlipVertex per shape in a single transaction.
   */
  flipSelection(axis: 'horizontal' | 'vertical'): void {
    if (this.#selection.size === 0) return;

    const axisValue = axis === 'horizontal' ? 'Horizontal' : 'Vertical';
    const commands: string[] = [];
    for (const id of this.#selection) {
      commands.push(
        JSON.stringify({
          FlipVertex: {
            id: slotmapIdToField(id),
            axis: axisValue,
          },
        }),
      );
    }

    this.#session.executeCommands(commands);
    this.#replay();
  }

  // ─── Z-Order Operations ───────────────────────────────────────────────────

  /**
   * Bring all selected shapes to the front (top of z-order).
   * Dispatches BringToFront per shape via executeTransaction (atomic, single undo).
   */
  bringToFront(): void {
    this.#dispatchZOrder('BringToFront');
  }

  /**
   * Send all selected shapes to the back (bottom of z-order).
   * Dispatches SendToBack per shape via executeTransaction (atomic, single undo).
   */
  sendToBack(): void {
    this.#dispatchZOrder('SendToBack');
  }

  /**
   * Bring all selected shapes one step forward in z-order.
   * Dispatches BringForward per shape via executeTransaction (atomic, single undo).
   */
  bringForward(): void {
    this.#dispatchZOrder('BringForward');
  }

  /**
   * Send all selected shapes one step backward in z-order.
   * Dispatches SendBackward per shape via executeTransaction (atomic, single undo).
   */
  sendBackward(): void {
    this.#dispatchZOrder('SendBackward');
  }

  /**
   * Dispatch a z-order command for all selected shapes.
   * @param commandName - One of 'BringToFront' | 'SendToBack' | 'BringForward' | 'SendBackward'
   */
  #dispatchZOrder(
    commandName: 'BringToFront' | 'SendToBack' | 'BringForward' | 'SendBackward',
  ): void {
    if (this.#selection.size === 0) return;

    const commands: string[] = [];
    for (const id of this.#selection) {
      commands.push(
        JSON.stringify({
          [commandName]: { target: { kind: 'Vertex', ...slotmapIdToField(id) } },
        }),
      );
    }

    const result = this.#session.executeTransaction(commands);
    if (!result.ok) {
      this.#onError(result.error);
      return;
    }
    this.#replay();
  }

  /**
   * Execute an array of commands atomically as a single transaction.
   * On success, one undo entry is pushed; on error all commands are rolled back.
   * Empty array is a no-op (no undo entry, no error).
   */
  executeTransaction(commands: string[]): void {
    const result = this.#session.executeTransaction(commands);
    if (!result.ok) {
      this.#onError(result.error);
      return;
    }
    this.#replay();
  }

  // ─── Arrange Operations ──────────────────────────────────────────────────

  /**
   * Align all selected shapes along the specified edge or center.
   * Requires at least 2 selected shapes.
   * Dispatches MoveVertex commands via executeTransaction for atomic undo.
   */
  alignSelection(mode: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'): void {
    if (this.#selection.size < 2) return;

    const ids = Array.from(this.#selection);
    const bounds = ids
      .map((id) => ({ id, geom: sceneGeometry(this.#sceneCache, id) }))
      .filter(
        (
          b,
        ): b is { id: SlotmapId; geom: { x: number; y: number; width: number; height: number; rotation: number; flip_h: boolean; flip_v: boolean; relative: boolean } } =>
          b.geom !== null,
      );

    if (bounds.length < 2) return;

    // Anchor = first selected shape (bounds[0], not moved).
    // Target = collective bounding-box edge/center of the full selection.
    // This matches draw.io/Figma semantics: "align left" → all shapes share the
    // same left edge as the leftmost shape in the group (which may or may not be
    // the first-selected, depending on selection order).
    const minX = Math.min(...bounds.map((b) => b.geom.x));
    const maxX = Math.max(...bounds.map((b) => b.geom.x + b.geom.width));
    const minY = Math.min(...bounds.map((b) => b.geom.y));
    const maxY = Math.max(...bounds.map((b) => b.geom.y + b.geom.height));
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const commands: string[] = bounds.slice(1).map((b) => {
      const newGeom = { ...b.geom };
      switch (mode) {
        case 'left':
          newGeom.x = minX;
          break;
        case 'center-h':
          newGeom.x = midX - b.geom.width / 2;
          break;
        case 'right':
          newGeom.x = maxX - b.geom.width;
          break;
        case 'top':
          newGeom.y = minY;
          break;
        case 'center-v':
          newGeom.y = midY - b.geom.height / 2;
          break;
        case 'bottom':
          newGeom.y = maxY - b.geom.height;
          break;
      }
      return this.#buildMoveVertexCmd(b.id, newGeom);
    });

    if (commands.length > 0) {
      this.executeTransaction(commands);
    }
  }

  /**
   * Distribute selected shapes evenly along an axis.
   * Requires at least 3 selected shapes. First and last shapes stay fixed.
   * Dispatches MoveVertex commands via executeTransaction for atomic undo.
   */
  distributeSelection(axis: 'horizontal' | 'vertical'): void {
    if (this.#selection.size < 3) return;

    const ids = Array.from(this.#selection);
    const bounds = ids
      .map((id) => ({ id, geom: sceneGeometry(this.#sceneCache, id) }))
      .filter(
        (
          b,
        ): b is { id: SlotmapId; geom: { x: number; y: number; width: number; height: number; rotation: number; flip_h: boolean; flip_v: boolean; relative: boolean } } =>
          b.geom !== null,
      );

    if (bounds.length < 3) return;

    // Sort by coordinate along the axis.
    // Extremes (first/last in sorted order) stay fixed; middle shapes are distributed.
    const sorted = [...bounds].sort((a, b) =>
      axis === 'horizontal' ? a.geom.x - b.geom.x : a.geom.y - b.geom.y,
    );

    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;

    if (axis === 'horizontal') {
      const totalSpan = last.geom.x - first.geom.x;
      const gap =
        (totalSpan - (last.geom.x + last.geom.width - first.geom.x - first.geom.width)) /
        (sorted.length - 1);
      const commands: string[] = [];
      let cursor = first.geom.x + first.geom.width + gap;
      for (let i = 1; i < sorted.length - 1; i++) {
        const b = sorted[i]!;
        const newGeom = { ...b.geom };
        newGeom.x = cursor;
        commands.push(this.#buildMoveVertexCmd(b.id, newGeom));
        cursor += b.geom.width + gap;
      }
      if (commands.length > 0) {
        this.executeTransaction(commands);
      }
    } else {
      const totalSpan = last.geom.y - first.geom.y;
      const gap =
        (totalSpan - (last.geom.y + last.geom.height - first.geom.y - first.geom.height)) /
        (sorted.length - 1);
      const commands: string[] = [];
      let cursor = first.geom.y + first.geom.height + gap;
      for (let i = 1; i < sorted.length - 1; i++) {
        const b = sorted[i]!;
        const newGeom = { ...b.geom };
        newGeom.y = cursor;
        commands.push(this.#buildMoveVertexCmd(b.id, newGeom));
        cursor += b.geom.height + gap;
      }
      if (commands.length > 0) {
        this.executeTransaction(commands);
      }
    }
  }

  /**
   * Resize selected shapes to match the anchor (first-selected) shape's dimensions.
   * Requires at least 2 selected shapes.
   * Dispatches MoveVertex commands via executeTransaction for atomic undo.
   */
  sameSizeSelection(what: 'width' | 'height' | 'both'): void {
    if (this.#selection.size < 2) return;

    const ids = Array.from(this.#selection);
    const bounds = ids
      .map((id) => ({ id, geom: sceneGeometry(this.#sceneCache, id) }))
      .filter(
        (
          b,
        ): b is { id: SlotmapId; geom: { x: number; y: number; width: number; height: number; rotation: number; flip_h: boolean; flip_v: boolean; relative: boolean } } =>
          b.geom !== null,
      );

    if (bounds.length < 2) return;

    // Anchor is the first shape in Set iteration order
    const anchor = bounds[0]!;

    const commands: string[] = bounds.slice(1).map((b) => {
      const newGeom = { ...b.geom };
      if (what === 'width' || what === 'both') {
        newGeom.width = anchor.geom.width;
      }
      if (what === 'height' || what === 'both') {
        newGeom.height = anchor.geom.height;
      }
      return this.#buildMoveVertexCmd(b.id, newGeom);
    });

    if (commands.length > 0) {
      this.executeTransaction(commands);
    }
  }

  /**
   * Group selected vertices into a new container group.
   * Requires at least 2 selected vertices.
   * Uses the session's groupVertices method.
   */
  groupSelection(): void {
    if (this.#selection.size < 2) return;
    const ids = Array.from(this.#selection);
    const result = this.#session.groupVertices(ids);
    if (!result.ok) {
      this.#onError(result.error);
      return;
    }
    this.#replay();
  }

  /**
   * Ungroup the selected vertex by removing it from its parent group.
   * Requires exactly 1 selected vertex that has a parent group.
   * Uses the session's ungroupVertices method.
   */
  ungroupSelection(): void {
    if (this.#selection.size !== 1) return;
    const id = Array.from(this.#selection)[0]!;
    const result = this.#session.ungroupVertices(id);
    if (!result.ok) {
      this.#onError(result.error);
      return;
    }
    this.#replay();
  }

  // ─── IP-D: Lock + Link helpers (style-only mutations) ────────────────────

  /** Returns true if the shape's `locked` cell-style key is "1" or true. */
  isShapeLocked(id: SlotmapId): boolean {
    const variant = findShapeVariant(this.#sceneCache, id);
    if (!variant) return false;
    const style = (variant['style'] as Record<string, unknown> | undefined) ?? {};
    const locked = style['locked'];
    return locked === '1' || locked === 1 || locked === true;
  }

  /** Toggle the shape's `locked` cell-style key. */
  toggleShapeLock(id: SlotmapId): void {
    const currentlyLocked = this.isShapeLocked(id);
    const newStyle = { locked: currentlyLocked ? null : '1' };
    const cmd = JSON.stringify({
      ChangeStyle: { id: slotmapIdToField(id), style: newStyle },
    });
    this.executeTransaction([cmd]);
    this.#replay();
  }

  /** Returns true if the edge's `locked` cell-style key is "1" or true. */
  isEdgeLocked(id: SlotmapId): boolean {
    const variant = this.#findEdgeById(id);
    if (!variant) return false;
    const style = (variant['style'] as Record<string, unknown> | undefined) ?? {};
    const locked = style['locked'];
    return locked === '1' || locked === 1 || locked === true;
  }

  /** Toggle the edge's `locked` cell-style key. */
  toggleEdgeLock(id: SlotmapId): void {
    const currentlyLocked = this.isEdgeLocked(id);
    const newStyle = { locked: currentlyLocked ? null : '1' };
    const cmd = JSON.stringify({
      ChangeStyle: { id: slotmapIdToField(id), style: newStyle },
    });
    this.executeTransaction([cmd]);
    this.#replay();
  }

  /** Get the `link` cell-style value for a shape (or empty string). */
  getShapeLink(id: SlotmapId): string {
    const variant = findShapeVariant(this.#sceneCache, id);
    if (!variant) return '';
    const style = (variant['style'] as Record<string, unknown> | undefined) ?? {};
    const link = style['link'];
    return typeof link === 'string' ? link : '';
  }

  /** Set the `link` cell-style value for a shape. Empty string clears it. */
  setShapeLink(id: SlotmapId, url: string): void {
    const newStyle = url === '' ? { link: null } : { link: url };
    const cmd = JSON.stringify({
      ChangeStyle: { id: slotmapIdToField(id), style: newStyle },
    });
    this.executeTransaction([cmd]);
    this.#replay();
  }

  /** Find an edge variant in the scene cache by its SlotmapId. */
  #findEdgeById(id: SlotmapId): Record<string, unknown> | null {
    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        const edge = e['Edge'] as Record<string, unknown> | undefined;
        if (!edge) continue;
        const idField = edge['id'] as { idx?: number; version?: number } | undefined;
        if (
          idField &&
          idField.idx === id.idx &&
          idField.version === id.version
        ) {
          return edge;
        }
      }
    }
    return null;
  }

  /**
   * Apply a layout algorithm to the current page.
   * @param kind Layout kind: "Organic", "Tree", "Hierarchical", "Circular", "Grid"
   * @param config Optional layout-specific configuration
   */
  /**
   * Apply a layout algorithm to the current page.
   * @param kind Layout kind: "Organic", "Tree", "Hierarchical", "Circular", "Grid"
   * @param config Optional layout-specific configuration
   * @returns `Result<void, EngineError>` — propagates WASM errors instead of swallowing them.
   *          Callers must surface failures via diagnostics, otherwise they get hidden in the UI.
   */
  applyLayout(kind: string, config: object = {}): Result<void, EngineError> {
    // HierarchicalLayout uses a separate WASM export because it mutates the store in-place
    if (kind === 'Hierarchical') {
      return this.#session.applyHierarchicalLayout(config);
    }
    return this.#session.applyLayout(kind, config);
  }

  /**
   * Re-route all edges on the current page using orthogonal routing.
   *
   * After moving vertices, edges retain their old waypoints. This function recomputes
   * orthogonal routes for all edges on the first page and commits the results as a
   * single atomic transaction (one undo reverts all).
   *
   * Errors are surfaced through `#onError` (which funnels into the diagnostics
   * surface). Returns `Result<void, EngineError>` for callers that want to
   * propagate explicitly.
   */
  routeAllEdges(): Result<void, EngineError> {
    const result = this.#session.routeAllEdges();
    if (!result.ok) {
      this.#onError(result.error);
      return result;
    }
    this.#replay();
    return result;
  }

  /**
   * Insert a Z-bend into an edge at a click position on the given segment.
   *
   * Errors from `session.insertBend` are surfaced via `#onError`. Returns
   * `Result<void, EngineError>` for callers that want to propagate explicitly.
   */
  insertBend(edgeId: SlotmapId, segmentIndex: number, x: number, y: number): Result<void, EngineError> {
    const result = this.#session.insertBend(edgeId, segmentIndex, x, y);
    if (!result.ok) {
      this.#onError(result.error);
      return result;
    }
    this.#replay();
    return result;
  }

  /**
   * Move an existing bend point to a new position. Returns `Result<void, EngineError>`.
   */
  moveBend(edgeId: SlotmapId, bendIndex: number, x: number, y: number): Result<void, EngineError> {
    const result = this.#session.moveBend(edgeId, bendIndex, x, y);
    if (!result.ok) {
      this.#onError(result.error);
      return result;
    }
    this.#replay();
    return result;
  }

  /**
   * Remove a bend point from an edge. Returns `Result<void, EngineError>`.
   */
  removeBend(edgeId: SlotmapId, bendIndex: number): Result<void, EngineError> {
    const result = this.#session.removeBend(edgeId, bendIndex);
    if (!result.ok) {
      this.#onError(result.error);
      return result;
    }
    this.#replay();
    return result;
  }

  /**
   * IP-C EDG-015: Remove all bend points from the selected edge, returning
   * it to the shortest default path between source and target. Implemented
   * as a loop of `removeBend` calls (no native `setEdgeWaypoints` WASM
   * export yet — see IP-E for a single-shot engine command).
   */
  clearAllWaypoints(edgeId: SlotmapId): Result<void, EngineError> {
    // Loop: remove bend 0 until no more bends exist.
    // We bound the iterations to prevent infinite loops.
    for (let i = 0; i < 64; i++) {
      const r = this.#session.removeBend(edgeId, 0);
      if (!r.ok) {
        // No more bends, or some other error
        this.#replay();
        return { ok: true, value: undefined };
      }
    }
    this.#replay();
    return { ok: true, value: undefined };
  }

  /**
   * IP-E: Reverse the edge (swap source and target). Returns true on success.
   * Edge geometry (waypoints, label, style) is preserved.
   */
  reverseEdge(edgeId: SlotmapId): boolean {
    const cmd = JSON.stringify({
      ReverseEdge: { id: slotmapIdToField(edgeId) },
    });
    this.executeTransaction([cmd]);
    this.#replay();
    return true;
  }

  /**
   * IP-E: Flip the edge (reverse waypoint order). Returns true on success.
   * Source/target and style are preserved.
   */
  flipEdge(edgeId: SlotmapId): boolean {
    const cmd = JSON.stringify({
      FlipEdge: { id: slotmapIdToField(edgeId) },
    });
    this.executeTransaction([cmd]);
    this.#replay();
    return true;
  }

  // ─── Active Tool ──────────────────────────────────────────────────────────

  /** Current active tool. */
  get activeTool(): ToolKind {
    return this.#activeTool;
  }

  /** Set the active palette tool (single-placement mode). */
  setActiveTool(tool: ToolKind): void {
    // Cancel any active connect mode when switching tools
    if (this.#activeTool === 'connector' && tool !== 'connector') {
      this.#cancelConnect();
    }
    this.#activeTool = tool;
    this.#onToolChange(tool);
  }

  /**
   * Enter label placement mode: next click on canvas creates a text shape
   * and immediately opens it for text editing.
   * Composes: shape placement mode + on-place callback that calls #startTextEdit.
   */
  enterLabelPlacement(): void {
    // Set a flag so the next canvas click creates a label
    this.#labelPlacementActive = true;
    // Clear any active tool first
    this.setActiveTool(null);
  }

  // Internal flag for label placement mode
  #labelPlacementActive = false;

  /** Current active page index. */
  get activePageIdx(): number {
    return this.#activePageIdx;
  }

  set activePageIdx(idx: number) {
    this.#activePageIdx = idx;
  }

  // ─── Stencil Drag API ─────────────────────────────────────────────────────

  /**
   * Start a stencil drag operation: create a semi-transparent preview element
   * following the cursor.
   */
  startStencilDrag(tool: string, clientX: number, clientY: number): void {
    // Cancel any existing preview
    this.#cancelStencilPreview();
    this.#stencilDragTool = tool;

    // Build the SVG shape for the preview
    const shapeEl = this.#buildStencilShapeEl(tool);
    if (!shapeEl) return;

    // Create a <g> wrapper for the preview
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'stencil-preview');
    g.style.opacity = '0.7';
    g.style.pointerEvents = 'none';
    g.appendChild(shapeEl);

    this.#viewer.style.position = 'relative';
    this.#viewer.appendChild(g);
    this.#stencilPreviewEl = g;

    // Position at cursor
    this.updateStencilDragPreview(clientX, clientY);
  }

  /**
   * Update the stencil preview position to follow the cursor.
   */
  updateStencilDragPreview(clientX: number, clientY: number): void {
    if (!this.#stencilPreviewEl) return;
    const pos = this.#clientToDoc(clientX, clientY);
    this.#stencilPreviewEl.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
  }

  /**
   * End the stencil drag: if the drop is inside the canvas bounds,
   * create the vertex; otherwise cancel and remove the preview.
   */
  endStencilDrag(clientX: number, clientY: number): void {
    if (!this.#stencilPreviewEl || !this.#stencilDragTool) {
      this.#cancelStencilPreview();
      return;
    }

    const rect = this.#viewer.getBoundingClientRect();
    // Check if drop is within canvas bounds
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      // Outside canvas — cancel
      this.#cancelStencilPreview();
      return;
    }

    // Within bounds — create the vertex
    const pos = this.#clientToDoc(clientX, clientY);
    const tool = this.#stencilDragTool;

    const kindMap: Record<
      string,
      | 'Rectangle'
      | 'RoundedRect'
      | 'Ellipse'
      | 'Diamond'
      | 'Triangle'
      | 'Hexagon'
      | 'Cylinder'
      | 'Cloud'
      | 'Parallelogram'
      | 'Trapezoid'
      | 'Polygon'
      | 'RectangleStencil'
      | 'EllipseStencil'
      | 'DiamondStencil'
      | 'TriangleStencil'
      | 'HexagonStencil'
      | 'CylinderStencil'
      | 'CloudStencil'
      | 'ParallelogramStencil'
      | 'TrapezoidStencil'
      | 'BlockArrowStencil'
    > = {
      'rectangle-stencil': 'RectangleStencil',
      'ellipse-stencil': 'EllipseStencil',
      'diamond-stencil': 'DiamondStencil',
      'triangle-stencil': 'TriangleStencil',
      'hexagon-stencil': 'HexagonStencil',
      'cylinder-stencil': 'CylinderStencil',
      'cloud-stencil': 'CloudStencil',
      'parallelogram-stencil': 'ParallelogramStencil',
      'trapezoid-stencil': 'TrapezoidStencil',
      'blockArrow-stencil': 'BlockArrowStencil',
    };

    const kind = kindMap[tool] ?? 'RectangleStencil';
    const cmd = this.#buildAddVertexCmd(kind, pos.x, pos.y);
    const r = this.#session.executeCommand(cmd);
    if (!r.ok) {
      this.#onError(r.error);
    } else {
      this.#replay();
    }

    this.#cancelStencilPreview();
  }

  /** Cancel any active stencil preview without creating a shape. */
  #cancelStencilPreview(): void {
    if (this.#stencilPreviewEl) {
      this.#stencilPreviewEl.remove();
      this.#stencilPreviewEl = null;
    }
    this.#stencilDragTool = null;
  }

  /**
   * Build an SVG shape element for a given stencil tool.
   * Returns the shape element (rect, ellipse, polygon, or path).
   * Falls back to a generic placeholder rect for unknown tools.
   */
  #buildStencilShapeEl(tool: string): SVGElement | null {
    switch (tool) {
      case 'rectangle-stencil':
      case 'rectangle': {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', '2');
        rect.setAttribute('y', '2');
        rect.setAttribute('width', '28');
        rect.setAttribute('height', '20');
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', '#F8FAFC');
        rect.setAttribute('stroke-width', '1.5');
        return rect;
      }
      case 'ellipse-stencil':
      case 'ellipse': {
        const ell = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ell.setAttribute('cx', '16');
        ell.setAttribute('cy', '12');
        ell.setAttribute('rx', '14');
        ell.setAttribute('ry', '10');
        ell.setAttribute('fill', 'none');
        ell.setAttribute('stroke', '#F8FAFC');
        ell.setAttribute('stroke-width', '1.5');
        return ell;
      }
      case 'diamond-stencil':
      case 'diamond': {
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', '16,2 30,12 16,22 2,12');
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', '#F8FAFC');
        poly.setAttribute('stroke-width', '1.5');
        return poly;
      }
      case 'triangle-stencil':
      case 'triangle': {
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', '16,2 30,22 2,22');
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', '#F8FAFC');
        poly.setAttribute('stroke-width', '1.5');
        return poly;
      }
      case 'hexagon-stencil':
      case 'hexagon': {
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', '16,2 28,7 28,17 16,22 4,17 4,7');
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', '#F8FAFC');
        poly.setAttribute('stroke-width', '1.5');
        return poly;
      }
      case 'cylinder-stencil':
      case 'cylinder': {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute(
          'd',
          'M6,6 C6,3 10,2 16,2 C22,2 26,3 26,6 L26,18 C26,21 22,22 16,22 C10,22 6,21 6,18 Z',
        );
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#F8FAFC');
        path.setAttribute('stroke-width', '1.5');
        return path;
      }
      case 'cloud-stencil':
      case 'cloud': {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute(
          'd',
          'M8,18 C4,18 2,14 4,10 C4,6 8,4 12,6 C14,4 18,4 20,6 C24,6 28,10 26,14 C30,14 30,18 26,18 Z',
        );
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#F8FAFC');
        path.setAttribute('stroke-width', '1.5');
        return path;
      }
      case 'parallelogram-stencil':
      case 'parallelogram': {
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', '8,2 30,2 24,22 2,22');
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', '#F8FAFC');
        poly.setAttribute('stroke-width', '1.5');
        return poly;
      }
      case 'trapezoid-stencil':
      case 'trapezoid': {
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', '6,2 26,2 30,22 2,22');
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', '#F8FAFC');
        poly.setAttribute('stroke-width', '1.5');
        return poly;
      }
      case 'blockArrow-stencil':
      case 'blockArrow': {
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', '4,8 18,8 18,2 28,12 18,22 18,16 4,16');
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', '#F8FAFC');
        poly.setAttribute('stroke-width', '1.5');
        return poly;
      }
      default: {
        // Generic placeholder rect for unknown stencil tools
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', '2');
        rect.setAttribute('y', '2');
        rect.setAttribute('width', '28');
        rect.setAttribute('height', '20');
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', '#F8FAFC');
        rect.setAttribute('stroke-width', '1.5');
        return rect;
      }
    }
  }

  // ─── Cursor Move Callback ──────────────────────────────────────────────────

  /**
   * Register a callback that fires at most once per animation frame
   * whenever the pointer moves over the canvas.
   * Coordinates are in document space (accounting for zoom).
   */
  onCursorMove(cb: (_p: { x: number; y: number }) => void): void {
    this.#cursorMoveCb = cb;
  }

  // ─── Coordinate Conversion (public for HUD wiring) ────────────────────────

  /**
   * Convert screen client coordinates to document-space coordinates, accounting for zoom.
   */
  clientToDoc(clientX: number, clientY: number): { x: number; y: number } {
    return this.#clientToDoc(clientX, clientY);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Attach event listeners to the viewer container. */
  attach(): void {
    if (this.#abortController) return; // already attached
    this.#abortController = new AbortController();
    const signal = this.#abortController.signal;
    const opts = { signal };

    this.#viewer.addEventListener('pointerdown', (e) => this.#onPointerDown(e), opts);
    // Double-click on a shape enters inline text edit mode
    this.#viewer.addEventListener('dblclick', (e) => this.#onDblClick(e), opts);
    // Right-click context menu
    this.#viewer.addEventListener('contextmenu', (e) => this.#onContextMenu(e), opts);
    // keydown on the document to catch keyboard shortcuts
    document.addEventListener('keydown', (e) => this.#onKeyDown(e), opts);

    // Seed the scene cache so drag operations can find original geometry
    this.refreshScene();
  }

  /** Refresh scene cache from engine. Call after import or page switch. */
  refreshScene(): void {
    const sceneResult = this.#session.decodeSceneBuffer();
    if (sceneResult.ok) {
      this.#sceneCache = sceneResult.value;
      if (this.#sceneCache.length > 0) {
        const page = this.#sceneCache[this.#activePageIdx];
        if (page) {
          this.#activePageSlotId = page.page_id;
        }
      }
    }
  }

  /** Get scene cache for E2E debugging. */
  getSceneCache(): { ok: true; value: ScenePage[] } | { ok: false; error: string } {
    return { ok: true, value: this.#sceneCache };
  }

  /**
   * Returns the SlotmapId of the currently active page, or null if no page is active.
   * Used by callers that need to construct engine commands with the correct page_id.
   */
  getActivePageSlotId(): SlotmapId | null {
    return this.#activePageSlotId;
  }

  static #slotmapKey(id: SlotmapId): string {
    return `${id.idx}:${id.version}`;
  }

  /** Duplicate the current page via the engine `DuplicatePage` command. */
  duplicateActivePage(): boolean {
    if (!this.#activePageSlotId) return false;
    const activePage = this.#sceneCache[this.#activePageIdx];
    if (!activePage) return false;

    const beforePageIds = new Set(this.#sceneCache.map((page) => Editor.#slotmapKey(page.page_id)));
    const cmd = JSON.stringify({
      DuplicatePage: {
        source_page_id: activePage.page_id,
        new_name: null,
      },
    });
    const result = this.#session.executeCommand(cmd);
    if (!result.ok) {
      this.#onError(result.error);
      return false;
    }

    const sceneResult = this.#session.decodeSceneBuffer();
    if (!sceneResult.ok) {
      this.#onError(sceneResult.error);
      return false;
    }

    const newPageIdx = sceneResult.value.findIndex(
      (page) => !beforePageIds.has(Editor.#slotmapKey(page.page_id)),
    );
    if (newPageIdx < 0) {
      this.#onError('Duplicate page failed: duplicated page not found in scene');
      return false;
    }

    this.#activePageIdx = newPageIdx;
    this.#activePageSlotId = sceneResult.value[newPageIdx]!.page_id;
    this.#replay();
    return true;
  }

  /** Move the current page left or right via the engine `ReorderPage` command. */
  moveActivePage(direction: 'left' | 'right'): boolean {
    if (!this.#activePageSlotId) return false;

    const currentPageId = this.#activePageSlotId;
    const commandDirection = direction === 'left' ? 'Left' : 'Right';
    const cmd = JSON.stringify({
      ReorderPage: {
        id: currentPageId,
        direction: commandDirection,
      },
    });
    const result = this.#session.executeCommand(cmd);
    if (!result.ok) {
      this.#onError(result.error);
      return false;
    }

    const sceneResult = this.#session.decodeSceneBuffer();
    if (!sceneResult.ok) {
      this.#onError(sceneResult.error);
      return false;
    }
    const newIdx = sceneResult.value.findIndex(
      (page) => Editor.#slotmapKey(page.page_id) === Editor.#slotmapKey(currentPageId),
    );
    if (newIdx < 0) {
      this.#onError('Move page failed: moved page not found in scene');
      return false;
    }

    this.#activePageIdx = newIdx;
    this.#activePageSlotId = currentPageId;
    this.#replay();
    return true;
  }

  /** Detach event listeners from the viewer container. */
  detach(): void {
    this.#abortController?.abort();
    this.#abortController = null;
    // Clean up any active drag listeners
    this.#viewer.removeEventListener('pointermove', this.#onPointerMoveBound);
    this.#viewer.removeEventListener('pointerup', this.#onPointerUpBound);
    this.#viewer.removeEventListener('pointercancel', this.#onPointerUpBound);
    this.#dragState = null;
    this.#bendDrag = null;
    this.#cancelMarquee();
    this.#cancelConnect();
    this.#clearEdgeSelection();
    this.#portHandles.dispose();
    this.#bendHandles.dispose();
    this.#resizeHandles?.dispose();
  }

  /** Execute undo and replay. For toolbar button binding. */
  undoCmd(): void {
    const r = this.#session.undo();
    if (!r.ok) {
      this.#onError((r as { error: unknown }).error as string);
      return;
    }
    this.#replay();
  }

  /** Execute redo and replay. For toolbar button binding. */
  redoCmd(): void {
    const r = this.#session.redo();
    if (!r.ok) {
      this.#onError(r.error);
      return;
    }
    this.#replay();
  }

  /**
   * Get the resolved style for a vertex.
   * Returns typed effect fields (shadow, glass, gradient) plus remaining unknown keys.
   */
  getResolvedStyle(vertexId: SlotmapId): ResolvedStyle | null {
    const result = this.#session.getResolvedStyle(vertexId);
    if (!result.ok) {
      this.#onError(result.error);
      return null;
    }
    return result.value;
  }

  /**
   * Apply a shadow configuration to all selected vertices.
   *
   * If commit=true: builds a full ShadowConfig StyleMap and dispatches a single
   * executeTransaction with ChangeStyle commands for all selected vertices —
   * one undo entry reverses all.
   *
   * If commit=false: applies temporary shadow style directly to the DOM for
   * real-time preview without engine mutation or undo entries.
   */
  /** Apply a fill color to all selected vertices. */
  applyFillToSelection(color: string): void {
    if (this.#selection.size === 0) return;
    const commands: string[] = [];
    for (const id of this.#selection) {
      commands.push(
        JSON.stringify({
          ChangeStyle: {
            id: slotmapIdToField(id),
            style: { fillColor: color },
          },
        }),
      );
    }
    // Use this.executeTransaction (the editor wrapper) instead of
    // session.executeTransaction, so the Result is properly funneled
    // through #onError → diagnostics instead of silently discarded.
    this.executeTransaction(commands);
    this.#replay();
  }

  /** Apply a stroke color to all selected vertices. */
  applyStrokeToSelection(color: string): void {
    if (this.#selection.size === 0) return;
    const commands: string[] = [];
    for (const id of this.#selection) {
      commands.push(
        JSON.stringify({
          ChangeStyle: {
            id: slotmapIdToField(id),
            style: { strokeColor: color },
          },
        }),
      );
    }
    this.executeTransaction(commands);
    this.#replay();
  }

  applyShadowToSelection(
    shadow: Partial<import('./types.js').ShadowConfig>,
    commit: boolean,
  ): void {
    if (this.#selection.size === 0) return;

    if (!commit) {
      // Real-time preview: apply filter directly to DOM elements
      const config = shadow as import('./types.js').ShadowConfig;
      for (const id of this.#selection) {
        const el = this.#viewer.querySelector(`[data-vertex-id="${id.idx}:${id.version}"]`);
        if (!el) continue;
        if (config.enabled) {
          const filterId = `shadow-preview-${id.idx}`;
          (el as SVGElement).setAttribute('filter', `url(#${filterId})`);
        } else {
          (el as SVGElement).removeAttribute('filter');
        }
      }
      return;
    }

    // Commit: build full ShadowConfig and dispatch via executeTransaction
    const enabled = shadow.enabled ?? false;
    const commands: string[] = [];

    for (const id of this.#selection) {
      const style: Record<string, string> = {
        shadow: enabled ? '1' : '0',
      };
      if (enabled) {
        style['shadowDx'] = String(shadow.dx ?? 3);
        style['shadowDy'] = String(shadow.dy ?? 3);
        style['shadowBlur'] = String(shadow.blur ?? 5);
        style['shadowColor'] = shadow.color ?? '#000000';
      }
      commands.push(
        JSON.stringify({
          ChangeStyle: {
            id: slotmapIdToField(id),
            style,
          },
        }),
      );
    }

    if (commands.length === 0) return;
    this.executeTransaction(commands);
    this.#replay();
  }

  /**
   * Apply a glass configuration to all selected vertices.
   *
   * If commit=true: builds a full GlassConfig StyleMap and dispatches a single
   * executeTransaction with ChangeStyle commands for all selected vertices —
   * one undo entry reverses all.
   *
   * If commit=false: applies temporary fill-opacity directly to the DOM for
   * real-time preview without engine mutation or undo entries.
   */
  applyGlassToSelection(glass: GlassConfig | null, commit: boolean): void {
    if (this.#selection.size === 0) return;

    if (!commit) {
      // Real-time preview: apply fill-opacity directly to DOM elements
      for (const id of this.#selection) {
        const el = this.#viewer.querySelector(`[data-vertex-id="${id.idx}:${id.version}"]`);
        if (!el) continue;
        if (glass !== null && glass.enabled) {
          (el as SVGElement).setAttribute('fill-opacity', String(glass.opacity));
        } else {
          (el as SVGElement).removeAttribute('fill-opacity');
        }
      }
      return;
    }

    // Commit: build full GlassConfig and dispatch via executeTransaction
    const enabled = glass !== null && glass.enabled;
    const opacity = glass?.opacity ?? 0.5;
    const commands: string[] = [];

    for (const id of this.#selection) {
      const style: Record<string, string> = {
        glass: enabled ? '1' : '0',
      };
      if (enabled) {
        style['glassOpacity'] = String(opacity);
      }
      commands.push(
        JSON.stringify({
          ChangeStyle: {
            id: slotmapIdToField(id),
            style,
          },
        }),
      );
    }

    if (commands.length === 0) return;
    this.executeTransaction(commands);
    this.#replay();
  }

  /**
   * Apply a gradient configuration to all selected vertices.
   *
   * If commit=true: builds a full GradientConfig StyleMap and dispatches a single
   * executeTransaction with ChangeStyle commands for all selected vertices —
   * one undo entry reverses all.
   *
   * If commit=false: applies temporary gradient fill directly to the DOM for
   * real-time preview without engine mutation or undo entries.
   */
  applyGradientToSelection(gradient: GradientConfig | null, commit: boolean): void {
    if (this.#selection.size === 0) return;

    if (!commit) {
      // Real-time preview: apply gradient fill directly to DOM elements
      for (const id of this.#selection) {
        const el = this.#viewer.querySelector(`[data-vertex-id="${id.idx}:${id.version}"]`);
        if (!el) continue;
        if (gradient !== null) {
          (el as SVGElement).setAttribute('fill', `url(#grad-preview-${id.idx})`);
        } else {
          (el as SVGElement).removeAttribute('fill');
        }
      }
      return;
    }

    // Commit: build full GradientConfig and dispatch via executeTransaction
    const enabled = gradient !== null;
    const commands: string[] = [];

    for (const id of this.#selection) {
      const style: Record<string, string> = {
        gradient: enabled ? '1' : '0',
      };
      if (enabled && gradient !== null) {
        style['gradientType'] = gradient.kind === 'Linear' ? 'linear' : 'radial';
        style['gradientAngle'] = String(gradient.angle);
        style['gradientColor1'] = gradient.stops[0]?.color ?? '#ffffff';
        style['gradientColor2'] = gradient.stops[1]?.color ?? '#000000';
      }
      commands.push(
        JSON.stringify({
          ChangeStyle: {
            id: slotmapIdToField(id),
            style,
          },
        }),
      );
    }

    if (commands.length === 0) return;
    this.executeTransaction(commands);
    this.#replay();
  }

  /**
   * Trigger a re-render of the current page.
   * Called externally when state changes (e.g., from inspector via session callback).
   */
  triggerReplay(): void {
    this.#replay();
  }

  // ─── Inline Text Edit ─────────────────────────────────────────────────────

  /** Start inline text editing for a vertex. Shows an input overlay on the shape. */
  #startTextEdit(vertexId: SlotmapId, _e: MouseEvent): void {
    // If already editing, do nothing
    if (this.#textEdit) return;

    // Find the vertex's label from the scene cache
    const originalLabel = this.#getVertexLabel(vertexId) ?? '';

    // Find the shape's SVG element by data-vertex-id
    const shapeEl = this.#viewer.querySelector(
      `[data-vertex-id="${vertexId.idx}:${vertexId.version}"]`,
    );
    if (!shapeEl) return;

    const rect = shapeEl.getBoundingClientRect();

    // Create input overlay
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'label-editor';
    input.value = originalLabel;
    input.style.position = 'fixed';
    input.style.left = `${rect.left}px`;
    input.style.top = `${rect.top}px`;
    input.style.width = `${rect.width}px`;
    input.style.height = `${rect.height}px`;
    input.style.font = '14px Inter, sans-serif';
    input.style.textAlign = 'center';
    input.style.background = 'rgba(255,255,255,0.95)';
    input.style.border = '2px solid #3B82F6';
    input.style.zIndex = '1000';
    document.body.appendChild(input);

    input.focus();
    input.select();

    // Mark shape as being edited (hides its SVG text label)
    shapeEl.setAttribute('data-editing', 'true');

    this.#textEdit = { vertexId, isEdge: false, input, originalLabel };

    // Debounced label dispatch on input
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    input.addEventListener('input', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.#dispatchLabelEdit(vertexId, input.value);
      }, 200);
    });

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        this.#commitTextEdit();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        this.#cancelTextEdit();
      }
    });

    input.addEventListener('blur', () => {
      this.#commitTextEdit();
    });
  }

  /** Commit the current text edit and close the overlay. */
  #commitTextEdit(): void {
    if (!this.#textEdit) return;
    const { vertexId, input, isEdge } = this.#textEdit;
    if (isEdge) {
      this.#dispatchEdgeLabelEdit(vertexId, input.value);
    } else {
      this.#dispatchLabelEdit(vertexId, input.value);
    }
    this.#cleanupTextEdit();
  }

  /** Cancel the current text edit without committing. */
  #cancelTextEdit(): void {
    // No dispatch — engine still has original label
    this.#cleanupTextEdit();
  }

  /** Dispatch an EditVertexLabel command to the engine. */
  #dispatchLabelEdit(vertexId: SlotmapId, newLabel: string): void {
    const cmd = JSON.stringify({
      EditVertexLabel: {
        id: slotmapIdToField(vertexId),
        label: { text: newLabel },
      },
    });
    const result = this.#session.executeCommand(cmd);
    if (!result.ok) {
      this.#onError(result.error);
    } else {
      this.#replay();
    }
  }

  /** Clean up the text edit overlay and reset state. */
  #cleanupTextEdit(): void {
    if (!this.#textEdit) return;
    const { input, isEdge } = this.#textEdit;

    if (isEdge) {
      // Remove editing attribute from edge element
      const edgeEl = this.#viewer.querySelector(
        `[data-edge-id="${this.#textEdit.vertexId.idx}:${this.#textEdit.vertexId.version}"]`,
      );
      if (edgeEl) {
        edgeEl.removeAttribute('data-editing');
      }
    } else {
      // Remove editing attribute from shape
      const shapeEl = this.#viewer.querySelector(
        `[data-vertex-id="${this.#textEdit.vertexId.idx}:${this.#textEdit.vertexId.version}"]`,
      );
      if (shapeEl) {
        shapeEl.removeAttribute('data-editing');
      }
    }

    input.remove();
    this.#textEdit = null;
  }

  /** Get the label text for a vertex from the scene cache. */
  #getVertexLabel(vertexId: SlotmapId): string | null {
    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        // TextElement in display_list has `text: string` field
        const text = e['text'] as string | undefined;
        if (text !== undefined) {
          const owner = e['owner'] as Record<string, unknown> | undefined;
          const ownerVid = owner?.['Vertex'] as { idx?: number; version?: number } | undefined;
          if (ownerVid?.idx === vertexId.idx && ownerVid?.version === vertexId.version) {
            return text;
          }
        }
      }
    }
    return null;
  }

  /** Get the label text for an edge from the scene cache. */
  #getEdgeLabel(edgeId: SlotmapId): string | null {
    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        // TextElement in display_list has `text: string` field
        const text = e['text'] as string | undefined;
        if (text !== undefined) {
          const owner = e['owner'] as Record<string, unknown> | undefined;
          const ownerEdge = owner?.['Edge'] as { idx?: number; version?: number } | undefined;
          if (ownerEdge?.idx === edgeId.idx && ownerEdge?.version === edgeId.version) {
            return text;
          }
        }
      }
    }
    return null;
  }

  /** Dispatch an EditEdgeLabel command to the engine. */
  #dispatchEdgeLabelEdit(edgeId: SlotmapId, newLabel: string): void {
    if (!newLabel.trim()) return; // Don't dispatch empty labels
    const cmd = JSON.stringify({
      EditEdgeLabel: {
        id: slotmapIdToField(edgeId),
        label: { text: newLabel },
      },
    });
    const result = this.#session.executeCommand(cmd);
    if (!result.ok) {
      this.#onError(result.error);
    } else {
      this.#replay();
    }
  }

  /** Start inline text editing for an edge label. */
  #startEdgeTextEdit(edgeId: SlotmapId, _e: MouseEvent): void {
    // If already editing, do nothing
    if (this.#textEdit) return;

    // Get current edge label from scene cache
    const currentLabel = this.#getEdgeLabel(edgeId) ?? '';

    // Find the edge's element by data-edge-id
    const edgeEl = this.#viewer.querySelector(
      `[data-edge-id="${edgeId.idx}:${edgeId.version}"]`,
    );
    if (!edgeEl) return;

    const rect = edgeEl.getBoundingClientRect();

    // Create input overlay
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'label-editor';
    input.value = currentLabel;
    input.style.position = 'fixed';
    input.style.left = `${rect.left}px`;
    input.style.top = `${rect.top}px`;
    input.style.width = `${rect.width}px`;
    input.style.height = `${rect.height}px`;
    input.style.font = '12px Inter, sans-serif';
    input.style.textAlign = 'center';
    input.style.background = 'rgba(255,255,255,0.95)';
    input.style.border = '2px solid #3B82F6';
    input.style.zIndex = '1000';
    document.body.appendChild(input);

    input.focus();
    input.select();

    // Mark edge as being edited
    edgeEl.setAttribute('data-editing', 'true');

    this.#textEdit = { vertexId: edgeId, isEdge: true, input, originalLabel: currentLabel };

    // Debounced label dispatch on input
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    input.addEventListener('input', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.#dispatchEdgeLabelEdit(edgeId, input.value);
      }, 200);
    });

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        this.#commitTextEdit();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        this.#cancelTextEdit();
      }
    });

    input.addEventListener('blur', () => {
      this.#commitTextEdit();
    });
  }

  /**
   * IP-D: Open the Edit Link dialog for a shape. On Apply, the link is
   * stored in the shape's `link` cell-style key.
   */
  #openEditLinkDialog(vertexId: SlotmapId): void {
    // Lazy-import to avoid a circular import (edit-link-dialog imports
    // nothing from editor; editor doesn't import at top-level so we
    // can stay decoupled).
    void import('./edit-link-dialog.js').then(({ showEditLinkDialog }) => {
      const currentUrl = this.getShapeLink(vertexId);
      showEditLinkDialog(currentUrl, (newUrl) => {
        this.setShapeLink(vertexId, newUrl);
      });
    });
  }

  // ─── Coordinate Conversion ────────────────────────────────────────────────

  /** Convert screen client coordinates to document-space coordinates, accounting for zoom and SVG viewBox. */
  #clientToDoc(clientX: number, clientY: number): { x: number; y: number } {
    return clientToDoc(this.#viewer, clientX, clientY);
  }

  // ─── Snap Math ────────────────────────────────────────────────────────────

  /** Snap a document-space point to the nearest grid line within threshold. No-op when snap is disabled. */
  #snapToGrid(x: number, y: number): { x: number; y: number } {
    if (!this.#snapEnabled) return { x, y };
    const gridSize = 20;
    const snapX = Math.round(x / gridSize) * gridSize;
    const snapY = Math.round(y / gridSize) * gridSize;
    return {
      x: Math.abs(snapX - x) <= this.#snapThreshold ? snapX : x,
      y: Math.abs(snapY - y) <= this.#snapThreshold ? snapY : y,
    };
  }

  /**
   * Snap a document-space point to nearby shape edges/centers.
   * Returns snapped coordinates and active guide targets.
   * No-op when snap is disabled or excludeId is the only shape on the page.
   */
  #snapToShape(
    x: number,
    y: number,
    excludeId: SlotmapId,
  ): { x: number; y: number; guides: { x?: number; y?: number } } {
    if (!this.#snapEnabled) return { x, y, guides: {} };

    // Collect all peer shape bounds (excluding the dragged one)
    const peers = findAllShapesWithBounds(this.#sceneCache, excludeId);

    if (peers.length === 0) return { x, y, guides: {} };

    let bestX: number | undefined;
    let bestY: number | undefined;
    let bestDistX = this.#snapThreshold + 1;
    let bestDistY = this.#snapThreshold + 1;

    for (const peer of peers) {
      const peerLeft = peer.bounds.x;
      const peerCenterX = peer.bounds.x + peer.bounds.width / 2;
      const peerRight = peer.bounds.x + peer.bounds.width;

      const candX = [peerLeft, peerCenterX, peerRight];
      for (const cx of candX) {
        const dist = Math.abs(cx - x);
        if (dist <= this.#snapThreshold && dist < bestDistX) {
          bestDistX = dist;
          bestX = cx;
        }
      }

      // Y-axis candidates: top, middle, bottom
      const peerTop = peer.bounds.y;
      const peerMiddleY = peer.bounds.y + peer.bounds.height / 2;
      const peerBottom = peer.bounds.y + peer.bounds.height;

      const candY = [peerTop, peerMiddleY, peerBottom];
      for (const cy of candY) {
        const dist = Math.abs(cy - y);
        if (dist <= this.#snapThreshold && dist < bestDistY) {
          bestDistY = dist;
          bestY = cy;
        }
      }
    }

    const guides: { x?: number; y?: number } = {};
    if (bestX !== undefined) guides.x = bestX;
    if (bestY !== undefined) guides.y = bestY;
    return {
      x: bestX !== undefined ? bestX : x,
      y: bestY !== undefined ? bestY : y,
      guides,
    };
  }

  // ─── Snap Guides ──────────────────────────────────────────────────────────

  /** Render snap guide SVG lines at the given guide coordinates. */
  #renderGuides(guides: { x?: number; y?: number }): void {
    this.#clearGuides();

    const svg = this.#viewer.querySelector('svg');
    if (!svg) return;

    if (guides.x !== undefined) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(guides.x));
      line.setAttribute('y1', '0');
      line.setAttribute('x2', String(guides.x));
      line.setAttribute('y2', String(this.#viewer.getBoundingClientRect().height));
      line.setAttribute('class', 'snap-guide snap-guide-x');
      line.setAttribute('data-testid', 'snap-guide');
      line.setAttribute('data-axis', 'x');
      svg.appendChild(line);
    }

    if (guides.y !== undefined) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', String(guides.y));
      line.setAttribute('x2', String(this.#viewer.getBoundingClientRect().width));
      line.setAttribute('y2', String(guides.y));
      line.setAttribute('class', 'snap-guide snap-guide-y');
      line.setAttribute('data-testid', 'snap-guide');
      line.setAttribute('data-axis', 'y');
      svg.appendChild(line);
    }
  }

  /** Remove all snap guide elements from the DOM. */
  #clearGuides(): void {
    this.#viewer.querySelectorAll('[data-testid="snap-guide"]').forEach((el) => el.remove());
  }

  // ─── Public Snap API ─────────────────────────────────────────────────────

  /** Toggle snap-to-grid and snap-to-shape on/off. */
  toggleSnap(): void {
    this.#snapEnabled = !this.#snapEnabled;
    this.#onStateChange?.();
  }

  /** Check whether snap is currently enabled. */
  get snapEnabled(): boolean {
    return this.#snapEnabled;
  }

  /** Set snap enabled state. */
  setSnapEnabled(enabled: boolean): void {
    this.#snapEnabled = enabled;
  }

  /** Refresh scene cache and re-render. Called after commands. */
  #replay(): void {
    // Refresh scene cache
    const sceneResult = this.#session.decodeSceneBuffer();
    if (!sceneResult.ok) {
      this.#onError(sceneResult.error);
      return;
    }
    this.#sceneCache = sceneResult.value;
    if (this.#sceneCache.length > 0) {
      const page = this.#sceneCache[this.#activePageIdx];
      if (page) {
        this.#activePageSlotId = page.page_id;
      }
    }

    // Re-render the active page using renderPage with the slotmap ID index
    const page = this.#sceneCache[this.#activePageIdx];
    if (!page) {
      this.#onError('Page not found: ' + this.#activePageIdx);
      return;
    }
    const pageIdx = page.page_id.idx;
    const renderResult = this.#session.renderPage(pageIdx);
    if (!renderResult.ok) {
      this.#onError(renderResult.error);
      return;
    }
    this.#viewer.innerHTML = renderResult.value;
    // Notify state change (e.g. for undo/redo button updates)
    this.#onStateChange();

    // Re-apply selection if still valid
    this.#reapplySelection();

    // Re-render bend handles and port handles if an edge is selected
    if (this.#selectedEdgeId) {
      this.#bendHandles.render(this.#selectedEdgeId);
      this.#portHandles.render(new Set([this.#selectedEdgeId]));
    } else {
      this.#bendHandles.render(null);
      this.#portHandles.render(new Set());
    }

    // Re-render resize handles if a single vertex is selected
    this.#resizeHandles.render(this.#selection);
  }

  // ─── Selection ────────────────────────────────────────────────────────────

  /** Get array of currently selected ids. */
  #selectionIds(): SlotmapId[] {
    return Array.from(this.#selection);
  }

  /**
   * Apply a new selection set, update CSS classes, and notify listeners.
   * @param next New selection set (legacy, treats all IDs as vertices)
   */
  #applySelection(next: Set<SlotmapId>): void {
    // Remove .selected from all elements
    this.#viewer.querySelectorAll('[data-vertex-id]').forEach((el) => {
      el.classList.remove('selected');
    });
    this.#viewer.querySelectorAll('[data-group-id]').forEach((el) => {
      el.classList.remove('selected');
    });
    this.#viewer.querySelectorAll('[data-edge-id]').forEach((el) => {
      el.classList.remove('selected');
    });
    this.#selection = next;
    // Add .selected to all selected elements (legacy: all IDs treated as vertices)
    for (const id of this.#selection) {
      const selector = `[data-vertex-id="${id.idx}:${id.version}"]`;
      const el = this.#viewer.querySelector(selector);
      if (el) {
        el.classList.add('selected');
      }
    }
    // Notify selection change
    this.#notifySelectionChange();

    // Re-render resize handles when selection changes
    this.#resizeHandles.render(this.#selection);
  }

  /**
   * Apply selection for a typed engine target, using the correct DOM attribute.
   * - Vertex → [data-vertex-id]
   * - Group  → [data-group-id]
   * - Edge   → [data-edge-id]
   */
  #applyTarget(target: SelectionTarget): void {
    // Remove .selected from all element types
    this.#viewer.querySelectorAll('[data-vertex-id]').forEach((el) => {
      el.classList.remove('selected');
    });
    this.#viewer.querySelectorAll('[data-group-id]').forEach((el) => {
      el.classList.remove('selected');
    });
    this.#viewer.querySelectorAll('[data-edge-id]').forEach((el) => {
      el.classList.remove('selected');
    });

    const { id, attribute } = (() => {
      switch (target.type) {
        case 'Vertex':
          return { id: target.id, attribute: 'data-vertex-id' };
        case 'Group':
          return { id: target.id, attribute: 'data-group-id' };
        case 'Edge':
          return { id: target.id, attribute: 'data-edge-id' };
        case 'None':
        default:
          return { id: null, attribute: null };
      }
    })();

    if (id && attribute) {
      const selector = `[${attribute}="${id.idx}:${id.version}"]`;
      const el = this.#viewer.querySelector(selector);
      if (el) {
        el.classList.add('selected');
      }
      // Update internal SlotmapId set for resize handles
      this.#selection = new Set([id]);
    } else {
      this.#selection = new Set();
    }

    this.#notifySelectionChange();
    this.#resizeHandles.render(this.#selection);
  }

  /** Notify selection change listeners. */
  #notifySelectionChange(): void {
    this.#onSelectionChange(Array.from(this.#selection));
  }

  /** After re-render, validate selection and re-apply CSS class. */
  #reapplySelection(): void {
    if (this.#selection.size === 0) return;

    // Validate each selected ID still exists in the scene
    const validIds = new Set<SlotmapId>();
    for (const id of this.#selection) {
      const variant = findShapeVariant(this.#sceneCache, id);
      if (variant) {
        validIds.add(id);
      }
    }

    // Update selection to only valid IDs
    const changed =
      validIds.size !== this.#selection.size ||
      [...validIds].some((id) => !this.#selection.has(id));

    this.#selection = validIds;

    if (changed && validIds.size === 0) {
      // All selected items disappeared — notify
      this.#notifySelectionChange();
      return;
    } else if (changed) {
      this.#notifySelectionChange();
    }

    // Re-apply CSS class to DOM elements (check all attribute types)
    for (const id of this.#selection) {
      for (const attr of ['data-vertex-id', 'data-group-id', 'data-edge-id']) {
        const selector = `[${attr}="${id.idx}:${id.version}"]`;
        const el = this.#viewer.querySelector(selector);
        if (el) {
          el.classList.add('selected');
          break; // found — don't check other attributes
        }
      }
    }
  }

  // ─── Hit-testing ─────────────────────────────────────────────────────────

  /** Hit-test a pointer event against the scene. Returns SlotmapId or null.
   * IP-D: returns null for shapes with `locked=1` so they can't be
   * clicked for selection. (Note: the existing data model selection is
   * preserved — locking only blocks re-selection via pointer.) */
  #hitTest(e: PointerEvent): SlotmapId | null {
    const target = e.target as Element | null;
    if (!target) return null;
    const attrEl = target.closest('[data-vertex-id]');
    if (!attrEl) return null;
    const value = attrEl.getAttribute('data-vertex-id');
    if (!value) return null;
    const id = parseSlotmapAttr(value);
    if (!id) return null;
    if (this.isShapeLocked(id)) return null;
    return id;
  }

  /** Hit-test a pointer event against edges. Returns SlotmapId or null.
   * IP-D: returns null for edges with `locked=1`. */
  #hitTestEdge(e: PointerEvent): SlotmapId | null {
    const target = e.target as Element | null;
    if (!target) return null;
    const attrEl = target.closest('[data-edge-id]');
    if (!attrEl) return null;
    const value = attrEl.getAttribute('data-edge-id');
    if (!value) return null;
    const id = parseSlotmapAttr(value);
    if (!id) return null;
    if (this.isEdgeLocked(id)) return null;
    return id;
  }

  /** Select an edge and show its bend handles. */
  #selectEdge(edgeId: SlotmapId): void {
    this.#selectedEdgeId = edgeId;
    // Clear vertex selection
    this.#selection.clear();
    this.#bendHandles.render(edgeId);
    this.#notifySelectionChange();
  }

  /** Clear edge selection and remove bend handles. */
  #clearEdgeSelection(): void {
    this.#selectedEdgeId = null;
    this.#bendHandles.render(null);
    // Clear port handles
    this.#viewer.querySelectorAll('.port-handle').forEach((el) => el.remove());
  }

  // ─── Marquee Selection ────────────────────────────────────────────────────

  /** Start marquee selection at document coordinates (x, y).
   *  - intent: 'select' adds to selection, 'deselect' removes from selection.
   *  - containment: 'contain' (default draw.io, fully inside) or
   *    'intersect' (Alt modifier; anything the box touches). */
  #startMarquee(
    x: number,
    y: number,
    intent: 'select' | 'deselect' = 'select',
    containment: 'contain' | 'intersect' = 'contain',
  ): void {
    this.#cancelMarquee();
    this.#marquee = {
      originX: x,
      originY: y,
      currentX: x,
      currentY: y,
      intent,
      containment,
    };
  }

  /** Update marquee endpoint. */
  #updateMarquee(x: number, y: number): void {
    if (!this.#marquee) return;
    this.#marquee.currentX = x;
    this.#marquee.currentY = y;
    this.#renderMarquee();
  }

  /** End marquee selection, compute matching shapes by intent + containment. */
  #endMarquee(): void {
    if (!this.#marquee) return;
    const rect = this.#normalizeMarqueeRect();
    const { intent, containment } = this.#marquee;
    this.#cancelMarquee();
    if (rect.width > 5 || rect.height > 5) {
      if (intent === 'deselect') {
        this.#applyDeselectInRect(rect, containment);
      } else {
        this.#applySelectInRect(rect, containment);
      }
    }
  }

  /**
   * Start a move-area gesture (MOVE-016). All shapes whose bounds
   * intersect the rect swept by the drag are translated by the drag
   * delta on release. No visual feedback during the drag; the
   * translation is committed atomically when the gesture ends.
   */
  #startMoveArea(x: number, y: number): void {
    this.#moveArea = { originX: x, originY: y, currentX: x, currentY: y };
  }

  /** Update the move-area endpoint. */
  #updateMoveArea(x: number, y: number): void {
    if (!this.#moveArea) return;
    this.#moveArea.currentX = x;
    this.#moveArea.currentY = y;
  }

  /**
   * End the move-area gesture: find all shapes whose bounds intersect
   * the rect swept by the drag (origin → current), translate each by the
   * drag delta, and commit a single MoveVertex per shape.
   */
  #endMoveArea(): void {
    if (!this.#moveArea) return;
    const { originX, originY, currentX, currentY } = this.#moveArea;
    this.#moveArea = null;
    const dx = currentX - originX;
    const dy = currentY - originY;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const rect = {
      x: Math.min(originX, currentX),
      y: Math.min(originY, currentY),
      width: Math.abs(currentX - originX),
      height: Math.abs(currentY - originY),
    };
    const ids = this.#getIntersectingIds(rect);
    if (ids.length === 0) return;
    const cmds: string[] = [];
    for (const id of ids) {
      const el = this.#viewer.querySelector(
        `[data-vertex-id="${id.idx}:${id.version}"]`,
      ) as SVGGraphicsElement | null;
      if (!el) continue;
      const bbox = el.getBBox();
      cmds.push(
        JSON.stringify({
          MoveVertex: {
            id: slotmapIdToField(id),
            geometry: {
              x: bbox.x + dx,
              y: bbox.y + dy,
              width: bbox.width,
              height: bbox.height,
              relative: false,
              rotation: 0,
              flip_h: false,
              flip_v: false,
            },
          },
        }),
      );
    }
    if (cmds.length === 0) return;
    const result = this.#session.executeTransaction(cmds);
    if (!result.ok) {
      this.#onError(result.error);
      return;
    }
    this.#replay();
  }

  /** Cancel any active marquee without selecting. */
  #cancelMarquee(): void {
    this.#marquee = null;
    // Remove marquee rect from DOM if present
    const existing = this.#viewer.querySelector('.marquee');
    if (existing) existing.remove();
  }

  /** Render or update the SVG marquee rectangle. */
  #renderMarquee(): void {
    if (!this.#marquee) return;
    const rect = this.#normalizeMarqueeRect();

    let el = this.#viewer.querySelector('.marquee') as SVGRectElement | null;
    if (!el) {
      // Create the marquee rect
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
      el = document.createElementNS('http://www.w3.org/2000/svg', 'rect') as SVGRectElement;
      el.setAttribute('class', 'marquee');
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', '#3B82F6');
      el.setAttribute('stroke-dasharray', '4 2');
      svg.appendChild(el);
      this.#viewer.style.position = 'relative';
      this.#viewer.appendChild(svg);
    }

    el.setAttribute('x', String(Math.min(rect.x, rect.x + rect.width)));
    el.setAttribute('y', String(Math.min(rect.y, rect.y + rect.height)));
    el.setAttribute('width', String(Math.abs(rect.width)));
    el.setAttribute('height', String(Math.abs(rect.height)));
  }

  /** Get the normalized marquee rectangle (always positive width/height). */
  #normalizeMarqueeRect(): { x: number; y: number; width: number; height: number } {
    if (!this.#marquee) return { x: 0, y: 0, width: 0, height: 0 };
    return {
      x: Math.min(this.#marquee.originX, this.#marquee.currentX),
      y: Math.min(this.#marquee.originY, this.#marquee.currentY),
      width: Math.abs(this.#marquee.currentX - this.#marquee.originX),
      height: Math.abs(this.#marquee.currentY - this.#marquee.originY),
    };
  }

  /** Get all shape SlotmapIds whose bounds intersect the given rect. */
  #getIntersectingIds(rect: { x: number; y: number; width: number; height: number }): SlotmapId[] {
    return this.#collectIdsInRect(rect, 'intersect');
  }

  /** Get all shape SlotmapIds whose bounds are fully contained in the rect. */
  #getContainingIds(rect: { x: number; y: number; width: number; height: number }): SlotmapId[] {
    return this.#collectIdsInRect(rect, 'contain');
  }

  /**
   * Single-collection helper that filters scene shapes by AABB containment
   * against the marquee rect. Mode 'contain' keeps shapes whose bounds are
   * fully inside; mode 'intersect' keeps shapes whose bounds touch the rect
   * at all. Returns SlotmapIds in z-order.
   */
  #collectIdsInRect(
    rect: { x: number; y: number; width: number; height: number },
    mode: 'contain' | 'intersect',
  ): SlotmapId[] {
    const all = findAllShapesWithBounds(this.#sceneCache);
    return all
      .filter(({ bounds }) => {
        if (mode === 'contain') {
          return (
            bounds.x >= rect.x &&
            bounds.y >= rect.y &&
            bounds.x + bounds.width <= rect.x + rect.width &&
            bounds.y + bounds.height <= rect.y + rect.height
          );
        } else {
          return (
            bounds.x < rect.x + rect.width &&
            bounds.x + bounds.width > rect.x &&
            bounds.y < rect.y + rect.height &&
            bounds.y + bounds.height > rect.y
          );
        }
      })
      .map(({ id }) => id);
  }

  // ─── Drag FSM ────────────────────────────────────────────────────────────

  /**
   * Register an overlay hit zone (Pattern D 9a).
   * Returns a disposer — call it to remove the zone.
   */
  registerOverlayHitZone(zone: OverlayHitZone): () => void {
    this.#overlayHitZones.push(zone);
    return () => {
      const idx = this.#overlayHitZones.indexOf(zone);
      if (idx >= 0) this.#overlayHitZones.splice(idx, 1);
    };
  }

  #onPointerDown(e: PointerEvent): void {
    // Ignore non-primary button
    if (e.button !== 0) return;

    // Route to registered overlay hit zones (Pattern D 9a).
    // Check in registration order; first match consumes the event.
    const pointerTarget = e.target as Element | null;
    for (const zone of this.#overlayHitZones) {
      const matched = pointerTarget?.closest(zone.selector);
      if (matched && zone.handler(matched, e)) {
        return;
      }
    }

    // Label placement mode: create a label shape and immediately open text editor
    if (this.#labelPlacementActive) {
      this.#labelPlacementActive = false;
      const docPos = this.#clientToDoc(e.clientX, e.clientY);
      // Create a small rectangle as the label container
      const cmd = this.#buildAddVertexCmd('Rectangle', docPos.x - 40, docPos.y - 10);
      const r = this.#session.executeCommand(cmd);
      if (r.ok) {
        this.#replay();
        // Find the newly created vertex by searching for an element near the click
        // We use a marker approach: set a data attribute during creation
        // Since we can't easily get the new ID, position the input at click coords
        const fakeEvent = { clientX: e.clientX, clientY: e.clientY } as MouseEvent;
        // Find the vertex near the click by searching DOM
        const shapes = this.#viewer.querySelectorAll('[data-vertex-id]');
        let targetId: SlotmapId | null = null;
        let minDist = Infinity;
        for (const shape of shapes) {
          const rect = shape.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dist = Math.hypot(cx - e.clientX, cy - e.clientY);
          if (dist < minDist && dist < 100) {
            minDist = dist;
            const idAttr = shape.getAttribute('data-vertex-id');
            if (idAttr) {
              targetId = parseSlotmapAttr(idAttr);
            }
          }
        }
        if (targetId) {
          this.#startTextEdit(targetId, fakeEvent);
        }
      }
      return;
    }

    // Connect mode is handled via a separate two-click FSM — check BEFORE palette tools
    if (this.#activeTool === 'connector') {
      this.#onConnectClick(e);
      return;
    }

    // If tool is active, handle palette placement instead
    if (this.#activeTool) {
      this.#onPaletteClick(e);
      return;
    }

    const hit = this.#hitTest(e);

    if (!hit) {
      // Click on empty area
      // Try edge hit testing as fallback
      const edgeHit = this.#hitTestEdge(e);
      if (edgeHit) {
        // Edge endpoints visually overlap with their source/target vertex on
        // the SVG. The DOM hit-test returns the edge line (drawn on top), but
        // the engine's selection semantics prefer the vertex — defer to it.
        // Engine returns Vertex|Group|Edge|None; on a real edge click away
        // from any endpoint it returns Edge and we fall through to edge
        // selection below.
        const docPos = this.#clientToDoc(e.clientX, e.clientY);
        const modifiers: SelectionModifiers = {
          alt: e.altKey,
          shift: e.shiftKey,
          ctrl: e.ctrlKey,
          meta: e.metaKey,
        };
        const engineTarget = this.resolveSelection(docPos.x, docPos.y, modifiers);
        if (engineTarget && engineTarget.type !== 'None') {
          const id = this.#engineTargetToSlotmapId(engineTarget);
          if (id) {
            if (e.shiftKey) this.toggleSelection(id);
            else if (e.ctrlKey || e.metaKey) this.addToSelection(id);
            else this.selectOnly(id);
            // Drag tracking for non-empty vertex hit (mirror the shape hit path)
            this.#viewer.setPointerCapture(e.pointerId);
            this.#dragState = {
              vertexId: id,
              startX: docPos.x,
              startY: docPos.y,
              currentX: docPos.x,
              currentY: docPos.y,
            };
            this.#viewer.addEventListener('pointermove', this.#onPointerMoveBound);
            this.#viewer.addEventListener('pointerup', this.#onPointerUpBound);
            this.#viewer.addEventListener('pointercancel', this.#onPointerUpBound);
            return;
          }
        }
        // Engine confirmed the click is on an edge (mid-line) — fall back
        // to the existing edge selection behavior.
        this.#selectEdge(edgeHit);
        return;
      }

      // Clear edge selection when clicking empty space
      if (this.#selectedEdgeId) {
        this.#clearEdgeSelection();
      }

      if (e.altKey && e.shiftKey && e.ctrlKey) {
        // Alt+Ctrl+Shift+click on empty: insert-space / move-area (MOVE-016).
        // All shapes whose bounds intersect the rect swept by this drag will
        // be translated by the drag delta on pointerup. The gesture starts
        // here; the actual move is committed in #onPointerUp.
        const docPos = this.#clientToDoc(e.clientX, e.clientY);
        this.#startMoveArea(docPos.x, docPos.y);
        this.#viewer.addEventListener('pointermove', this.#onPointerMoveBound);
        this.#viewer.addEventListener('pointerup', this.#onPointerUpBound);
        this.#viewer.addEventListener('pointercancel', this.#onPointerUpBound);
      } else if (e.altKey && e.shiftKey) {
        // Alt+Shift+click on empty: deselect box (SEL-006, intersect)
        const docPos = this.#clientToDoc(e.clientX, e.clientY);
        this.#startMarquee(docPos.x, docPos.y, 'deselect', 'intersect');
        this.#viewer.addEventListener('pointermove', this.#onPointerMoveBound);
        this.#viewer.addEventListener('pointerup', this.#onPointerUpBound);
        this.#viewer.addEventListener('pointercancel', this.#onPointerUpBound);
      } else if (e.altKey) {
        // Alt+click on empty: select via intersection (SEL-005). Without Alt,
        // Shift+drag uses contain mode (draw.io convention). With Alt, the
        // user opts into intersect.
        const docPos = this.#clientToDoc(e.clientX, e.clientY);
        this.#startMarquee(docPos.x, docPos.y, 'select', 'intersect');
        this.#viewer.addEventListener('pointermove', this.#onPointerMoveBound);
        this.#viewer.addEventListener('pointerup', this.#onPointerUpBound);
        this.#viewer.addEventListener('pointercancel', this.#onPointerUpBound);
      } else if (e.shiftKey) {
        // Shift+click on empty: start marquee (SEL-003, contain by default)
        const docPos = this.#clientToDoc(e.clientX, e.clientY);
        this.#startMarquee(docPos.x, docPos.y, 'select', 'contain');
        // Add move/up listeners for marquee
        this.#viewer.addEventListener('pointermove', this.#onPointerMoveBound);
        this.#viewer.addEventListener('pointerup', this.#onPointerUpBound);
        this.#viewer.addEventListener('pointercancel', this.#onPointerUpBound);
      } else {
        // Plain click on empty: clear selection
        this.clearSelection();
      }
      return;
    }

    // Hit a shape — use engine-backed selection resolution (Slice 3)
    // The engine's resolve() handles alt-bypass semantics (SEL-016) and
    // locked target filtering automatically.
    const docPos = this.#clientToDoc(e.clientX, e.clientY);
    const modifiers: SelectionModifiers = {
      alt: e.altKey,
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      meta: e.metaKey,
    };
    const target = this.resolveSelection(docPos.x, docPos.y, modifiers);

    if (!target) {
      // Error — resolveSelection returned null, error was already reported
      return;
    }

    if (target.type === 'None') {
      // No shape at point
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        this.clearSelection();
      }
      return;
    }

    // Apply selection based on modifiers
    // Extract id here for dragState — use #applyTarget for typed plain-click selection
    const id = this.#engineTargetToSlotmapId(target);
    if (e.shiftKey) {
      // Shift+click: toggle in selection
      if (id) this.toggleSelection(id);
    } else if (e.ctrlKey || e.metaKey) {
      // Cmd/Ctrl+click: add to selection
      if (id) this.addToSelection(id);
    } else {
      // Plain click: select only — use typed target so Group/Edge gets correct DOM attribute
      this.selectTarget(target);
    }

    // Set pointer capture and start drag tracking
    this.#viewer.setPointerCapture(e.pointerId);

    if (id) {
      this.#dragState = {
        vertexId: id,
        startX: docPos.x,
        startY: docPos.y,
        currentX: docPos.x,
        currentY: docPos.y,
      };
    }

    // Add drag-specific listeners (stored references for cleanup)
    this.#viewer.addEventListener('pointermove', this.#onPointerMoveBound);
    this.#viewer.addEventListener('pointerup', this.#onPointerUpBound);
    this.#viewer.addEventListener('pointercancel', this.#onPointerUpBound);
  }

  /** Bound listener references for proper removal. */
  #onPointerMoveBound = (ev: PointerEvent): void => this.#onPointerMove(ev);
  #onPointerUpBound = (ev: PointerEvent): void => this.#onPointerUp(ev);

  #onPointerMove(e: PointerEvent): void {
    const docPos = this.#clientToDoc(e.clientX, e.clientY);

    // Emit cursor position to registered callback (rAF-throttled)
    if (this.#cursorMoveCb && this.#cursorMoveRafId === null) {
      const x = Math.round(docPos.x);
      const y = Math.round(docPos.y);
      this.#cursorMoveRafId = requestAnimationFrame(() => {
        this.#cursorMoveCb!({ x, y });
        this.#cursorMoveRafId = null;
      });
    }

    // Handle marquee dragging
    if (this.#marquee) {
      this.#updateMarquee(docPos.x, docPos.y);
      return;
    }

    // Handle move-area dragging (MOVE-016)
    if (this.#moveArea) {
      this.#updateMoveArea(docPos.x, docPos.y);
      return;
    }

    // Handle shape dragging
    if (!this.#dragState) return;

    // Apply snap: grid first, then shape
    const gridSnapped = this.#snapToGrid(docPos.x, docPos.y);
    const shapeSnapped = this.#snapToShape(gridSnapped.x, gridSnapped.y, this.#dragState.vertexId);

    this.#renderGuides(shapeSnapped.guides);
    this.#dragState.currentX = shapeSnapped.x;
    this.#dragState.currentY = shapeSnapped.y;

    const dx = this.#dragState.currentX - this.#dragState.startX;
    const dy = this.#dragState.currentY - this.#dragState.startY;

    // Apply CSS transform for visual feedback — only to the dragged shape
    const selector = `[data-vertex-id="${this.#dragState.vertexId.idx}:${this.#dragState.vertexId.version}"]`;
    const el = this.#viewer.querySelector(selector) as HTMLElement | null;
    if (el) {
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    this.#resizeHandles.applyDragOffset(dx, dy);
  }

  #onPointerUp(_e: PointerEvent): void {
    // Clean up listeners first
    this.#viewer.removeEventListener('pointermove', this.#onPointerMoveBound);
    this.#viewer.removeEventListener('pointerup', this.#onPointerUpBound);
    this.#viewer.removeEventListener('pointercancel', this.#onPointerUpBound);

    // Remove snap guides
    this.#clearGuides();

    // Handle GROUP_DRILL_DOWN commit on mouseup
    if (this.#drillDown) {
      this.#commitDrillDown(this.#drillDown);
      return;
    }

    // Handle marquee end
    if (this.#marquee) {
      this.#endMarquee();
      return;
    }

    // Handle move-area end (MOVE-016)
    if (this.#moveArea) {
      this.#endMoveArea();
      return;
    }

    if (!this.#dragState) return;

    const dx = this.#dragState.currentX - this.#dragState.startX;
    const dy = this.#dragState.currentY - this.#dragState.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Remove CSS transform from the dragged element
    const selector = `[data-vertex-id="${this.#dragState.vertexId.idx}:${this.#dragState.vertexId.version}"]`;
    const el = this.#viewer.querySelector(selector) as HTMLElement | null;
    if (el) {
      el.style.transform = '';
    }
    this.#resizeHandles.applyDragOffset(0, 0);

    // Commit move if threshold exceeded
    if (distance >= 3) {
      this.#commitMove(this.#dragState.vertexId, dx, dy);
    }

    this.#dragState = null;
  }

  // ─── Public Facade: Geometry Mutation ─────────────────────────────────────

  /**
   * Public facade to mutate the geometry of a single vertex.
   * Dispatches a MoveVertex command using absolute geometry.
   * Clamps non-positive width/height and ignores NaN inputs.
   *
    * The caller MAY pass only {x, y, width, height}; rotation/flip_h/flip_v
    * will be inherited from the current scene-cache geometry of the same
    * vertex. This preserves rotation and flips when the inspector or
    * resize handles adjust position or size.
    *
    * Alternatively, the caller can pass the full CellGeometry (x, y, width, height,
    * rotation, flip_h, flip_v, relative) to bypass the scene lookup entirely.
    */
  setVertexGeometry(
    id: SlotmapId,
    geom: { x: number; y: number; width: number; height: number; rotation?: number; flip_h?: boolean; flip_v?: boolean; relative?: boolean },
  ): void {
    // Guard: clamp/reject invalid
    if (
      !Number.isFinite(geom.x) ||
      !Number.isFinite(geom.y) ||
      !Number.isFinite(geom.width) ||
      !Number.isFinite(geom.height) ||
      geom.width <= 0 ||
      geom.height <= 0
    ) {
      return; // ignore invalid — UI should clamp before calling
    }
    // If the caller passed full geometry, use it directly (T07 path: resize overlay
    // passes rotation/flip so we skip the scene re-walk). Otherwise inherit from scene.
    const current = geom.rotation !== undefined
      ? null
      : sceneGeometry(this.#sceneCache, id);
    const fullGeom =
      current !== null
        ? {
            x: geom.x,
            y: geom.y,
            width: geom.width,
            height: geom.height,
            rotation: current.rotation,
            flip_h: current.flip_h,
            flip_v: current.flip_v,
            relative: false,
          }
        : {
            x: geom.x,
            y: geom.y,
            width: geom.width,
            height: geom.height,
            rotation: geom.rotation ?? 0,
            flip_h: geom.flip_h ?? false,
            flip_v: geom.flip_v ?? false,
            relative: geom.relative ?? false,
          };
    this.#session.executeCommands([this.#buildMoveVertexCmd(id, fullGeom)]);
    this.#replay();
  }

  // ─── Command Builders ─────────────────────────────────────────────────────

  /**
   * Build a MoveVertex command JSON string. The geometry must be a full
   * `CellGeometry` (x, y, width, height, rotation, flip_h, flip_v,
   * relative). Missing any of these fails serde validation in the engine.
   */
  #buildMoveVertexCmd(
    vid: SlotmapId,
    newGeom: {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      flip_h: boolean;
      flip_v: boolean;
      relative: boolean;
    },
  ): string {
    return JSON.stringify({
      MoveVertex: {
        id: slotmapIdToField(vid),
        geometry: {
          x: newGeom.x,
          y: newGeom.y,
          width: newGeom.width,
          height: newGeom.height,
          relative: newGeom.relative,
          rotation: newGeom.rotation,
          flip_h: newGeom.flip_h,
          flip_v: newGeom.flip_v,
        },
      },
    });
  }

  /** Build a RemoveVertex command JSON string. */
  #buildRemoveVertexCmd(vid: SlotmapId): string {
    return JSON.stringify({
      RemoveVertex: {
        id: slotmapIdToField(vid),
      },
    });
  }

  /** Build an AddVertex command JSON string. */
  #buildAddVertexCmd(
    kind:
      | 'Rectangle'
      | 'RoundedRect'
      | 'Ellipse'
      | 'Diamond'
      | 'Triangle'
      | 'Hexagon'
      | 'Cylinder'
      | 'Cloud'
      | 'Parallelogram'
      | 'Trapezoid'
      | 'Polygon'
      | 'RectangleStencil'
      | 'EllipseStencil'
      | 'DiamondStencil'
      | 'TriangleStencil'
      | 'HexagonStencil'
      | 'CylinderStencil'
      | 'CloudStencil'
      | 'ParallelogramStencil'
      | 'TrapezoidStencil'
      | 'BlockArrowStencil',
    x: number,
    y: number,
    label: string | null = null,
  ): string {
    const width = kind === 'Rectangle' || kind === 'RoundedRect' ? 120 : 80;
    const height = 80;
    const payload: Record<string, unknown> = {
      vertex: {
        geometry: {
          x,
          y,
          width,
          height,
          relative: false,
          rotation: 0,
          flip_h: false,
          flip_v: false,
        },
        label: label !== null ? { text: label } : null,
        style_id: null,
        parent: null,
        page_id: this.#activePageSlotId
          ? slotmapIdToField(this.#activePageSlotId)
          : { idx: 0, version: 0 },
        z_order: 0,
        locked: false,
        visible: true,
      },
    };
    // Include inline style based on shape kind (engine classifies by style properties)
    if (kind === 'Ellipse') {
      payload.style = { shape: 'ellipse' };
    } else if (kind === 'RoundedRect') {
      payload.style = { rounded: '1' };
    } else if (kind === 'Diamond') {
      payload.style = { shape: 'diamond' };
    } else if (kind === 'Triangle') {
      payload.style = { shape: 'triangle' };
    } else if (kind === 'Hexagon') {
      payload.style = { shape: 'hexagon' };
    } else if (kind === 'Cylinder') {
      payload.style = { shape: 'cylinder' };
    } else if (kind === 'Cloud') {
      payload.style = { shape: 'cloud' };
    } else if (kind === 'Parallelogram') {
      payload.style = { shape: 'parallelogram' };
    } else if (kind === 'Trapezoid') {
      payload.style = { shape: 'trapezoid' };
    } else if (kind === 'Polygon') {
      payload.style = { shape: 'polygon' };
    } else if (kind === 'RectangleStencil') {
      payload.style = { shape: 'stencil:rectangle' };
    } else if (kind === 'EllipseStencil') {
      payload.style = { shape: 'stencil:ellipse' };
    } else if (kind === 'DiamondStencil') {
      payload.style = { shape: 'stencil:diamond' };
    } else if (kind === 'TriangleStencil') {
      payload.style = { shape: 'stencil:triangle' };
    } else if (kind === 'HexagonStencil') {
      payload.style = { shape: 'stencil:hexagon' };
    } else if (kind === 'CylinderStencil') {
      payload.style = { shape: 'stencil:cylinder' };
    } else if (kind === 'CloudStencil') {
      payload.style = { shape: 'stencil:cloud' };
    } else if (kind === 'ParallelogramStencil') {
      payload.style = { shape: 'stencil:parallelogram' };
    } else if (kind === 'TrapezoidStencil') {
      payload.style = { shape: 'stencil:trapezoid' };
    } else if (kind === 'BlockArrowStencil') {
      payload.style = { shape: 'stencil:blockArrow' };
    }
    return JSON.stringify({ AddVertex: payload });
  }

  /** Build an AddVertex command from an existing vertex with new geometry. */
  #buildAddVertexFromVertexCmd(
    vertex: Vertex,
    newGeom: { x: number; y: number; width: number; height: number },
  ): string {
    const payload: Record<string, unknown> = {
      vertex: {
        geometry: {
          x: newGeom.x,
          y: newGeom.y,
          width: newGeom.width,
          height: newGeom.height,
          relative: false,
          rotation: 0,
          flip_h: false,
          flip_v: false,
        },
        label: null,
        style_id: null,
        parent: null,
        page_id: this.#activePageSlotId
          ? slotmapIdToField(this.#activePageSlotId)
          : { idx: 0, version: 0 },
        z_order: 0,
        locked: false,
        visible: true,
      },
    };
    // Copy style if present
    if (vertex.style) {
      payload.style = { ...vertex.style };
    }
    return JSON.stringify({ AddVertex: payload });
  }

  // ─── Command Execution ───────────────────────────────────────────────────

  /** Commit a move by computing new absolute geometry and dispatching MoveVertex. */
  #commitMove(vid: SlotmapId, dx: number, dy: number): void {
    // Look up original geometry from scene cache
    const orig = sceneGeometry(this.#sceneCache, vid);
    if (!orig) {
      this.#onError('Cannot find original geometry for moved vertex');
      return;
    }

    const newGeom = {
      x: orig.x + dx,
      y: orig.y + dy,
      width: orig.width,
      height: orig.height,
      // Carry rotation / flip / relative through. Without these the
      // engine's MoveVertex deserializer fails with "missing field
      // `rotation`" and the drag silently does nothing.
      rotation: orig.rotation,
      flip_h: orig.flip_h,
      flip_v: orig.flip_v,
      relative: orig.relative,
    };

    const cmd = this.#buildMoveVertexCmd(vid, newGeom);
    const r = this.#session.executeCommand(cmd);
    if (!r.ok) {
      this.#onError(r.error);
      return;
    }
    this.#replay();
  }

  /**
   * Commit a group drill-down by selecting the group element and transitioning
   * to the ONE state.
   */
  #commitDrillDown(state: { groupId: SlotmapId; groupElement: Element }): void {
    this.#drillDown = null;
    // Transition to ONE state with the group element as the sole selection
    this.#applySelection(new Set([state.groupId]));
  }



  /** Get a vertex object by SlotmapId from the scene cache. */
  #getVertex(id: SlotmapId): Vertex | null {
    const variant = findShapeVariant(this.#sceneCache, id);
    if (!variant) return null;
    const bounds = sceneBounds(this.#sceneCache, id);
    if (!bounds) return null;
    return {
      geometry: bounds,
      style: (variant['style'] as Record<string, unknown>) ?? {},
    };
  }

  /** Find a vertex SlotmapId at the given document position (within tolerance). */
  #findVertexAt(x: number, y: number, tolerance = 5): SlotmapId | null {
    const all = findAllShapesWithBounds(this.#sceneCache);
    for (const { id, bounds } of all) {
      if (
        x >= bounds.x - tolerance &&
        x <= bounds.x + bounds.width + tolerance &&
        y >= bounds.y - tolerance &&
        y <= bounds.y + bounds.height + tolerance
      ) {
        return id;
      }
    }
    return null;
  }

  /** Extract SlotmapId from a display list element. */
  #extractIdFromDisplayElem(elem: unknown): SlotmapId | null {
    return extractIdFromElem(elem);
  }

  /** Deep clone a vertex object. */
  #deepCloneVertex(v: Vertex): Vertex {
    return {
      geometry: { ...v.geometry },
      style: v.style ? { ...v.style } : {},
    };
  }

  // ─── Connect Mode ────────────────────────────────────────────────────────

  /**
   * Handle a pointer click in connect tool mode.
   * Mousedown on a shape: start drag tracking and show preview line.
   * Mousemove: update preview line end.
   * Mouseup on another shape: compute anchors and create edge with connect_vertices_anchored.
   * Mouseup on empty: cancel.
   *
   * Fallback (no drag): source anchor = Auto, target anchor = Auto.
   */
  #onConnectClick(e: PointerEvent): void {
    const hit = this.#hitTest(e);
    if (!hit) {
      // Clicked empty space — cancel connect mode
      this.#cancelConnect();
      return;
    }

    if (!this.#connectState) {
      // First click: record source shape and start drag tracking
      const geom = sceneGeometry(this.#sceneCache, hit);
      if (!geom) return;

      // IP-C: Determine connect mode from modifiers (EDG-003..005)
      let connectMode: 'floating' | 'fixed-only' | 'anywhere' | 'ignore' = 'floating';
      if (e.altKey && e.shiftKey) connectMode = 'ignore';
      else if (e.altKey) connectMode = 'anywhere';
      else if (e.shiftKey) connectMode = 'fixed-only';

      this.#connectState = {
        sourceId: hit,
        sourceX: geom.x + geom.width / 2,
        sourceY: geom.y + geom.height / 2,
        sourceClientX: e.clientX,
        sourceClientY: e.clientY,
        sourceBounds: geom,
        mode: connectMode,
      };

      // Show preview line immediately so click-click flows (without drag)
      // also get visual feedback. The line's endpoint starts at the source
      // shape's center and will follow the cursor on pointermove.
      this.#showPreviewLine(this.#connectState.sourceX, this.#connectState.sourceY);

      // Track cursor at document level so the preview line tracks the cursor
      // even when the user does a static click-click (no drag) on shapes.
      // The handler is removed when #connectState is cleared.
      const previewMoveHandler = (ev: PointerEvent) => {
        const previewSvg = this.#previewLine;
        if (previewSvg) {
          const line = previewSvg.querySelector('line');
          if (line) {
            const pos = this.#clientToDoc(ev.clientX, ev.clientY);
            line.setAttribute('x2', String(pos.x));
            line.setAttribute('y2', String(pos.y));
          }
        }
      };
      document.addEventListener('pointermove', previewMoveHandler);
      // Stash the handler so #clearConnectState can clean it up.
      this.#connectState.previewMoveHandler = previewMoveHandler;

      // Start drag tracking on document
      this.#startConnectDrag(hit, geom, e.clientX, e.clientY);
      return;
    }

    // Second click (no significant drag): create edge with auto anchors
    const sourceId = this.#connectState.sourceId;
    const connectMode = this.#connectState.mode;
    this.#cancelConnectDrag();

    // Don't connect a vertex to itself
    if (hit.idx === sourceId.idx && hit.version === sourceId.version) {
      this.#cancelConnect();
      return;
    }

    // IP-C EDG-005: 'ignore' mode → drop without connecting
    if (connectMode === 'ignore') {
      this.#clearConnectState();
      return;
    }

    // IP-C: Mode-driven anchor selection
    // - 'floating' (default): auto anchors
    // - 'fixed-only': both anchors fixed to Center port
    // - 'anywhere': both anchors normalized at cursor perimeter positions
    let sourceAnchor: { kind: 'auto' } | { kind: 'fixed'; port: 'North' | 'South' | 'East' | 'West' | 'Center' } | { kind: 'normalized'; nx: number; ny: number } = { kind: 'auto' };
    let targetAnchor: { kind: 'auto' } | { kind: 'fixed'; port: 'North' | 'South' | 'East' | 'West' | 'Center' } | { kind: 'normalized'; nx: number; ny: number } = { kind: 'auto' };
    if (connectMode === 'fixed-only') {
      sourceAnchor = { kind: 'fixed', port: 'Center' };
      targetAnchor = { kind: 'fixed', port: 'Center' };
    } else if (connectMode === 'anywhere') {
      // EDGE-003: Alt held → normalized anchor at cursor position on perimeter
      const sourceBounds = sceneGeometry(this.#sceneCache, sourceId);
      const targetBounds = sceneGeometry(this.#sceneCache, hit);
      if (sourceBounds && targetBounds) {
        const sourceDocPos = this.#clientToDoc(this.#connectState!.sourceClientX, this.#connectState!.sourceClientY);
        const targetDocPos = this.#clientToDoc(e.clientX, e.clientY);
        const sourceNorm = perimeterNormalized(sourceBounds, sourceDocPos.x, sourceDocPos.y);
        const targetNorm = perimeterNormalized(targetBounds, targetDocPos.x, targetDocPos.y);
        sourceAnchor = { kind: 'normalized', nx: sourceNorm.nx, ny: sourceNorm.ny };
        targetAnchor = { kind: 'normalized', nx: targetNorm.nx, ny: targetNorm.ny };
      }
    }

    const r = this.#session.connectVerticesAnchored(
      sourceId,
      hit,
      sourceAnchor,
      targetAnchor,
    );
    if (!r.ok) {
      this.#onError(r.error);
    } else {
      this.#replay();
    }

    this.#clearConnectState();
  }

  /**
   * Start drag tracking for connect mode.
   *
   * Registers a global `pointermove` listener that updates the preview line
   * AND activates the drag-flow `upHandler` only after the cursor has moved
   * more than `DRAG_THRESHOLD_PX` pixels from the source click position.
   *
   * Why: Playwright `click()` (and similar atomic click strategies) fires
   * `pointerdown` followed immediately by `pointerup` for the same click.
   * If we registered `pointerup` eagerly here, the first click's release
   * would hit the upHandler while the cursor was still over the source shape,
   * triggering the self-cancel branch and nulling `#connectState` before
   * the user could click the target. That bug broke click-to-connect (the
   * common "click two shapes to wire them" UX).
   *
   * By deferring pointerup registration until real cursor motion, a static
   * click-click flow (no drag) lets both clicks reach `#onConnectClick`,
   * which correctly handles the second click as "create edge with auto
   * anchors". A real drag activates the upHandler as soon as motion exceeds
   * the threshold, preserving the drag-to-anchor UX.
   */
  #startConnectDrag(
    sourceId: SlotmapId,
    sourceBounds: { x: number; y: number; width: number; height: number },
    clientX: number,
    clientY: number,
  ): void {
    // Show preview line from source center to cursor
    const sourceCenterX = sourceBounds.x + sourceBounds.width / 2;
    const sourceCenterY = sourceBounds.y + sourceBounds.height / 2;
    this.#showPreviewLine(sourceCenterX, sourceCenterY);

    const DRAG_THRESHOLD_PX = 5;
    let dragActivated = false;

    const activateUpHandler = (): void => {
      if (dragActivated) return;
      dragActivated = true;
      document.addEventListener('pointerup', upHandler);
      document.addEventListener('pointercancel', upHandler);
    };

    const moveHandler = (e: PointerEvent) => {
      // Update preview line end first (preview always tracks the cursor)
      const previewSvg = this.#previewLine;
      if (previewSvg) {
        const line = previewSvg.querySelector('line');
        if (line) {
          const pos = this.#clientToDoc(e.clientX, e.clientY);
          line.setAttribute('x2', String(pos.x));
          line.setAttribute('y2', String(pos.y));
        }
      }

      // Activate the drag upHandler only after the cursor has moved enough
      // to count as a real drag (not just a click's micro-jitter).
      const dx = e.clientX - clientX;
      const dy = e.clientY - clientY;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        activateUpHandler();
      }
    };

    const upHandler = (e: PointerEvent) => {
      // Cancel drag tracking
      document.removeEventListener('pointermove', moveHandler);
      document.removeEventListener('pointerup', upHandler);
      document.removeEventListener('pointercancel', upHandler);

      // Check if we're over a shape
      const targetHit = this.#hitTest(e);
      if (!targetHit) {
        // Mouseup on empty space — cancel
        this.#cancelConnectDrag();
        this.#cancelConnect();
        return;
      }

      // Don't connect to self
      if (targetHit.idx === sourceId.idx && targetHit.version === sourceId.version) {
        this.#cancelConnectDrag();
        this.#cancelConnect();
        return;
      }

      // Get target shape bounds
      const targetBounds = sceneGeometry(this.#sceneCache, targetHit);
      if (!targetBounds) {
        this.#cancelConnectDrag();
        this.#cancelConnect();
        return;
      }

      // Compute normalized anchors from the actual drag positions
      const sourceDocPos = this.#clientToDoc(this.#connectState!.sourceClientX, this.#connectState!.sourceClientY);
      const targetDocPos = this.#clientToDoc(e.clientX, e.clientY);

      const sourceNorm = perimeterNormalized(sourceBounds, sourceDocPos.x, sourceDocPos.y);
      const targetNorm = perimeterNormalized(targetBounds, targetDocPos.x, targetDocPos.y);

      const sourceKind = classifyAnchorFromNormalized(sourceNorm.nx, sourceNorm.ny);
      // EDGE-003: Alt held → 'anywhere' mode forces normalized anchor at cursor position
      const isAnywhere = this.#connectState!.mode === 'anywhere';
      const targetKind = isAnywhere ? 'normalized' : classifyAnchorFromNormalized(targetNorm.nx, targetNorm.ny);

      const sourceAnchor =
        sourceKind === 'normalized'
          ? { kind: 'normalized' as const, nx: sourceNorm.nx, ny: sourceNorm.ny }
          : { kind: sourceKind };

      const targetAnchor =
        targetKind === 'normalized'
          ? { kind: 'normalized' as const, nx: targetNorm.nx, ny: targetNorm.ny }
          : { kind: targetKind };

      this.#hidePreviewLine();

      // Call the anchored connect with resolved anchors
      const r = this.#session.connectVerticesAnchored(sourceId, targetHit, sourceAnchor, targetAnchor);
      if (!r.ok) {
        this.#onError(r.error);
      } else {
        this.#replay();
      }

      this.#clearConnectState();
      this.#connectDrag = null;
    };

    this.#connectDrag = { sourceId, sourceBounds, startClientX: clientX, startClientY: clientY, moveHandler, upHandler };
    // Register pointermove only; pointerup is wired lazily after drag threshold.
    document.addEventListener('pointermove', moveHandler);
  }

  /** Cancel connect drag tracking without canceling the connect state. */
  #cancelConnectDrag(): void {
    if (this.#connectDrag) {
      document.removeEventListener('pointermove', this.#connectDrag.moveHandler);
      document.removeEventListener('pointerup', this.#connectDrag.upHandler);
      document.removeEventListener('pointercancel', this.#connectDrag.upHandler);
      this.#connectDrag = null;
    }
    this.#hidePreviewLine();
  }

  /** Cancel connect mode and clean up preview. */
  #cancelConnect(): void {
    this.#cancelConnectDrag();
    this.#clearConnectState();
  }

  /**
   * Reset connect-mode FSM: removes the document-level preview-move handler
   * (if any), hides the preview SVG overlay, and clears #connectState.
   * Safe to call when state is already null.
   */
  #clearConnectState(): void {
    if (this.#connectState) {
      if (this.#connectState.previewMoveHandler) {
        document.removeEventListener('pointermove', this.#connectState.previewMoveHandler);
      }
      this.#connectState = null;
    }
    this.#hidePreviewLine();
  }

  /** Create an SVG overlay for the dashed preview line. */
  #showPreviewLine(x1: number, y1: number): void {
    this.#hidePreviewLine();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x1));
    line.setAttribute('y2', String(y1));
    line.setAttribute('stroke', '#2563eb');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '6 4');
    line.setAttribute('opacity', '0.8');
    svg.appendChild(line);
    this.#viewer.style.position = 'relative';
    this.#viewer.appendChild(svg);
    this.#previewLine = svg;

    // Track mouse to update line end
    const moveHandler = (ev: PointerEvent) => {
      const pos = this.#clientToDoc(ev.clientX, ev.clientY);
      line.setAttribute('x2', String(pos.x));
      line.setAttribute('y2', String(pos.y));
    };
    svg.addEventListener('pointermove', moveHandler, { once: true });
    // Keep move handler active while in connect mode
    const interval = setInterval(() => {
      if (!this.#connectState) {
        clearInterval(interval);
        return;
      }
      this.#viewer.addEventListener('pointermove', moveHandler, { once: true });
    }, 50);
    // Store interval id on svg for cleanup
    (svg as SVGSVGElement & { _interval?: ReturnType<typeof setInterval> })._interval = interval;
  }

  /** Remove the preview line overlay. */
  #hidePreviewLine(): void {
    if (this.#previewLine) {
      const interval = (
        this.#previewLine as SVGSVGElement & { _interval?: ReturnType<typeof setInterval> }
      )._interval;
      if (interval) clearInterval(interval);
      this.#previewLine.remove();
      this.#previewLine = null;
    }
  }

  // ─── Palette ─────────────────────────────────────────────────────────────

  /** Handle click when a palette tool is active. */
  #onPaletteClick(e: PointerEvent): void {
    if (!this.#activeTool) return;

    const kindMap: Record<
      string,
      | 'Rectangle'
      | 'RoundedRect'
      | 'Ellipse'
      | 'Diamond'
      | 'Triangle'
      | 'Hexagon'
      | 'Cylinder'
      | 'Cloud'
      | 'Parallelogram'
      | 'Trapezoid'
      | 'Polygon'
      | 'RectangleStencil'
      | 'EllipseStencil'
      | 'DiamondStencil'
      | 'TriangleStencil'
      | 'HexagonStencil'
      | 'CylinderStencil'
      | 'CloudStencil'
      | 'ParallelogramStencil'
      | 'TrapezoidStencil'
      | 'BlockArrowStencil'
    > = {
      rectangle: 'Rectangle',
      'rounded-rect': 'RoundedRect',
      ellipse: 'Ellipse',
      diamond: 'Diamond',
      triangle: 'Triangle',
      hexagon: 'Hexagon',
      cylinder: 'Cylinder',
      cloud: 'Cloud',
      parallelogram: 'Parallelogram',
      trapezoid: 'Trapezoid',
      polygon: 'Polygon',
      'rectangle-stencil': 'RectangleStencil',
      'ellipse-stencil': 'EllipseStencil',
      'diamond-stencil': 'DiamondStencil',
      'triangle-stencil': 'TriangleStencil',
      'hexagon-stencil': 'HexagonStencil',
      'cylinder-stencil': 'CylinderStencil',
      'cloud-stencil': 'CloudStencil',
      'parallelogram-stencil': 'ParallelogramStencil',
      'trapezoid-stencil': 'TrapezoidStencil',
      'blockArrow-stencil': 'BlockArrowStencil',
    };

    const kind = kindMap[this.#activeTool] ?? 'Rectangle';

    const docPos = this.#clientToDoc(e.clientX, e.clientY);

    // IP-C: Modifier routing for shape library insert.
    //   - Shift: ignore default style (use draw.io original). Capture the
    //     default style state BEFORE we add (since add doesn't consume it).
    //   - Alt: insert at bottom-left, underneath all other shapes.
    //   - Shift + 1 selected shape: REPLACE selected shape's type.
    //   - Alt + Shift + 1 selected shape: insert and connect.
    //   - No modifier: existing behavior (insert at click pos, top of z-stack).
    const useOriginalStyle = e.shiftKey && !e.altKey;
    const insertAtBottomLeft = e.altKey && !e.shiftKey;
    const replaceSelected = e.shiftKey && !e.altKey && this.#selection.size === 1;
    const insertAndConnect = e.altKey && e.shiftKey && this.#selection.size === 1;

    if (replaceSelected) {
      // Replace selected shape's type, keep geometry and style.
      const selectedId = this.#selection.values().next().value as SlotmapId;
      const newId = this.#replaceShapeKind(selectedId, kind, docPos);
      if (newId) {
        this.#replay();
      }
      this.setActiveTool(null);
      return;
    }

    if (insertAndConnect) {
      // Insert new shape and connect to selected.
      const selectedId = this.#selection.values().next().value as SlotmapId;
      const newId = this.#addVertexWithStyle(kind, docPos.x, docPos.y, useOriginalStyle);
      if (newId) {
        const r = this.#session.connectVerticesAnchored(
          selectedId,
          newId,
          { kind: 'auto' },
          { kind: 'auto' },
        );
        if (!r.ok) {
          this.#onError(r.error);
        } else {
          this.#replay();
        }
      }
      this.setActiveTool(null);
      return;
    }

    // For insert-at-bottom-left, compute target position from diagram bbox.
    let targetX = docPos.x;
    let targetY = docPos.y;
    if (insertAtBottomLeft) {
      const bbox = this.#getDiagramBBox();
      if (bbox) {
        // Bottom-left = (bbox.minX, bbox.maxY) in document coords
        targetX = bbox.minX;
        targetY = bbox.maxY;
      } else {
        // Empty diagram: fall back to a sensible default (40, 40)
        targetX = 40;
        targetY = 40;
      }
    }

    const newId = this.#addVertexWithStyle(kind, targetX, targetY, useOriginalStyle);
    if (!newId) {
      this.setActiveTool(null);
      return;
    }

    if (insertAtBottomLeft) {
      // Send to back so the new shape is underneath
      this.#session.executeCommand(
        JSON.stringify({
          SetZOrder: {
            id: slotmapIdToField(newId),
            direction: 'send_to_back',
          },
        }),
      );
      this.#replay();
    }

    this.setActiveTool(null);
  }

  // ─── IP-C: Shape Insertion Helpers ───────────────────────────────────────

  /**
   * Add a vertex using the editor's default style (or original if
   * `useOriginalStyle` is true). Returns the new SlotmapId or null.
   */
  // ─── IP-C: Shape Insertion Helpers ───────────────────────────────────────

  /**
   * Find the segment index of an edge closest to a given document point.
   * Used by the connector context menu "Add Waypoint" to know where to
   * insert the new waypoint. Returns 0 by default (insert at start).
   *
   * Walks the edge's source → bends → target chain, picks the segment
   * whose midpoint is nearest to the click.
   */
  #findSegmentAtPoint(edgeId: SlotmapId, x: number, y: number): number {
    // Find edge in scene cache
    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        const edge = e['Edge'] as Record<string, unknown> | undefined;
        if (!edge) continue;
        const idField = edge['id'] as { idx?: number; version?: number } | undefined;
        if (!idField || idField.idx !== edgeId.idx || idField.version !== edgeId.version) continue;

        // Get source/target positions
        const sourceId = edge['source'] as { idx?: number; version?: number } | undefined;
        const targetId = edge['target'] as { idx?: number; version?: number } | undefined;
        const waypoints = (edge['waypoints'] as Array<{ x: number; y: number }>) ?? [];
        if (!sourceId || !targetId) return 0;

        const sourceV = this.#getVertex({ idx: sourceId.idx!, version: sourceId.version! });
        const targetV = this.#getVertex({ idx: targetId.idx!, version: targetId.version! });
        if (!sourceV || !targetV) return 0;

        // Build the polyline: [source, ...waypoints, target]
        const points: Array<{ x: number; y: number }> = [
          {
            x: sourceV.geometry.x + sourceV.geometry.width / 2,
            y: sourceV.geometry.y + sourceV.geometry.height / 2,
          },
          ...waypoints,
          {
            x: targetV.geometry.x + targetV.geometry.width / 2,
            y: targetV.geometry.y + targetV.geometry.height / 2,
          },
        ];

        // Find closest segment
        let bestDist = Infinity;
        let bestIdx = 0;
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i]!;
          const p2 = points[i + 1]!;
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          const dist = (midX - x) ** 2 + (midY - y) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
        return bestIdx;
      }
    }
    return 0;
  }

  #addVertexWithStyle(
    kind: string,
    x: number,
    y: number,
    useOriginalStyle: boolean,
  ): SlotmapId | null {
    // buildAddVertexCmd expects a literal union; we accept string at the
    // public boundary and assert here. The kind is always one of the
    // library's known kinds (validated in #onPaletteClick's kindMap).
    const cmd = this.#buildAddVertexCmd(
      kind as
        | 'Rectangle'
        | 'RoundedRect'
        | 'Ellipse'
        | 'Diamond'
        | 'Triangle'
        | 'Hexagon'
        | 'Cylinder'
        | 'Cloud'
        | 'Parallelogram'
        | 'Trapezoid'
        | 'Polygon'
        | 'RectangleStencil'
        | 'EllipseStencil'
        | 'DiamondStencil'
        | 'TriangleStencil'
        | 'HexagonStencil'
        | 'CylinderStencil'
        | 'CloudStencil'
        | 'ParallelogramStencil'
        | 'TrapezoidStencil'
        | 'BlockArrowStencil',
      x,
      y,
    );
    // If we have a default style and the user didn't request original,
    // attach it to the new vertex via a follow-up ChangeStyle command.
    // We need to find the new vertex ID after replay; simpler: build the
    // AddVertex command with style baked in.
    if (!useOriginalStyle && this.#defaultStyle) {
      // Inject the default style into the AddVertex command payload
      try {
        const payload = JSON.parse(cmd);
        if (payload.AddVertex) {
          payload.AddVertex.style = this.#defaultStyle;
        }
        const r = this.#session.executeCommand(JSON.stringify(payload));
        if (!r.ok) {
          this.#onError(r.error);
          return null;
        }
      } catch {
        const r = this.#session.executeCommand(cmd);
        if (!r.ok) {
          this.#onError(r.error);
          return null;
        }
      }
    } else {
      const r = this.#session.executeCommand(cmd);
      if (!r.ok) {
        this.#onError(r.error);
        return null;
      }
    }

    this.#replay();

    // Find the newly created vertex by searching the scene cache for the
    // kind and position match.
    return findShapeIdAtPoint(this.#sceneCache, x, y, 1);
  }

  /**
   * Replace a shape's kind (e.g., Rect → Ellipse) while keeping geometry
   * and style. Returns the new SlotmapId.
   *
   * NOTE: This is a soft-replace — we delete the old vertex and add a new
   * one with the same geometry. The id changes, so the caller is responsible
   * for re-attaching connectors.
   */
  #replaceShapeKind(
    selectedId: SlotmapId,
    newKind: string,
    docPos: { x: number; y: number },
  ): SlotmapId | null {
    const vertex = this.#getVertex(selectedId);
    if (!vertex) return null;
    // Same literal-union assertion as #addVertexWithStyle
    const cmd = this.#buildAddVertexCmd(
      newKind as
        | 'Rectangle'
        | 'RoundedRect'
        | 'Ellipse'
        | 'Diamond'
        | 'Triangle'
        | 'Hexagon'
        | 'Cylinder'
        | 'Cloud'
        | 'Parallelogram'
        | 'Trapezoid'
        | 'Polygon'
        | 'RectangleStencil'
        | 'EllipseStencil'
        | 'DiamondStencil'
        | 'TriangleStencil'
        | 'HexagonStencil'
        | 'CylinderStencil'
        | 'CloudStencil'
        | 'ParallelogramStencil'
        | 'TrapezoidStencil'
        | 'BlockArrowStencil',
      vertex.geometry.x,
      vertex.geometry.y,
    );
    try {
      const payload = JSON.parse(cmd);
      if (payload.AddVertex) {
        payload.AddVertex.style = vertex.style;
        const r = this.#session.executeCommand(JSON.stringify(payload));
        if (!r.ok) {
          this.#onError(r.error);
          return null;
        }
      } else {
        const r = this.#session.executeCommand(cmd);
        if (!r.ok) {
          this.#onError(r.error);
          return null;
        }
      }
    } catch {
      const r = this.#session.executeCommand(cmd);
      if (!r.ok) {
        this.#onError(r.error);
        return null;
      }
    }
    this.#replay();

    // Find the new vertex
    const newId = this.#findVertexAt(vertex.geometry.x, vertex.geometry.y, 2);
    if (!newId) return null;

    // Delete the original
    this.#session.executeCommand(this.#buildRemoveVertexCmd(selectedId));
    this.#replay();
    return newId;
  }

  /** Compute the union bounding box of all shapes in the current page. */
  #getDiagramBBox(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const allBounds = findAllBounds(this.#sceneCache);
    if (allBounds.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of allBounds) {
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.width > maxX) maxX = b.x + b.width;
      if (b.y + b.height > maxY) maxY = b.y + b.height;
    }
    return { minX, minY, maxX, maxY };
  }

  /** Get waypoints for an edge from the scene cache. */
  #getEdgeWaypoints(edgeId: SlotmapId): Array<{ x: number; y: number }> {
    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        // Check for LineElement
        const line = e['Line'] as Record<string, unknown> | undefined;
        if (line) {
          const idField = line['id'] as { idx?: number; version?: number } | undefined;
          if (idField?.idx === edgeId.idx && idField?.version === edgeId.version) {
            const from = line['from'] as { x?: number; y?: number } | undefined;
            const to = line['to'] as { x?: number; y?: number } | undefined;
            if (from && to) {
              return [
                { x: from.x ?? 0, y: from.y ?? 0 },
                { x: to.x ?? 0, y: to.y ?? 0 },
              ];
            }
          }
        }
        // Check for PathElement
        const path = e['Path'] as Record<string, unknown> | undefined;
        if (path) {
          const idField = path['id'] as { idx?: number; version?: number } | undefined;
          if (idField?.idx === edgeId.idx && idField?.version === edgeId.version) {
            const points = path['points'] as Array<{ x?: number; y?: number }> | undefined;
            if (points && points.length > 0) {
              return points.map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 }));
            }
          }
        }
      }
    }
    return [];
  }

  /** Compute perpendicular distance from a point to a line segment. */
  #pointToSegmentDist(
    pt: { x: number; y: number },
    segA: { x: number; y: number },
    segB: { x: number; y: number },
  ): number {
    const dx = segB.x - segA.x;
    const dy = segB.y - segA.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      // Segment is a point
      return Math.hypot(pt.x - segA.x, pt.y - segA.y);
    }
    // Project point onto line, clamped to segment
    let t = ((pt.x - segA.x) * dx + (pt.y - segA.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = segA.x + t * dx;
    const projY = segA.y + t * dy;
    return Math.hypot(pt.x - projX, pt.y - projY);
  }

  /** Find the nearest segment index for a point on an edge. */
  #findNearestSegment(
    pts: Array<{ x: number; y: number }>,
    point: { x: number; y: number },
  ): number {
    let minDist = Infinity;
    let nearest = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = this.#pointToSegmentDist(point, pts[i]!, pts[i + 1]!);
      if (d < minDist) {
        minDist = d;
        nearest = i;
      }
    }
    return nearest;
  }

  // ─── Double-Click Text Edit ───────────────────────────────────────────────

  /** Handle dblclick on the viewer: start text edit on the hit shape or edge label. */
  #onDblClick(e: MouseEvent): void {
    const target = e.target as Element | null;
    if (!target) return;

    // Check if double-clicking on an edge label (TextElement owned by an edge)
    const edgeLabelHit = this.#hitTestEdgeLabel(e);
    if (edgeLabelHit) {
      e.preventDefault();
      e.stopPropagation();
      this.#startEdgeTextEdit(edgeLabelHit, e);
      return;
    }

    // Check if double-clicking on an edge line to insert a bend
    const edgeEl = target.closest('[data-edge-id]');
    if (edgeEl) {
      const edgeAttr = edgeEl.getAttribute('data-edge-id');
      if (edgeAttr) {
        const edgeId = parseSlotmapAttr(edgeAttr);
        if (edgeId) {
          e.preventDefault();
          e.stopPropagation();
          const docPoint = this.#clientToDoc(e.clientX, e.clientY);
          const pts = this.#getEdgeWaypoints(edgeId);
          const segIdx = this.#findNearestSegment(pts, docPoint);
          const snapped = this.#snapToGrid(docPoint.x, docPoint.y);
          this.insertBend(edgeId, segIdx, snapped.x, snapped.y);
          return;
        }
      }
    }

    // Check if double-clicking on a math text element (data-math-id + data-latex)
    const mathTextEl = target.closest('[data-math-id][data-latex]');
    if (mathTextEl) {
      const latex = mathTextEl.getAttribute('data-latex') ?? '';
      const mathId = mathTextEl.getAttribute('data-math-id');
      if (mathId) {
        e.preventDefault();
        e.stopPropagation();
        const vertexId = parseSlotmapAttr(mathId);
        if (vertexId) {
            openMathEditDialog(latex, (newLatex: string) => {
              // Update the label via EditVertexLabel command
              const cmd = JSON.stringify({
                EditVertexLabel: {
                  id: slotmapIdToField(vertexId),
                  label: { text: newLatex },
                },
              });
              const result = this.#session.executeCommand(cmd);
              if (!result.ok) {
                this.#onError(result.error);
              } else {
                this.#replay();
              }
            });
        }
      }
      return;
    }

    const shapeEl = target.closest('[data-vertex-id]');
    if (!shapeEl) return;

    const idAttr = shapeEl.getAttribute('data-vertex-id');
    if (!idAttr) return;
    const id = parseSlotmapAttr(idAttr);
    if (!id) return;

    e.preventDefault();
    e.stopPropagation();
    this.#startTextEdit(id, e);
  }

  /** Hit-test a mouse event against edge labels in the scene cache. Returns SlotmapId or null. */
  #hitTestEdgeLabel(e: MouseEvent): SlotmapId | null {
    const target = e.target as Element | null;
    if (!target) return null;

    // Only process text elements
    if (target.tagName !== 'text'.toUpperCase() && target.tagName !== 'text') return null;

    // Check if this text element is an edge label by looking through scene cache
    const textContent = target.textContent ?? '';
    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const elemRecord = elem as Record<string, unknown>;
        const text = elemRecord['text'] as string | undefined;
        if (text !== undefined && text === textContent) {
          const owner = elemRecord['owner'] as Record<string, unknown> | undefined;
          const ownerEdge = owner?.['Edge'] as { idx?: number; version?: number } | undefined;
          if (ownerEdge) {
            return { idx: ownerEdge.idx!, version: ownerEdge.version! };
          }
        }
      }
    }
    return null;
  }

  // ─── Context Menu ────────────────────────────────────────────────────────

  #onContextMenu(e: MouseEvent): void {
    // Check what was clicked
    const vertexHit = this.#hitTest(e as PointerEvent);
    const edgeHit = this.#hitTestEdge(e as PointerEvent);

    if (vertexHit) {
      // Select the vertex first if not already selected
      if (!this.#selection.has(vertexHit)) {
        this.#selection.clear();
        this.#selection.add(vertexHit);
        this.#replay();
      }

      const items: ContextMenuItem[] = [
        { label: 'Edit Label', action: () => this.#startTextEdit(vertexHit, e) },
        { label: 'Copy', action: () => this.copySelection() },
        { separator: true, label: '', action: () => {} },
        { label: 'Bring to Front', action: () => this.bringToFront() },
        { label: 'Send to Back', action: () => this.sendToBack() },
        { separator: true, label: '', action: () => {} },
        { label: 'Rotate CW', action: () => this.rotateSelection(Math.PI / 2) },
        { label: 'Rotate CCW', action: () => this.rotateSelection(-Math.PI / 2) },
        { label: 'Flip H', action: () => this.flipSelection('horizontal') },
        { label: 'Flip V', action: () => this.flipSelection('vertical') },
        { separator: true, label: '', action: () => {} },
        // IP-D: Edit Link
        { label: 'Edit Link…', action: () => this.#openEditLinkDialog(vertexHit) },
        // IP-D: Lock/Unlock
        {
          label: this.isShapeLocked(vertexHit) ? 'Unlock' : 'Lock',
          action: () => this.toggleShapeLock(vertexHit),
        },
        { separator: true, label: '', action: () => {} },
        { label: 'Delete', action: () => this.deleteSelection() },
      ];

      showContextMenu(e.clientX, e.clientY, items);
    } else if (edgeHit) {
      // IP-C: Determine if the right-click was on a waypoint (bend handle)
      // or on a segment. Bend handles are rendered as `<circle class="bend-handle">`
      // with `data-bend-index`. If so, show "Remove Waypoint"; otherwise
      // show "Add Waypoint" at the click position.
      const bendHandle = (e.target as Element)?.closest('.bend-handle');
      const items: ContextMenuItem[] = [
        { label: 'Edit Label', action: () => this.#startEdgeTextEdit(edgeHit, e) },
        { separator: true, label: '', action: () => {} },
      ];

      if (bendHandle) {
        // Remove waypoint: parse bend index from data attribute
        const bendIndex = parseInt(bendHandle.getAttribute('data-bend-index') || '0');
        items.push({
          label: 'Remove Waypoint',
          action: () => {
            this.removeBend(edgeHit, bendIndex);
            this.#replay();
          },
        });
      } else {
        // Add waypoint: insert at click document position. Use the session
        // command directly to add at the closest segment.
        const docPos = this.#clientToDoc(e.clientX, e.clientY);
        const segIndex = this.#findSegmentAtPoint(edgeHit, docPos.x, docPos.y);
        items.push({
          label: 'Add Waypoint',
          action: () => {
            this.insertBend(edgeHit, segIndex, docPos.x, docPos.y);
            this.#replay();
          },
        });
      }

      items.push(
        { separator: true, label: '', action: () => {} },
        // IP-D: Lock/Unlock for edge
        {
          label: this.isEdgeLocked(edgeHit) ? 'Unlock' : 'Lock',
          action: () => this.toggleEdgeLock(edgeHit),
        },
        { separator: true, label: '', action: () => {} },
        // IP-E: Reverse + Flip via engine commands (draw.io EDGE-018, EDGE-019)
        { label: 'Reverse', action: () => this.reverseEdge(edgeHit) },
        { label: 'Flip', action: () => this.flipEdge(edgeHit) },
        { separator: true, label: '', action: () => {} },
        { label: 'Delete Edge', action: () => {
          this.#session.disconnectEdge(edgeHit);
          this.#replay();
        }},
      );

      showContextMenu(e.clientX, e.clientY, items);
    } else {
      // Empty space context menu
      const items: ContextMenuItem[] = [
        { label: 'Paste', action: () => this.paste(), disabled: this.#clipboard === null },
        { separator: true, label: '', action: () => {} },
        { label: 'Select All', action: () => this.selectAll() },
      ];

      showContextMenu(e.clientX, e.clientY, items);
    }
  }

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  #onKeyDown(e: KeyboardEvent): void {
    // Ignore when focused on input elements
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // Ctrl+Shift+G → toggle snap
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      this.toggleSnap();
      return;
    }

    const hasMod = e.ctrlKey || e.metaKey;

    // Escape → clear selection / cancel connect mode
    if (e.key === 'Escape') {
      if (this.#connectState) {
        this.#cancelConnect();
      } else {
        this.clearSelection();
      }
      return;
    }

    // Delete / Backspace → delete selection or bend
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Delete selected bend first
      const selectedBend = this.#bendHandles.getSelectedBend();
      if (selectedBend !== null && this.#selectedEdgeId) {
        this.removeBend(selectedBend.edgeId, selectedBend.bendIndex);
        this.#bendHandles.render(this.#selectedEdgeId);
        e.preventDefault();
        return;
      }
      if (this.#selection.size > 0) {
        this.deleteSelection();
      } else if (this.#connectState) {
        // In connect mode with no selection, delete the source vertex if pending
        const cmd = this.#buildRemoveVertexCmd(this.#connectState.sourceId);
        const r = this.#session.executeCommand(cmd);
        if (!r.ok) {
          this.#onError(r.error);
          return;
        }
        this.#replay();
        this.#cancelConnect();
      }
      return;
    }

    // F2 or Enter (no Shift) on a single selection → start text edit
    if (e.key === 'F2' || (e.key === 'Enter' && !e.shiftKey)) {
      if (this.#selection.size === 1) {
        e.preventDefault();
        const id = this.#selection.values().next().value as SlotmapId;
        this.#startTextEdit(id, e as unknown as MouseEvent);
      }
      return;
    }

    // Ctrl+A → select all
    if (hasMod && e.key.toLowerCase() === 'a' && !e.shiftKey) {
      e.preventDefault();
      this.selectAll();
      return;
    }

    // Ctrl+Shift+A → deselect all (draw.io parity, SEL-011)
    if (hasMod && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      this.clearSelection();
      return;
    }

    // IP-D: Ctrl+G → group selection (draw.io parity, GROUP-001).
    // ADR-0080: rebind from grid toggle. Grid is now menu-only.
    if (hasMod && !e.shiftKey && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      if (this.#selection.size >= 2) {
        this.groupSelection();
      }
      return;
    }

    // IP-D: Ctrl+Shift+U → ungroup (draw.io parity, GROUP-002).
    if (hasMod && e.shiftKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      if (this.#selection.size >= 1) {
        this.ungroupSelection();
      }
      return;
    }

    // Ctrl+E → select all connectors (draw.io parity, SEL-009)
    if (hasMod && !e.shiftKey && e.key === 'e') {
      e.preventDefault();
      const edgeIds = this.#getAllEdgeIds();
      this.#applySelection(new Set(edgeIds));
      return;
    }

    // Ctrl+I → select all shapes (draw.io parity, SEL-010)
    // On macOS, Cmd+E maps to shapes and Cmd+I to connectors (draw.io parity).
    // We use Cmd/Ctrl+I for shapes to match the Windows draw.io convention.
    if (hasMod && !e.shiftKey && e.key === 'i') {
      e.preventDefault();
      const shapeIds = this.#getAllShapeIdsZOrder();
      this.#applySelection(new Set(shapeIds));
      return;
    }

    // Tab / Shift+Tab → cycle selection in z-order (SEL-012)
    if (e.key === 'Tab' && !hasMod) {
      e.preventDefault();
      const allIds = this.#getAllShapeIdsZOrder();
      if (allIds.length === 0) return;
      if (this.#selection.size === 0) {
        this.selectOnly(allIds[0]!);
        return;
      }
      // Find current selection's position in z-order
      const currentId = this.#selection.values().next().value as SlotmapId;
      const currentIdx = allIds.findIndex(
        (id) => id.idx === currentId.idx && id.version === currentId.version,
      );
      let nextIdx: number;
      if (e.shiftKey) {
        nextIdx = currentIdx <= 0 ? allIds.length - 1 : currentIdx - 1;
      } else {
        nextIdx = currentIdx === -1 || currentIdx === allIds.length - 1 ? 0 : currentIdx + 1;
      }
      this.selectOnly(allIds[nextIdx]!);
      return;
    }

    // Ctrl+C → copy
    if (hasMod && e.key === 'c') {
      e.preventDefault();
      this.copySelection();
      return;
    }

    // Alt+C → copy style (draw.io parity: STYL-005)
    if (e.altKey && !hasMod && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      this.copyStyle();
      return;
    }

    // Ctrl+V → paste
    if (hasMod && e.key === 'v') {
      e.preventDefault();
      this.paste();
      return;
    }

    // Alt+V → paste style (draw.io parity: STYL-006)
    if (e.altKey && !hasMod && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      this.pasteStyle();
      return;
    }

    // Alt+Shift+R → clear all waypoints on selected edge (EDG-015)
    // Only when an edge is selected and no shape is selected.
    if (
      e.altKey &&
      !hasMod &&
      e.shiftKey &&
      e.key.toLowerCase() === 'r' &&
      this.#selectedEdgeId !== null &&
      this.#selection.size === 0
    ) {
      e.preventDefault();
      this.clearAllWaypoints(this.#selectedEdgeId);
      this.#bendHandles.render(this.#selectedEdgeId);
      return;
    }

    // Ctrl+X → cut
    if (hasMod && e.key === 'x') {
      e.preventDefault();
      this.cutSelection();
      return;
    }

    // Ctrl+Z / Cmd+Z → Undo
    if (hasMod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undoCmd();
      return;
    }

    // Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z → Redo
    if (hasMod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      this.redoCmd();
      return;
    }

    // R → rotate selection 90° clockwise (only when shapes are selected)
    if (e.key === 'r' && !hasMod && !e.shiftKey) {
      if (this.#selection.size > 0) {
        e.preventDefault();
        this.rotateSelection(Math.PI / 2);
      }
      return;
    }

    // Shift+R → rotate selection 15° fine adjustment
    if (e.key === 'R' && !hasMod && e.shiftKey) {
      if (this.#selection.size > 0) {
        e.preventDefault();
        this.rotateSelection(Math.PI / 12);
      }
      return;
    }

    // H → flip selection horizontally (only when shapes are selected)
    if (e.key === 'h' && !hasMod && !e.shiftKey) {
      if (this.#selection.size > 0) {
        e.preventDefault();
        this.flipSelection('horizontal');
      }
      return;
    }

    // V → flip selection vertically (only when shapes are selected)
    if (e.key === 'v' && !hasMod && !e.shiftKey) {
      if (this.#selection.size > 0) {
        e.preventDefault();
        this.flipSelection('vertical');
      }
      return;
    }

    // Ctrl+D → duplicate selection (copy + paste)
    // IP-C: !e.shiftKey required so Ctrl+Shift+D (set default style) takes priority
    if (hasMod && e.key === 'd' && !e.shiftKey) {
      e.preventDefault();
      this.copySelection();
      this.paste();
      return;
    }

    // Ctrl/Cmd + = / + → zoom in (most browsers send '=' with shift)
    if (hasMod && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      this.#zoomIn?.();
      return;
    }

    // Ctrl/Cmd + - → zoom out
    if (hasMod && e.key === '-') {
      e.preventDefault();
      this.#zoomOut?.();
      return;
    }

    // Ctrl/Cmd + 0 → reset zoom
    if (hasMod && e.key === '0') {
      e.preventDefault();
      this.#resetZoom?.();
      return;
    }

    // Home → reset view (zoom=1, pan=0,0) — draw.io parity
    if (!hasMod && e.key === 'Home') {
      e.preventDefault();
      this.#resetZoom?.();
      return;
    }

    // Ctrl+Shift+D → set default style from selection (draw.io parity: STYL-003)
    if (hasMod && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      this.setDefaultStyle();
      return;
    }

    // Ctrl+Shift+R → clear default style (draw.io parity: STYL-004)
    // Only when nothing is selected (otherwise this is "Clear" the current
    // selection by accident — Ctrl+Shift+R is the universal "hard refresh"
    // in browsers, so we also need to handle the no-selection case carefully).
    if (hasMod && e.shiftKey && e.key.toLowerCase() === 'r' && this.#selection.size === 0) {
      e.preventDefault();
      this.clearDefaultStyle();
      return;
    }

    // Arrow keys → nudge selected shapes OR pan viewport (no selection).
    //   Plain: 1px nudge, snap respects Alt-bypass (MOVE-004).
    //   Shift: lands the selection on the next grid line in the direction
    //          (MOVE-003). With Shift + Alt: shift-step + no snap.
    if (!hasMod) {
      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case 'ArrowLeft': dx = -1; break;
        case 'ArrowRight': dx = 1; break;
        case 'ArrowUp': dy = -1; break;
        case 'ArrowDown': dy = 1; break;
        default: return;
      }
      e.preventDefault();
      if (this.#selection.size > 0) {
        if (e.shiftKey) {
          // MOVE-003: per-shape snap to next grid line in direction.
          this.#nudgeSelection(dx, dy, {
            shiftToGrid: true,
            ignoreSnap: e.altKey,
          });
        } else {
          // Plain nudge: dx, dy are ±1, snap decisions inside the method.
          this.#nudgeSelection(dx, dy, { ignoreSnap: e.altKey });
        }
      } else {
        this.#pan?.(dx, dy);
      }
      return;
    }

    // Ctrl+Shift+Arrow → resize selection by 1px (MOVE-013).
    // Left/Right adjusts width, Up/Down adjusts height. Negative direction
    // when Left/Up is held. Snaps the resulting bbox to grid if snap is on
    // (Alt bypasses snap per MOVE-004).
    if (hasMod && e.shiftKey) {
      let dw = 0;
      let dh = 0;
      switch (e.key) {
        case 'ArrowLeft':  dw = -1; break;
        case 'ArrowRight': dw =  1; break;
        case 'ArrowUp':    dh = -1; break;
        case 'ArrowDown':  dh =  1; break;
        default: return;
      }
      if (this.#selection.size === 0) return;
      if (dw === 0 && dh === 0) return;
      e.preventDefault();
      this.#resizeSelection(dw, dh, { ignoreSnap: e.altKey });
      return;
    }
  }

  /**
   * Move all selected shapes by (dx, dy) in document units via a single atomic
   * transaction.
   *
   * Options:
   *   - `shiftToGrid`: when Shift is held, each shape's new top-left corner
   *     lands on the next grid line in the direction of motion per shape
   *     (MOVE-003). With `dx > 0` move to the next grid line strictly greater
   *     than currentX; with `dx < 0` move to the next grid line strictly
   *     smaller. Same for y.
   *   - `ignoreSnap`: bypass grid snap entirely (MOVE-004 Alt modifier).
   */
  #nudgeSelection(
    dx: number,
    dy: number,
    opts: { shiftToGrid?: boolean; ignoreSnap?: boolean } = {},
  ): void {
    if (this.#selection.size === 0) return;
    const { shiftToGrid = false, ignoreSnap = false } = opts;
    const cmds: string[] = [];
    for (const id of this.#selection) {
      const el = this.#viewer.querySelector(
        `[data-vertex-id="${id.idx}:${id.version}"]`,
      ) as SVGGraphicsElement | null;
      if (!el) continue;
      const bbox = el.getBBox();
      const nextX = this.#nextGridCoord(bbox.x, dx, shiftToGrid, ignoreSnap);
      const nextY = this.#nextGridCoord(bbox.y, dy, shiftToGrid, ignoreSnap);
      cmds.push(
        JSON.stringify({
          MoveVertex: {
            id: slotmapIdToField(id),
            geometry: {
              x: nextX,
              y: nextY,
              width: bbox.width,
              height: bbox.height,
              relative: false,
              rotation: 0,
              flip_h: false,
              flip_v: false,
            },
          },
        }),
      );
    }
    if (cmds.length === 0) return;
    const result = this.#session.executeTransaction(cmds);
    if (!result.ok) {
      this.#onError(result.error);
      return;
    }
    this.#replay();
  }

  /**
   * Compute the next position for a single coordinate given a unit-axis motion.
   * The return is the next grid line in direction `dir` (±1, 0) when Shift is
   * held and snap is on; otherwise a plain delta from `current`.
   *
   *   - When `shiftToGrid && !ignoreSnap && this.#snapEnabled`:
   *       pick the next multiple of GRID_SIZE strictly greater (`dir > 0`)
   *       or strictly smaller (`dir < 0`) than `current`.
   *   - When snap is off or ignoreSnap is true: `current + dir`.
   *   - When `dir === 0`: pass through.
   */
  #nextGridCoord(
    current: number,
    dir: number,
    shiftToGrid: boolean,
    ignoreSnap: boolean,
  ): number {
    if (dir === 0) return current;
    const GRID_SIZE = 20;
    if (shiftToGrid && !ignoreSnap && this.#snapEnabled) {
      if (dir > 0) return Math.floor(current / GRID_SIZE + 1) * GRID_SIZE;
      return Math.ceil(current / GRID_SIZE - 1) * GRID_SIZE;
    }
    return current + dir;
  }

  /**
   * Resize all selected shapes by (dw, dh) in document units via a single atomic
   * transaction. Each shape's new width is `bbox.width + dw`; new height is
   * `bbox.height + dh`. If snap is enabled (and not bypassed), the resulting
   * origin is snapped to the nearest grid line so the shape stays anchored at
   * its top-left corner (MOVE-013 + MOVE-004 ignored via Alt).
   *
   * No-op when `dw === 0 && dh === 0` or the selection is empty.
   */
  #resizeSelection(
    dw: number,
    dh: number,
    opts: { ignoreSnap?: boolean } = {},
  ): void {
    if (this.#selection.size === 0 || (dw === 0 && dh === 0)) return;
    const { ignoreSnap = false } = opts;
    const cmds: string[] = [];
    for (const id of this.#selection) {
      const el = this.#viewer.querySelector(
        `[data-vertex-id="${id.idx}:${id.version}"]`,
      ) as SVGGraphicsElement | null;
      if (!el) continue;
      const bbox = el.getBBox();
      let nextWidth = bbox.width + dw;
      let nextHeight = bbox.height + dh;
      // Minimum size clamp at 1px so shapes cannot collapse to zero-area.
      if (nextWidth < 1) nextWidth = 1;
      if (nextHeight < 1) nextHeight = 1;
      let nextX = bbox.x;
      let nextY = bbox.y;
      if (this.#snapEnabled && !ignoreSnap) {
        const snapped = this.#snapToGrid(nextX, nextY);
        nextX = snapped.x;
        nextY = snapped.y;
      }
      cmds.push(
        JSON.stringify({
          MoveVertex: {
            id: slotmapIdToField(id),
            geometry: {
              x: nextX,
              y: nextY,
              width: nextWidth,
              height: nextHeight,
              relative: false,
              rotation: 0,
              flip_h: false,
              flip_v: false,
            },
          },
        }),
      );
    }
    if (cmds.length === 0) return;
    const result = this.#session.executeTransaction(cmds);
    if (!result.ok) {
      this.#onError(result.error);
      return;
    }
    this.#replay();
  }

  // ─── Connect Anchor Helpers ─────────────────────────────────────────────────

}
