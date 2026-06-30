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
} from './types.js';
import { parseSlotmapAttr, slotmapIdToField } from './types.js';
import { showContextMenu, type ContextMenuItem } from './context-menu.js';
import { openMathEditDialog } from './math/math-dialog.js';
import { PortHandlesOverlay } from './port-handles.js';

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

/** Drag FSM state (single-shape drag). */
interface DragState {
  vertexId: SlotmapId;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

/** Marquee selection state. */
interface MarqueeState {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  /** 'select' replaces/adds to selection, 'deselect' removes from selection. */
  mode: 'select' | 'deselect';
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

  /** Set zoom control callbacks for keyboard shortcuts. */
  setZoomCallbacks(opts: { zoomIn?: () => void; zoomOut?: () => void; resetZoom?: () => void }): void {
    if (opts.zoomIn) this.#zoomIn = opts.zoomIn;
    if (opts.zoomOut) this.#zoomOut = opts.zoomOut;
    if (opts.resetZoom) this.#resetZoom = opts.resetZoom;
  }

  // ─── Edge / Bend Editing ───────────────────────────────────────────────────
  #selectedEdgeId: SlotmapId | null = null;
  #selectedBendIndex: number | null = null;
  #bendDrag: { edgeId: SlotmapId; bendIndex: number } | null = null;
  #onBendDragMoveBound: (_e: PointerEvent) => void;
  #onBendDragUpBound: (_e: PointerEvent) => void;

  // ─── Port Handles Overlay ──────────────────────────────────────────────────
  readonly #portHandles: PortHandlesOverlay;

  // Internal clipboard for copy/paste
  #clipboard: { vertices: Vertex[]; offset: number } | null = null;

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

    // Initialize bound event handlers for bend dragging
    this.#onBendDragMoveBound = (e: PointerEvent) => this.#onBendDragMove(e);
    this.#onBendDragUpBound = () => this.#onBendDragUp();

    // Initialize port handles overlay
    this.#portHandles = new PortHandlesOverlay(viewer, () => this.#sceneCache, session);
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

  /** Replace selection with multiple ids. */
  selectMany(ids: SlotmapId[]): void {
    this.#applySelection(new Set(ids));
  }

  /**
   * Select all shapes whose bounds intersect the given rect.
   * Used by marquee selection.
   */
  selectInRect(rect: { x: number; y: number; width: number; height: number }): void {
    const intersecting = this.#getIntersectingIds(rect);
    this.#applySelection(new Set(intersecting));
  }

  /**
   * Remove all currently-selected shapes whose bounds intersect the given rect.
   * Implements draw.io Alt+Shift+drag deselect box (SEL-006).
   */
  deselectInRect(rect: { x: number; y: number; width: number; height: number }): void {
    const intersecting = this.#getIntersectingIds(rect);
    const next = new Set(this.#selection);
    for (const id of intersecting) {
      next.delete(id);
    }
    this.#applySelection(next);
  }

  /**
   * Get all shape SlotmapIds at a given document-space point, in z-order
   * (top of stack first). Used by Alt+click underneath to cycle through
   * overlapping shapes (SEL-014).
   */
  #getIdsAtPoint(x: number, y: number): SlotmapId[] {
    const result: SlotmapId[] = [];
    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        for (const key of Editor.#SHAPE_KEYS) {
          const variant = e[key] as Record<string, unknown> | undefined;
          if (!variant) continue;
          const idField = variant['id'] as { idx?: number; version?: number } | undefined;
          if (!idField) continue;
          const bounds = variant['bounds'] as
            | { origin?: Record<string, number>; size?: Record<string, number> }
            | undefined;
          if (!bounds?.origin || !bounds?.size) continue;
          const sx = (bounds.origin['x'] as number) ?? 0;
          const sy = (bounds.origin['y'] as number) ?? 0;
          const sw = (bounds.size['width'] as number) ?? 0;
          const sh = (bounds.size['height'] as number) ?? 0;
          if (x >= sx && x <= sx + sw && y >= sy && y <= sy + sh) {
            result.push({ idx: idField.idx!, version: idField.version! });
          }
        }
      }
    }
    return result; // z-order: top of stack first
  }

  /**
   * Get the IDs of all shapes on the active page in DOM/z-order (top first).
   * Used by Tab/Shift+Tab to cycle selection (SEL-012).
   */
  #getAllShapeIdsZOrder(): SlotmapId[] {
    const result: SlotmapId[] = [];
    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        for (const key of Editor.#SHAPE_KEYS) {
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
      const orig = this.#findOriginalGeometry(id);
      if (!orig) continue;
      const newGeom = {
        x: orig.x + dx,
        y: orig.y + dy,
        width: orig.width,
        height: orig.height,
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
    const allIds: SlotmapId[] = [];
    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const id = this.#extractIdFromDisplayElem(elem);
        if (id) allIds.push(id);
      }
    }
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
      .map((id) => ({ id, geom: this.#findOriginalGeometry(id) }))
      .filter(
        (
          b,
        ): b is { id: SlotmapId; geom: { x: number; y: number; width: number; height: number } } =>
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
      .map((id) => ({ id, geom: this.#findOriginalGeometry(id) }))
      .filter(
        (
          b,
        ): b is { id: SlotmapId; geom: { x: number; y: number; width: number; height: number } } =>
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
      .map((id) => ({ id, geom: this.#findOriginalGeometry(id) }))
      .filter(
        (
          b,
        ): b is { id: SlotmapId; geom: { x: number; y: number; width: number; height: number } } =>
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

  /** Detach event listeners from the viewer container. */
  detach(): void {
    this.#abortController?.abort();
    this.#abortController = null;
    // Clean up any active drag listeners
    this.#viewer.removeEventListener('pointermove', this.#onPointerMoveBound);
    this.#viewer.removeEventListener('pointerup', this.#onPointerUpBound);
    this.#viewer.removeEventListener('pointercancel', this.#onPointerUpBound);
    // Clean up bend drag listeners
    this.#viewer.removeEventListener('pointermove', this.#onBendDragMoveBound);
    this.#viewer.removeEventListener('pointerup', this.#onBendDragUpBound);
    this.#viewer.removeEventListener('pointercancel', this.#onBendDragUpBound);
    this.#dragState = null;
    this.#bendDrag = null;
    this.#cancelMarquee();
    this.#cancelConnect();
    this.#clearEdgeSelection();
    this.#portHandles.dispose();
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

  // ─── Coordinate Conversion ────────────────────────────────────────────────

  /** Convert screen client coordinates to document-space coordinates, accounting for zoom. */
  #clientToDoc(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.#viewer.getBoundingClientRect();
    const zoom = this.#getZoom();
    return {
      x: (clientX - rect.left) / zoom,
      y: (clientY - rect.top) / zoom,
    };
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
    const peers: { id: SlotmapId; x: number; y: number; width: number; height: number }[] = [];
    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        for (const key of Editor.#SHAPE_KEYS) {
          const variant = e[key] as Record<string, unknown> | undefined;
          if (!variant) continue;
          const idField = variant['id'] as { idx?: number; version?: number } | undefined;
          if (!idField) continue;
          const id = { idx: idField.idx!, version: idField.version! };
          if (id.idx === excludeId.idx && id.version === excludeId.version) continue;
          const bounds = variant['bounds'] as
            | { origin?: Record<string, number>; size?: Record<string, number> }
            | undefined;
          if (!bounds?.origin || !bounds?.size) continue;
          peers.push({
            id,
            x: (bounds.origin['x'] as number) ?? 0,
            y: (bounds.origin['y'] as number) ?? 0,
            width: (bounds.size['width'] as number) ?? 0,
            height: (bounds.size['height'] as number) ?? 0,
          });
        }
      }
    }

    if (peers.length === 0) return { x, y, guides: {} };

    let bestX: number | undefined;
    let bestY: number | undefined;
    let bestDistX = this.#snapThreshold + 1;
    let bestDistY = this.#snapThreshold + 1;

    for (const peer of peers) {
      // X-axis candidates: left, center, right
      const peerLeft = peer.x;
      const peerCenterX = peer.x + peer.width / 2;
      const peerRight = peer.x + peer.width;

      const candX = [peerLeft, peerCenterX, peerRight];
      for (const cx of candX) {
        const dist = Math.abs(cx - x);
        if (dist <= this.#snapThreshold && dist < bestDistX) {
          bestDistX = dist;
          bestX = cx;
        }
      }

      // Y-axis candidates: top, middle, bottom
      const peerTop = peer.y;
      const peerMiddleY = peer.y + peer.height / 2;
      const peerBottom = peer.y + peer.height;

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
      this.#renderBendHandles();
      this.#portHandles.render(new Set([this.#selectedEdgeId]));
    } else {
      this.#portHandles.render(new Set());
    }
  }

  // ─── Selection ────────────────────────────────────────────────────────────

  /** Get array of currently selected ids. */
  #selectionIds(): SlotmapId[] {
    return Array.from(this.#selection);
  }

  /**
   * Apply a new selection set, update CSS classes, and notify listeners.
   * @param next New selection set
   */
  #applySelection(next: Set<SlotmapId>): void {
    // Remove .selected from all elements
    this.#viewer.querySelectorAll('[data-vertex-id]').forEach((el) => {
      el.classList.remove('selected');
    });
    this.#selection = next;
    // Add .selected to all selected elements
    for (const id of this.#selection) {
      const selector = `[data-vertex-id="${id.idx}:${id.version}"]`;
      const el = this.#viewer.querySelector(selector);
      if (el) {
        el.classList.add('selected');
      }
    }
    // Notify selection change
    this.#notifySelectionChange();
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
      const variant = this.#findShapeById(id);
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

    // Re-apply CSS class to DOM elements
    for (const id of this.#selection) {
      const selector = `[data-vertex-id="${id.idx}:${id.version}"]`;
      const el = this.#viewer.querySelector(selector);
      if (el) {
        el.classList.add('selected');
      }
    }
  }

  // ─── Hit-testing ─────────────────────────────────────────────────────────

  /** Hit-test a pointer event against the scene. Returns SlotmapId or null. */
  #hitTest(e: PointerEvent): SlotmapId | null {
    const target = e.target as Element | null;
    if (!target) return null;
    const attrEl = target.closest('[data-vertex-id]');
    if (!attrEl) return null;
    const value = attrEl.getAttribute('data-vertex-id');
    if (!value) return null;
    return parseSlotmapAttr(value);
  }

  /** Hit-test a pointer event against edges. Returns SlotmapId or null. */
  #hitTestEdge(e: PointerEvent): SlotmapId | null {
    const target = e.target as Element | null;
    if (!target) return null;
    const attrEl = target.closest('[data-edge-id]');
    if (!attrEl) return null;
    const value = attrEl.getAttribute('data-edge-id');
    if (!value) return null;
    return parseSlotmapAttr(value);
  }

  /** Select an edge and show its bend handles. */
  #selectEdge(edgeId: SlotmapId): void {
    this.#selectedEdgeId = edgeId;
    // Clear vertex selection
    this.#selection.clear();
    this.#renderBendHandles();
    this.#notifySelectionChange();
  }

  /** Clear edge selection and remove bend handles. */
  #clearEdgeSelection(): void {
    this.#selectedEdgeId = null;
    this.#selectedBendIndex = null;
    this.#viewer.querySelectorAll('.bend-handle').forEach((el) => el.remove());
    // Clear port handles
    this.#viewer.querySelectorAll('.port-handle').forEach((el) => el.remove());
  }

  // ─── Marquee Selection ────────────────────────────────────────────────────

  /** Start marquee selection at document coordinates (x, y). */
  #startMarquee(x: number, y: number, mode: 'select' | 'deselect' = 'select'): void {
    this.#cancelMarquee();
    this.#marquee = { originX: x, originY: y, currentX: x, currentY: y, mode };
  }

  /** Update marquee endpoint. */
  #updateMarquee(x: number, y: number): void {
    if (!this.#marquee) return;
    this.#marquee.currentX = x;
    this.#marquee.currentY = y;
    this.#renderMarquee();
  }

  /** End marquee selection, compute intersecting shapes. */
  #endMarquee(): void {
    if (!this.#marquee) return;
    const rect = this.#normalizeMarqueeRect();
    const mode = this.#marquee.mode;
    this.#cancelMarquee();
    if (rect.width > 5 || rect.height > 5) {
      if (mode === 'deselect') {
        this.deselectInRect(rect);
      } else {
        this.selectInRect(rect);
      }
    }
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
    const result: SlotmapId[] = [];

    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        for (const key of Editor.#SHAPE_KEYS) {
          const variant = e[key] as Record<string, unknown> | undefined;
          if (!variant) continue;
          const idField = variant['id'] as { idx?: number; version?: number } | undefined;
          if (!idField) continue;
          const bounds = variant['bounds'] as
            | { origin?: Record<string, number>; size?: Record<string, number> }
            | undefined;
          if (!bounds?.origin || !bounds?.size) continue;

          const sx = (bounds.origin['x'] as number) ?? 0;
          const sy = (bounds.origin['y'] as number) ?? 0;
          const sw = (bounds.size['width'] as number) ?? 0;
          const sh = (bounds.size['height'] as number) ?? 0;

          // Intersection test
          if (
            sx < rect.x + rect.width &&
            sx + sw > rect.x &&
            sy < rect.y + rect.height &&
            sy + sh > rect.y
          ) {
            result.push({ idx: idField.idx!, version: idField.version! });
          }
        }
      }
    }
    return result;
  }

  // ─── Drag FSM ────────────────────────────────────────────────────────────

  #onPointerDown(e: PointerEvent): void {
    // Ignore non-primary button
    if (e.button !== 0) return;

    // Check if clicking on a port handle FIRST (before any other hit testing)
    // Port handles use data-edge-idx and data-end attributes
    const portHandle = (e.target as Element)?.closest('.port-handle');
    if (portHandle && this.#selectedEdgeId) {
      // Port handle drag is handled entirely by the PortHandlesOverlay
      // which registered its own mousedown listener — just stop propagation here
      e.stopPropagation();
      return;
    }

    // Check if clicking on a bend handle (before any other hit testing)
    const bendHandle = (e.target as Element)?.closest('.bend-handle');
    if (bendHandle && this.#selectedEdgeId) {
      const bendIndex = parseInt(bendHandle.getAttribute('data-bend-index') || '0');
      this.#startBendDrag(this.#selectedEdgeId, bendIndex, e);
      return;
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
        this.#selectEdge(edgeHit);
        return;
      }

      // Clear edge selection when clicking empty space
      if (this.#selectedEdgeId) {
        this.#clearEdgeSelection();
      }

      if (e.altKey && e.shiftKey) {
        // Alt+Shift+click on empty: deselect box (SEL-006)
        const docPos = this.#clientToDoc(e.clientX, e.clientY);
        this.#startMarquee(docPos.x, docPos.y, 'deselect');
        this.#viewer.addEventListener('pointermove', this.#onPointerMoveBound);
        this.#viewer.addEventListener('pointerup', this.#onPointerUpBound);
        this.#viewer.addEventListener('pointercancel', this.#onPointerUpBound);
      } else if (e.altKey) {
        // Alt+click on empty: force selection box (SEL-004)
        const docPos = this.#clientToDoc(e.clientX, e.clientY);
        this.#startMarquee(docPos.x, docPos.y, 'select');
        this.#viewer.addEventListener('pointermove', this.#onPointerMoveBound);
        this.#viewer.addEventListener('pointerup', this.#onPointerUpBound);
        this.#viewer.addEventListener('pointercancel', this.#onPointerUpBound);
      } else if (e.shiftKey) {
        // Shift+click on empty: start marquee
        const docPos = this.#clientToDoc(e.clientX, e.clientY);
        this.#startMarquee(docPos.x, docPos.y, 'select');
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

    // Hit a shape
    if (e.altKey && !e.shiftKey) {
      // Alt+click on shape: select underneath in z-stack (SEL-014)
      // Find all shapes at the click point, cycle to the next-lower one
      const docPos = this.#clientToDoc(e.clientX, e.clientY);
      const stackAtPoint = this.#getIdsAtPoint(docPos.x, docPos.y);
      if (stackAtPoint.length > 1) {
        // Find current selection in stack; pick the next-lower one
        const currentIdx = stackAtPoint.findIndex((id) => this.isSelected(id));
        const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % stackAtPoint.length;
        const next = stackAtPoint[nextIdx]!;
        this.selectOnly(next);
        return;
      }
      // Only one shape at point: just select it
      this.selectOnly(hit);
    } else if (e.shiftKey) {
      // Shift+click: toggle in selection
      this.toggleSelection(hit);
    } else if (e.ctrlKey || e.metaKey) {
      // Cmd/Ctrl+click: add to selection
      this.addToSelection(hit);
    } else {
      // Plain click: select only
      this.selectOnly(hit);
    }

    // Set pointer capture and start drag tracking
    this.#viewer.setPointerCapture(e.pointerId);

    const docPos = this.#clientToDoc(e.clientX, e.clientY);
    this.#dragState = {
      vertexId: hit,
      startX: docPos.x,
      startY: docPos.y,
      currentX: docPos.x,
      currentY: docPos.y,
    };

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
  }

  #onPointerUp(_e: PointerEvent): void {
    // Clean up listeners first
    this.#viewer.removeEventListener('pointermove', this.#onPointerMoveBound);
    this.#viewer.removeEventListener('pointerup', this.#onPointerUpBound);
    this.#viewer.removeEventListener('pointercancel', this.#onPointerUpBound);

    // Remove snap guides
    this.#clearGuides();

    // Handle marquee end
    if (this.#marquee) {
      this.#endMarquee();
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
   */
  setVertexGeometry(
    id: SlotmapId,
    geom: { x: number; y: number; width: number; height: number },
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
    this.#session.executeCommands([this.#buildMoveVertexCmd(id, geom)]);
    this.#replay();
  }

  // ─── Command Builders ─────────────────────────────────────────────────────

  /** Build a MoveVertex command JSON string. Uses absolute geometry. */
  #buildMoveVertexCmd(
    vid: SlotmapId,
    newGeom: { x: number; y: number; width: number; height: number },
  ): string {
    return JSON.stringify({
      MoveVertex: {
        id: slotmapIdToField(vid),
        geometry: {
          x: newGeom.x,
          y: newGeom.y,
          width: newGeom.width,
          height: newGeom.height,
          relative: false,
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
    const orig = this.#findOriginalGeometry(vid);
    if (!orig) {
      this.#onError('Cannot find original geometry for moved vertex');
      return;
    }

    const newGeom = {
      x: orig.x + dx,
      y: orig.y + dy,
      width: orig.width,
      height: orig.height,
    };

    const cmd = this.#buildMoveVertexCmd(vid, newGeom);
    const r = this.#session.executeCommand(cmd);
    if (!r.ok) {
      this.#onError(r.error);
      return;
    }
    this.#replay();
  }

  /** Find original geometry for a vertex from the scene cache. */
  #findOriginalGeometry(
    vid: SlotmapId,
  ): { x: number; y: number; width: number; height: number } | null {
    const variant = this.#findShapeById(vid);
    if (!variant) return null;
    const bounds = variant['bounds'] as
      | { origin?: Record<string, number>; size?: Record<string, number> }
      | undefined;
    if (!bounds?.origin || !bounds?.size) return null;
    return {
      x: (bounds.origin['x'] as number) ?? 0,
      y: (bounds.origin['y'] as number) ?? 0,
      width: (bounds.size['width'] as number) ?? 0,
      height: (bounds.size['height'] as number) ?? 0,
    };
  }

  // ─── Shape Lookup Helpers ─────────────────────────────────────────────────

  /** Shape type keys used across scene-walk helpers. */
  static readonly #SHAPE_KEYS = [
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

  /**
   * Find the display-list variant data for a shape by its SlotmapId.
   * Returns the variant record (e.g. `{id, bounds, style}`) or null if not found.
   * This is the single source of truth for scene-walking by ID.
   */
  #findShapeById(id: SlotmapId): Record<string, unknown> | null {
    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        for (const key of Editor.#SHAPE_KEYS) {
          const variant = e[key] as Record<string, unknown> | undefined;
          if (!variant) continue;
          const idField = variant['id'] as { idx?: number; version?: number } | undefined;
          if (!idField) continue;
          if (idField.idx === id.idx && idField.version === id.version) {
            return variant;
          }
        }
      }
    }
    return null;
  }

  /** Get a vertex object by SlotmapId from the scene cache. */
  #getVertex(id: SlotmapId): Vertex | null {
    const variant = this.#findShapeById(id);
    if (!variant) return null;
    const bounds = variant['bounds'] as
      | { origin?: Record<string, number>; size?: Record<string, number> }
      | undefined;
    if (!bounds?.origin || !bounds?.size) return null;
    return {
      geometry: {
        x: (bounds.origin['x'] as number) ?? 0,
        y: (bounds.origin['y'] as number) ?? 0,
        width: (bounds.size['width'] as number) ?? 0,
        height: (bounds.size['height'] as number) ?? 0,
      },
      style: (variant['style'] as Record<string, unknown>) ?? {},
    };
  }

  /** Find a vertex SlotmapId at the given document position (within tolerance). */
  #findVertexAt(x: number, y: number, tolerance = 5): SlotmapId | null {
    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        for (const key of Editor.#SHAPE_KEYS) {
          const variant = e[key] as Record<string, unknown> | undefined;
          if (!variant) continue;
          const idField = variant['id'] as { idx?: number; version?: number } | undefined;
          if (!idField) continue;
          const bounds = variant['bounds'] as
            | { origin?: Record<string, number>; size?: Record<string, number> }
            | undefined;
          if (!bounds?.origin || !bounds?.size) continue;

          const sx = (bounds.origin['x'] as number) ?? 0;
          const sy = (bounds.origin['y'] as number) ?? 0;
          const sw = (bounds.size['width'] as number) ?? 0;
          const sh = (bounds.size['height'] as number) ?? 0;

          if (
            x >= sx - tolerance &&
            x <= sx + sw + tolerance &&
            y >= sy - tolerance &&
            y <= sy + sh + tolerance
          ) {
            return { idx: idField.idx!, version: idField.version! };
          }
        }
      }
    }
    return null;
  }

  /** Extract SlotmapId from a display list element. */
  #extractIdFromDisplayElem(elem: unknown): SlotmapId | null {
    const e = elem as Record<string, unknown>;
    for (const key of Editor.#SHAPE_KEYS) {
      const variant = e[key] as Record<string, unknown> | undefined;
      if (!variant) continue;
      const idField = variant['id'] as { idx?: number; version?: number } | undefined;
      if (!idField) continue;
      return { idx: idField.idx!, version: idField.version! };
    }
    return null;
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
      const geom = this.#findOriginalGeometry(hit);
      if (!geom) return;

      this.#connectState = {
        sourceId: hit,
        sourceX: geom.x + geom.width / 2,
        sourceY: geom.y + geom.height / 2,
        sourceClientX: e.clientX,
        sourceClientY: e.clientY,
        sourceBounds: geom,
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
    this.#cancelConnectDrag();

    // Don't connect a vertex to itself
    if (hit.idx === sourceId.idx && hit.version === sourceId.version) {
      this.#cancelConnect();
      return;
    }

    // Use auto anchors for click-to-connect fallback
    const r = this.#session.connectVerticesAnchored(
      sourceId,
      hit,
      { kind: 'auto' },
      { kind: 'auto' },
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
      const targetBounds = this.#findOriginalGeometry(targetHit);
      if (!targetBounds) {
        this.#cancelConnectDrag();
        this.#cancelConnect();
        return;
      }

      // Compute normalized anchors from the actual drag positions
      const sourceDocPos = this.#clientToDoc(this.#connectState!.sourceClientX, this.#connectState!.sourceClientY);
      const targetDocPos = this.#clientToDoc(e.clientX, e.clientY);

      const sourceNorm = this.#computePerimeterNormalized(sourceBounds, sourceDocPos.x, sourceDocPos.y);
      const targetNorm = this.#computePerimeterNormalized(targetBounds, targetDocPos.x, targetDocPos.y);

      const sourceKind = this.#classifyAnchorKind(sourceNorm.nx, sourceNorm.ny);
      const targetKind = this.#classifyAnchorKind(targetNorm.nx, targetNorm.ny);

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
    const cmd = this.#buildAddVertexCmd(kind, docPos.x, docPos.y);
    const r = this.#session.executeCommand(cmd);
    if (!r.ok) {
      this.#onError(r.error);
    } else {
      this.#replay();
    }

    // Single-placement mode: clear tool after use
    this.setActiveTool(null);
  }

  // ─── Bend Handle Rendering ───────────────────────────────────────────────

  /** Render bend handles for the currently selected edge. */
  #renderBendHandles(): void {
    // Remove old handles
    this.#viewer.querySelectorAll('.bend-handle').forEach((el) => el.remove());

    if (!this.#selectedEdgeId) return;

    // Find the edge's path element in the SVG
    const edgeSelector = `[data-edge-id="${this.#selectedEdgeId.idx}:${this.#selectedEdgeId.version}"]`;
    const pathEl = this.#viewer.querySelector(edgeSelector);
    if (!pathEl) return;

    // Get the edge's waypoints from the scene
    const pts = this.#getEdgeWaypoints(this.#selectedEdgeId);
    // For each intermediate waypoint (not first/last which are source/target centers),
    // create a circle handle
    for (let i = 1; i < pts.length - 1; i++) {
      const pt = pts[i]!;
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      handle.setAttribute('cx', String(pt.x));
      handle.setAttribute('cy', String(pt.y));
      handle.setAttribute('r', '5');
      handle.setAttribute('class', 'bend-handle');
      handle.setAttribute('data-bend-index', String(i));
      handle.setAttribute('fill', '#4a9eff');
      handle.setAttribute('stroke', '#fff');
      handle.setAttribute('stroke-width', '1.5');
      handle.style.cursor = 'move';
      this.#viewer.appendChild(handle);
    }
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

  // ─── Bend Drag FSM ───────────────────────────────────────────────────────

  /** Start dragging a bend handle. */
  #startBendDrag(edgeId: SlotmapId, bendIndex: number, _e: PointerEvent): void {
    this.#bendDrag = { edgeId, bendIndex };
    this.#selectedBendIndex = bendIndex;
    this.#viewer.addEventListener('pointermove', this.#onBendDragMoveBound);
    this.#viewer.addEventListener('pointerup', this.#onBendDragUpBound);
    this.#viewer.addEventListener('pointercancel', this.#onBendDragUpBound);
  }

  /** Handle pointer move during bend drag. */
  #onBendDragMove(e: PointerEvent): void {
    if (!this.#bendDrag) return;
    const docPoint = this.#clientToDoc(e.clientX, e.clientY);
    const snapped = this.#snapToGrid(docPoint.x, docPoint.y);
    this.moveBend(this.#bendDrag.edgeId, this.#bendDrag.bendIndex, snapped.x, snapped.y);
  }

  /** Handle pointer up to end bend drag. */
  #onBendDragUp(): void {
    this.#bendDrag = null;
    this.#viewer.removeEventListener('pointermove', this.#onBendDragMoveBound);
    this.#viewer.removeEventListener('pointerup', this.#onBendDragUpBound);
    this.#viewer.removeEventListener('pointercancel', this.#onBendDragUpBound);
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
        { label: 'Delete', action: () => this.deleteSelection() },
      ];

      showContextMenu(e.clientX, e.clientY, items);
    } else if (edgeHit) {
      const items: ContextMenuItem[] = [
        { label: 'Edit Label', action: () => this.#startEdgeTextEdit(edgeHit, e) },
        { separator: true, label: '', action: () => {} },
        { label: 'Delete Edge', action: () => {
          this.#session.disconnectEdge(edgeHit);
          this.#replay();
        }},
      ];

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
      if (this.#selectedBendIndex !== null && this.#selectedEdgeId) {
        this.removeBend(this.#selectedEdgeId, this.#selectedBendIndex);
        this.#selectedBendIndex = null;
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

    // Ctrl+V → paste
    if (hasMod && e.key === 'v') {
      e.preventDefault();
      this.paste();
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
    if (hasMod && e.key === 'd') {
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

    // Arrow keys → nudge selected shapes (1px, Shift = 10px)
    if (this.#selection.size > 0 && !hasMod) {
      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case 'ArrowLeft': dx = -step; break;
        case 'ArrowRight': dx = step; break;
        case 'ArrowUp': dy = -step; break;
        case 'ArrowDown': dy = step; break;
        default: return;
      }
      e.preventDefault();
      this.#nudgeSelection(dx, dy);
      return;
    }
  }

  /** Move all selected shapes by (dx, dy) via a single atomic transaction. */
  #nudgeSelection(dx: number, dy: number): void {
    if (this.#selection.size === 0) return;
    const cmds: string[] = [];
    for (const id of this.#selection) {
      const el = this.#viewer.querySelector(
        `[data-vertex-id="${id.idx}:${id.version}"]`,
      ) as SVGGraphicsElement | null;
      if (!el) continue;
      const bbox = el.getBBox();
      const newGeom = {
        x: bbox.x + dx,
        y: bbox.y + dy,
        width: bbox.width,
        height: bbox.height,
        relative: false,
      };
      cmds.push(
        JSON.stringify({
          MoveVertex: {
            id: slotmapIdToField(id),
            geometry: newGeom,
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

  /**
   * Compute normalized (0-1) anchor coordinates from shape bounds and a document-space point.
   * Projects the point onto the rectangle perimeter.
   */
  #computePerimeterNormalized(
    bounds: { x: number; y: number; width: number; height: number },
    docX: number,
    docY: number,
  ): { nx: number; ny: number } {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const hw = bounds.width / 2;
    const hh = bounds.height / 2;

    // Direction from center to point
    const dx = docX - cx;
    const dy = docY - cy;

    // Determine which side we exit
    let anchorX: number;
    let anchorY: number;
    let nx: number;
    let ny: number;

    if (Math.abs(dx) * hh > Math.abs(dy) * hw) {
      // Exiting left or right
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
      // Exiting top or bottom
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

    // Clamp to [0, 1]
    nx = Math.max(0, Math.min(1, nx));
    ny = Math.max(0, Math.min(1, ny));

    return { nx, ny };
  }

  /**
   * Classify normalized anchor coordinates as a cardinal direction or "normalized".
   * If within 5% of a cardinal axis, return that cardinal.
   */
  #classifyAnchorKind(
    nx: number,
    ny: number,
  ): 'north' | 'south' | 'east' | 'west' | 'normalized' {
    const threshold = 0.05;
    if (ny <= threshold) return 'north';
    if (ny >= 1 - threshold) return 'south';
    if (nx >= 1 - threshold) return 'east';
    if (nx <= threshold) return 'west';
    return 'normalized';
  }
}
