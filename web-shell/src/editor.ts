import type { DiagramEngineSession } from './session.js';
import type { SlotmapId, ScenePage } from './types.js';
import { parseSlotmapAttr, slotmapIdToField } from './types.js';
import { applySelectionClass } from './renderer.js';

/** Active tool from the palette. */
export type ToolKind = 'rectangle' | 'ellipse' | null;

/** Drag FSM state. */
interface DragState {
  vertexId: SlotmapId;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

/** Error callback type. */
type ErrorCallback = (msg: string) => void;

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
  #sceneCache: ScenePage[] = [];
  #activePageSlotId: SlotmapId | null = null;
  #activePageIdx = 0;
  #onError: ErrorCallback;
  #abortController: AbortController | null = null;

  constructor(
    session: DiagramEngineSession,
    viewer: HTMLElement,
    onError?: ErrorCallback,
  ) {
    this.#session = session;
    this.#viewer = viewer;
    this.#onError = onError ?? (() => {});
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
    this.#activeTool = tool;
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

  /** Detach event listeners from the viewer container. */
  detach(): void {
    this.#abortController?.abort();
    this.#abortController = null;
    // Clean up any active drag listeners
    this.#viewer.removeEventListener('pointermove', this.#onPointerMoveBound);
    this.#viewer.removeEventListener('pointerup', this.#onPointerUpBound);
    this.#viewer.removeEventListener('pointercancel', this.#onPointerUpBound);
    this.#dragState = null;
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

    // Re-render the active page
    const renderResult = this.#session.renderPage(this.#activePageIdx);
    if (!renderResult.ok) {
      this.#onError(renderResult.error);
      return;
    }
    // Inject SVG into viewer container
    const svg = renderResult.value;
    this.#viewer.innerHTML = svg;

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
  }

  /** After re-render, validate selection and re-apply CSS class. */
  #reapplySelection(): void {
    if (this.#selectedId === null) return;

    // Validate the selected ID still exists in the current scene
    const stillExists = this.#sceneCache.some((page) =>
      page.display_list.some((elem: unknown) => {
        const e = elem as Record<string, unknown>;
        // Check through externally-tagged variants
        for (const key of ['Rect', 'RoundedRect', 'Ellipse'] as const) {
          const variant = e[key] as Record<string, unknown> | undefined;
          if (!variant) continue;
          const idField = variant['id'] as { idx?: number; version?: number } | undefined;
          if (idField?.idx === this.#selectedId!.idx && idField?.version === this.#selectedId!.version) {
            return true;
          }
        }
        return false;
      }),
    );

    if (!stillExists) {
      // Selection is stale — clear it
      this.#selectedId = null;
      return;
    }

    // Re-apply CSS class to the new DOM element
    const selector = `[data-vertex-id="${this.#selectedId.idx}:${this.#selectedId.version}"]`;
    const el = this.#viewer.querySelector(selector);
    if (el) {
      el.classList.add('selected');
    } else {
      this.#selectedId = null;
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

    this.#dragState = {
      vertexId: hit,
      startX: e.offsetX,
      startY: e.offsetY,
      currentX: e.offsetX,
      currentY: e.offsetY,
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
    this.#dragState.currentX = e.offsetX;
    this.#dragState.currentY = e.offsetY;

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
    kind: 'Rectangle' | 'Ellipse',
    x: number,
    y: number,
  ): string {
    const width = kind === 'Rectangle' ? 120 : 100;
    const height = kind === 'Rectangle' ? 80 : 80;
    return JSON.stringify({
      AddVertex: {
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
      },
    });
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
    for (const page of this.#sceneCache) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        // Scene elements are externally-tagged: {"Rect": {"id": ..., "bounds": ...}}
        // Iterate through possible variant keys
        for (const key of ['Rect', 'RoundedRect', 'Ellipse'] as const) {
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

  // ─── Palette ─────────────────────────────────────────────────────────────

  /** Handle click when a palette tool is active. */
  #onPaletteClick(e: PointerEvent): void {
    if (!this.#activeTool) return;

    const kind = this.#activeTool === 'rectangle' ? 'Rectangle' : 'Ellipse';
    const cmd = this.#buildAddVertexCmd(kind, e.offsetX, e.offsetY);
    const r = this.#session.executeCommand(cmd);
    if (!r.ok) {
      this.#onError(r.error);
    } else {
      this.#replay();
    }

    // Single-placement mode: clear tool after use
    this.#activeTool = null;
  }

  // ─── Keyboard ────────────────────────────────────────────────────────────

  #onKeyDown(e: KeyboardEvent): void {
    // Ignore when focused on input elements
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

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
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === 'y' || (e.key === 'z' && e.shiftKey))
    ) {
      e.preventDefault();
      this.redoCmd();
      return;
    }
  }
}
