import type { DiagramEngineSession } from './session.js';
import type { SlotmapId, ScenePage, Vertex } from './types.js';
import { parseSlotmapAttr, slotmapIdToField } from './types.js';

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
}

/** Connect-mode FSM state (two-click edge creation). */
interface ConnectState {
  sourceId: SlotmapId;
  /** Document-space position of source center for preview line. */
  sourceX: number;
  sourceY: number;
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
  #previewLine: SVGSVGElement | null = null;
  #sceneCache: ScenePage[] = [];
  #activePageSlotId: SlotmapId | null = null;
  #activePageIdx = 0;
  #onError: ErrorCallback;
  #onStateChange: StateChangeCallback;
  #onSelectionChange: SelectionChangeCallback;
  #onToolChange: ToolChangeCallback;
  #getZoom: () => number;
  #abortController: AbortController | null = null;

  // ─── Inline Text Edit ─────────────────────────────────────────────────────
  #textEdit: TextEditState = null;

  get isTextEditing(): boolean {
    return this.#textEdit !== null;
  }

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

  /** Current active page index. */
  get activePageIdx(): number {
    return this.#activePageIdx;
  }

  set activePageIdx(idx: number) {
    this.#activePageIdx = idx;
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
    // keydown on the document to catch keyboard shortcuts
    document.addEventListener('keydown', (e) => this.#onKeyDown(e), opts);

    // Seed the scene cache so drag operations can find original geometry
    this.refreshScene();
  }

  /** Refresh scene cache from engine. Call after import or page switch. */
  refreshScene(): void {
    const sceneResult = this.#session.getScene();
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

  /** Detach event listeners from the viewer container. */
  detach(): void {
    this.#abortController?.abort();
    this.#abortController = null;
    // Clean up any active drag listeners
    this.#viewer.removeEventListener('pointermove', this.#onPointerMoveBound);
    this.#viewer.removeEventListener('pointerup', this.#onPointerUpBound);
    this.#viewer.removeEventListener('pointercancel', this.#onPointerUpBound);
    this.#dragState = null;
    this.#cancelMarquee();
    this.#cancelConnect();
  }

  /** Execute undo and replay. For toolbar button binding. */
  undoCmd(): void {
    const r = this.#session.undo();
    if (!r.ok) {
      this.#onError(r.error);
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
   * Trigger a re-render of the current page.
   * Called externally when state changes (e.g., from inspector via session callback).
   */
  triggerReplay(): void {
    this.#replay();
  }

  // ─── Inline Text Edit ─────────────────────────────────────────────────────

  /** Start inline text editing for a vertex. Shows an input overlay on the shape. */
  #startTextEdit(vertexId: SlotmapId, e: MouseEvent): void {
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

    this.#textEdit = { vertexId, input, originalLabel };

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
    const { vertexId, input } = this.#textEdit;
    this.#dispatchLabelEdit(vertexId, input.value);
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
    const { input } = this.#textEdit;

    // Remove editing attribute from shape
    const shapeEl = this.#viewer.querySelector(
      `[data-vertex-id="${this.#textEdit.vertexId.idx}:${this.#textEdit.vertexId.version}"]`,
    );
    if (shapeEl) {
      shapeEl.removeAttribute('data-editing');
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

  /** Refresh scene cache and re-render. Called after commands. */
  #replay(): void {
    // Refresh scene cache
    const sceneResult = this.#session.getScene();
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

    const shapeKeys = [
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

    // Validate each selected ID still exists
    const validIds = new Set<SlotmapId>();
    for (const id of this.#selection) {
      const stillExists = this.#sceneCache.some((page) =>
        page.display_list.some((elem: unknown) => {
          const e = elem as Record<string, unknown>;
          for (const key of shapeKeys) {
            const variant = e[key] as Record<string, unknown> | undefined;
            if (!variant) continue;
            const idField = variant['id'] as { idx?: number; version?: number } | undefined;
            if (idField?.idx === id.idx && idField?.version === id.version) {
              return true;
            }
          }
          return false;
        }),
      );
      if (stillExists) {
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

  // ─── Marquee Selection ────────────────────────────────────────────────────

  /** Start marquee selection at document coordinates (x, y). */
  #startMarquee(x: number, y: number): void {
    this.#cancelMarquee();
    this.#marquee = { originX: x, originY: y, currentX: x, currentY: y };
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
    this.#cancelMarquee();
    if (rect.width > 5 || rect.height > 5) {
      this.selectInRect(rect);
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
    const shapeKeys = [
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

    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        for (const key of shapeKeys) {
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
      if (e.shiftKey) {
        // Shift+click on empty: start marquee
        const docPos = this.#clientToDoc(e.clientX, e.clientY);
        this.#startMarquee(docPos.x, docPos.y);
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
    if (e.shiftKey) {
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

    // Handle marquee dragging
    if (this.#marquee) {
      this.#updateMarquee(docPos.x, docPos.y);
      return;
    }

    // Handle shape dragging
    if (!this.#dragState) return;
    this.#dragState.currentX = docPos.x;
    this.#dragState.currentY = docPos.y;

    const dx = this.#dragState.currentX - this.#dragState.startX;
    const dy = this.#dragState.currentY - this.#dragState.startY;

    // Apply CSS transform for visual feedback — only to the dragged shape
    const selector = `[data-vertex-id="${this.#dragState.vertexId.idx}:${this.#dragState.vertexId.version}"]`;
    const el = this.#viewer.querySelector(selector) as HTMLElement | null;
    if (el) {
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }

  #onPointerUp(e: PointerEvent): void {
    // Clean up listeners first
    this.#viewer.removeEventListener('pointermove', this.#onPointerMoveBound);
    this.#viewer.removeEventListener('pointerup', this.#onPointerUpBound);
    this.#viewer.removeEventListener('pointercancel', this.#onPointerUpBound);

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
        },
        page_id: this.#activePageSlotId
          ? slotmapIdToField(this.#activePageSlotId)
          : { idx: 0, version: 0 },
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
        },
        page_id: this.#activePageSlotId
          ? slotmapIdToField(this.#activePageSlotId)
          : { idx: 0, version: 0 },
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
    const shapeKeys = [
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

    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        for (const key of shapeKeys) {
          const variant = e[key] as Record<string, unknown> | undefined;
          if (!variant) continue;
          const idField = variant['id'] as { idx?: number; version?: number } | undefined;
          if (!idField) continue;
          if (idField.idx === vid.idx && idField.version === vid.version) {
            const bounds = variant['bounds'] as
              | { origin?: Record<string, number>; size?: Record<string, number> }
              | undefined;
            if (bounds?.origin && bounds?.size) {
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
    }
    return null;
  }

  // ─── Vertex Access ────────────────────────────────────────────────────────

  /** Get a vertex object by SlotmapId from the scene cache. */
  #getVertex(id: SlotmapId): Vertex | null {
    const shapeKeys = [
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

    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        for (const key of shapeKeys) {
          const variant = e[key] as Record<string, unknown> | undefined;
          if (!variant) continue;
          const idField = variant['id'] as { idx?: number; version?: number } | undefined;
          if (!idField) continue;
          if (idField.idx === id.idx && idField.version === id.version) {
            const bounds = variant['bounds'] as
              | { origin?: Record<string, number>; size?: Record<string, number> }
              | undefined;
            if (bounds?.origin && bounds?.size) {
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
          }
        }
      }
    }
    return null;
  }

  /** Find a vertex SlotmapId at the given document position (within tolerance). */
  #findVertexAt(x: number, y: number, tolerance = 5): SlotmapId | null {
    const shapeKeys = [
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

    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        for (const key of shapeKeys) {
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
    const shapeKeys = [
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
    for (const key of shapeKeys) {
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
   * First click: records source vertex and shows preview line.
   * Second click: creates the edge and resets.
   */
  #onConnectClick(e: PointerEvent): void {
    const hit = this.#hitTest(e);
    if (!hit) {
      // Clicked empty space — cancel connect mode
      this.#cancelConnect();
      return;
    }

    if (!this.#connectState) {
      // First click: record source
      const geom = this.#findOriginalGeometry(hit);
      if (!geom) return;
      this.#connectState = {
        sourceId: hit,
        sourceX: geom.x + geom.width / 2,
        sourceY: geom.y + geom.height / 2,
      };
      this.#showPreviewLine(this.#connectState.sourceX, this.#connectState.sourceY);
      return;
    }

    // Second click: create edge
    const sourceId = this.#connectState.sourceId;
    this.#hidePreviewLine();

    // Don't connect a vertex to itself
    if (hit.idx === sourceId.idx && hit.version === sourceId.version) {
      this.#cancelConnect();
      return;
    }

    const r = this.#session.connectVertices(sourceId, hit, 'orthogonal');
    if (!r.ok) {
      this.#onError(r.error);
    } else {
      this.#replay();
    }

    this.#connectState = null;
  }

  /** Cancel connect mode and clean up preview. */
  #cancelConnect(): void {
    this.#hidePreviewLine();
    this.#connectState = null;
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

  // ─── Double-Click Text Edit ───────────────────────────────────────────────

  /** Handle dblclick on the viewer: start text edit on the hit shape. */
  #onDblClick(e: MouseEvent): void {
    const target = e.target as Element | null;
    if (!target) return;
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

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  #onKeyDown(e: KeyboardEvent): void {
    // Ignore when focused on input elements
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

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

    // Delete / Backspace → delete selection
    if (e.key === 'Delete' || e.key === 'Backspace') {
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
    if (hasMod && e.key === 'a') {
      e.preventDefault();
      this.selectAll();
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
  }
}
