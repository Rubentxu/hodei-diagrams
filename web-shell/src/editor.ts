import type { DiagramEngineSession } from './session.js';
import type { SlotmapId, ScenePage } from './types.js';
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
  | 'connector'
  | null;

/** Drag FSM state. */
interface DragState {
  vertexId: SlotmapId;
  startX: number;
  startY: number;
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
type SelectionChangeCallback = (_id: SlotmapId | null) => void;
/** Tool-change callback type (fired when active tool changes). */
type ToolChangeCallback = (_tool: ToolKind) => void;

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
  #selectedId: SlotmapId | null = null;
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

  /** Current selection. */
  get selection(): SlotmapId | null {
    return this.#selectedId;
  }

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

  // ─── Public API ──────────────────────────────────────────────────────────

  /** Attach event listeners to the viewer container. */
  attach(): void {
    if (this.#abortController) return; // already attached
    this.#abortController = new AbortController();
    const signal = this.#abortController.signal;
    const opts = { signal };

    this.#viewer.addEventListener('pointerdown', (e) => this.#onPointerDown(e), opts);
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

  // ─── Coordinate Conversion ───────────────────────────────────────────────

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
    // page.page_id.idx is the slotmap ID index which corresponds to the engine's page index
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

  // ─── Selection ───────────────────────────────────────────────────────────

  /** Select a vertex by SlotmapId, applying CSS class. */
  #select(id: SlotmapId | null): void {
    // Remove .selected from all elements
    this.#viewer.querySelectorAll('[data-vertex-id]').forEach((el) => {
      el.classList.remove('selected');
    });
    this.#selectedId = id;
    if (id !== null) {
      const selector = `[data-vertex-id="${id.idx}:${id.version}"]`;
      const el = this.#viewer.querySelector(selector);
      if (el) {
        el.classList.add('selected');
      }
    }
    // Notify selection change (for inspector, etc.)
    this.#onSelectionChange(id);
  }

  /** After re-render, validate selection and re-apply CSS class. */
  #reapplySelection(): void {
    if (this.#selectedId === null) return;

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

    // Validate the selected ID still exists in the current scene
    const stillExists = this.#sceneCache.some((page) =>
      page.display_list.some((elem: unknown) => {
        const e = elem as Record<string, unknown>;
        // Check through externally-tagged variants
        for (const key of shapeKeys) {
          const variant = e[key] as Record<string, unknown> | undefined;
          if (!variant) continue;
          const idField = variant['id'] as { idx?: number; version?: number } | undefined;
          if (
            idField?.idx === this.#selectedId!.idx &&
            idField?.version === this.#selectedId!.version
          ) {
            return true;
          }
        }
        return false;
      }),
    );

    if (!stillExists) {
      // Selection is stale — clear it
      this.#selectedId = null;
      this.#onSelectionChange(null);
      return;
    }

    // Re-apply CSS class to the new DOM element
    const selector = `[data-vertex-id="${this.#selectedId.idx}:${this.#selectedId.version}"]`;
    const el = this.#viewer.querySelector(selector);
    if (el) {
      el.classList.add('selected');
    } else {
      this.#selectedId = null;
      this.#onSelectionChange(null);
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

  // ─── Drag FSM ────────────────────────────────────────────────────────────

  #onPointerDown(e: PointerEvent): void {
    // Ignore non-primary button
    if (e.button !== 0) return;

    // If tool is active, handle palette placement instead
    if (this.#activeTool) {
      this.#onPaletteClick(e);
      return;
    }

    // Connect mode is handled via a separate two-click FSM
    if (this.#activeTool === 'connector') {
      this.#onConnectClick(e);
      return;
    }

    const hit = this.#hitTest(e);
    if (!hit) {
      // Click on empty area: deselect
      this.#select(null);
      return;
    }

    // Select on mousedown
    this.#select(hit);

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
    if (!this.#dragState) return;
    const docPos = this.#clientToDoc(e.clientX, e.clientY);
    this.#dragState.currentX = docPos.x;
    this.#dragState.currentY = docPos.y;

    const dx = this.#dragState.currentX - this.#dragState.startX;
    const dy = this.#dragState.currentY - this.#dragState.startY;

    // Apply CSS transform for visual feedback
    const selector = `[data-vertex-id="${this.#dragState.vertexId.idx}:${this.#dragState.vertexId.version}"]`;
    const el = this.#viewer.querySelector(selector) as HTMLElement | null;
    if (el) {
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }

  #onPointerUp(_e: PointerEvent): void {
    if (!this.#dragState) return;

    const dx = this.#dragState.currentX - this.#dragState.startX;
    const dy = this.#dragState.currentY - this.#dragState.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Remove CSS transform
    const selector = `[data-vertex-id="${this.#dragState.vertexId.idx}:${this.#dragState.vertexId.version}"]`;
    const el = this.#viewer.querySelector(selector) as HTMLElement | null;
    if (el) {
      el.style.transform = '';
    }

    // Only commit if drag exceeded threshold
    if (distance >= 3) {
      this.#commitMove(this.#dragState.vertexId, dx, dy);
    }

    // Clean up listeners
    this.#viewer.removeEventListener('pointermove', this.#onPointerMoveBound);
    this.#viewer.removeEventListener('pointerup', this.#onPointerUpBound);
    this.#viewer.removeEventListener('pointercancel', this.#onPointerUpBound);
    this.#dragState = null;
  }

  // ─── Command Builders ────────────────────────────────────────────────────

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
    kind: 'Rectangle' | 'RoundedRect' | 'Ellipse' | 'Diamond' | 'Triangle' | 'Hexagon' | 'Cylinder' | 'Cloud' | 'Parallelogram' | 'Trapezoid' | 'Polygon',
    x: number,
    y: number
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
      const interval = (this.#previewLine as SVGSVGElement & { _interval?: ReturnType<typeof setInterval> })._interval;
      if (interval) clearInterval(interval);
      this.#previewLine.remove();
      this.#previewLine = null;
    }
  }

  // ─── Palette ─────────────────────────────────────────────────────────────

  /** Handle click when a palette tool is active. */
  #onPaletteClick(e: PointerEvent): void {
    if (!this.#activeTool) return;

    const kindMap: Record<string, 'Rectangle' | 'RoundedRect' | 'Ellipse' | 'Diamond' | 'Triangle' | 'Hexagon' | 'Cylinder' | 'Cloud' | 'Parallelogram' | 'Trapezoid' | 'Polygon'> = {
      'rectangle': 'Rectangle',
      'rounded-rect': 'RoundedRect',
      'ellipse': 'Ellipse',
      'diamond': 'Diamond',
      'triangle': 'Triangle',
      'hexagon': 'Hexagon',
      'cylinder': 'Cylinder',
      'cloud': 'Cloud',
      'parallelogram': 'Parallelogram',
      'trapezoid': 'Trapezoid',
      'polygon': 'Polygon',
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

  // ─── Keyboard ────────────────────────────────────────────────────────────

  #onKeyDown(e: KeyboardEvent): void {
    // Ignore when focused on input elements
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // Escape → cancel connect mode
    if (e.key === 'Escape' && this.#connectState) {
      this.#cancelConnect();
      return;
    }

    // Delete / Backspace → RemoveVertex
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.#selectedId === null) return; // no-op
      const cmd = this.#buildRemoveVertexCmd(this.#selectedId);
      const r = this.#session.executeCommand(cmd);
      if (!r.ok) {
        this.#onError(r.error);
        return;
      }
      this.#replay();
      return;
    }

    // Ctrl+Z / Cmd+Z → Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undoCmd();
      return;
    }

    // Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z → Redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      this.redoCmd();
      return;
    }
  }
}
