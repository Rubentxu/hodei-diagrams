import type {
  EngineHandle,
  PageToken,
  Result,
  PageRender,
  EngineError,
  ScenePage,
  SlotmapId,
  StyleChanges,
  ResolvedStyle,
} from './types.js';
import { ok, err, slotmapIdToField } from './types.js';
import type { WasmModule } from './types.js';

export class DiagramEngineSession {
  private readonly wasm: WasmModule;
  private readonly handle: EngineHandle;
  private disposed: boolean;

  private constructor(wasm: WasmModule, handle: EngineHandle) {
    this.wasm = wasm;
    this.handle = handle;
    this.disposed = false;
  }

  static create(wasm: WasmModule): Result<DiagramEngineSession, EngineError> {
    try {
      const raw = wasm.create_engine();
      const handle = raw as EngineHandle;
      return ok(new DiagramEngineSession(wasm, handle));
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.wasm.dispose_engine(this.handle as number);
    } catch {
      // Disposal is best-effort; swallow errors per spec
    }
  }

  get isActive(): boolean {
    return !this.disposed;
  }

  private guard(): Result<void, EngineError> {
    if (this.disposed) {
      return err('Disposed: Engine session was disposed');
    }
    return ok(undefined);
  }

  importDrawio(xml: string): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.import_drawio(this.handle as number, xml);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  renderAllPages(): Result<PageRender[], EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const raw = this.wasm.render_pages(this.handle as number);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        return err('RenderFailed: parse: ' + (e instanceof Error ? e.message : String(e)));
      }
      if (!Array.isArray(parsed)) {
        return err('RenderFailed: unexpected shape: ' + JSON.stringify(parsed).slice(0, 200));
      }
      const pages: PageRender[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const entry = parsed[i] as Record<string, unknown>;
        const pageId = entry['page_id'];
        if (typeof pageId !== 'number') {
          return err('RenderFailed: page_id is not a number at index ' + i);
        }
        // Cache the SVG
        this.svgCache.set(pageId as PageToken, entry['svg'] as string);
        // Use name or default
        const name = typeof entry['name'] === 'string' ? entry['name'] : 'Page ' + (i + 1);
        pages.push({
          pageId: pageId as PageToken,
          name,
          svg: entry['svg'] as string,
        });
      }
      return ok(pages);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  // Internal cache: page_id (number) -> svg string
  private svgCache = new Map<PageToken, string>();

  getPage(token: PageToken): string | null {
    return this.svgCache.get(token) ?? null;
  }

  getLastError(): EngineError | null {
    // v1: WASM bridge does not expose a persistent error queue
    return null;
  }

  // ─── Editor Methods ───────────────────────────────────────────────────────

  /** Execute a command on the engine. */
  executeCommand(cmdJson: string): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.execute_command(this.handle as number, cmdJson);
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Execute multiple commands in sequence.
   * Returns aggregate result: ok if all succeed, first error otherwise.
   */
  executeCommands(cmdJsons: string[]): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      for (const cmd of cmdJsons) {
        this.wasm.execute_command(this.handle as number, cmd);
      }
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Execute multiple commands atomically as a single transaction.
   * All commands are applied in one undo entry; on error all are rolled back.
   * Empty array is a no-op (succeeds without pushing to history).
   */
  executeTransaction(cmdJsons: string[]): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const json = JSON.stringify(cmdJsons);
      this.wasm.execute_transaction(this.handle as number, json);
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  #onStateChange: (() => void) | null = null;

  /**
   * Register a callback that fires after every successful `executeCommand`.
   * Used by the editor to trigger re-renders when the inspector modifies state.
   */
  setOnStateChange(cb: () => void): void {
    this.#onStateChange = cb;
  }

  /** Undo the last command. */
  undo(): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.undo(this.handle as number);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /** Redo the last undone command. */
  redo(): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.redo(this.handle as number);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /** Check if undo is available. */
  canUndo(): boolean {
    if (this.disposed) return false;
    try {
      return this.wasm.engine_can_undo(this.handle as number);
    } catch {
      return false;
    }
  }

  /** Check if redo is available. */
  canRedo(): boolean {
    if (this.disposed) return false;
    try {
      return this.wasm.engine_can_redo(this.handle as number);
    } catch {
      return false;
    }
  }

  /** Get the full scene snapshot as typed pages. */
  getScene(): Result<ScenePage[], EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const raw = this.wasm.get_scene(this.handle as number);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        return err('SceneParse: ' + (e instanceof Error ? e.message : String(e)));
      }
      const obj = parsed as Record<string, unknown>;
      const pages = obj['pages'];
      if (!Array.isArray(pages)) {
        return err('SceneParse: pages is not an array');
      }
      return ok(pages as ScenePage[]);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /** Render a single page by flat index. Returns SVG string. */
  renderPage(pageIdx: number): Result<string, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const svg = this.wasm.render_svg(this.handle as number, BigInt(pageIdx));
      return ok(svg);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  categorizeError(msg: string): {
    kind:
      | 'ExportFailed'
      | 'ImportFailed'
      | 'InvalidCommand'
      | 'InvalidHandle'
      | 'PageNotFound'
      | 'TooManyEngines'
      | 'Unknown';
    raw: string;
  } {
    if (msg.startsWith('ExportFailed')) return { kind: 'ExportFailed', raw: msg };
    if (msg.startsWith('ImportFailed')) return { kind: 'ImportFailed', raw: msg };
    if (msg.startsWith('InvalidCommand')) return { kind: 'InvalidCommand', raw: msg };
    if (msg === 'InvalidHandle') return { kind: 'InvalidHandle', raw: msg };
    if (msg.startsWith('InvalidHandle')) return { kind: 'InvalidHandle', raw: msg };
    if (msg.startsWith('PageNotFound')) return { kind: 'PageNotFound', raw: msg };
    if (msg === 'TooManyEngines') return { kind: 'TooManyEngines', raw: msg };
    if (msg.startsWith('TooManyEngines')) return { kind: 'TooManyEngines', raw: msg };
    return { kind: 'Unknown', raw: msg };
  }

  /** Change the style of a vertex. Dispatches a ChangeStyle command. */
  changeStyle(id: SlotmapId, changes: StyleChanges): Result<void, EngineError> {
    const cmd = JSON.stringify({
      ChangeStyle: {
        id: slotmapIdToField(id),
        changes,
      },
    });
    return this.executeCommand(cmd);
  }

  /** Export the current diagram as a `.drawio` XML string. */
  exportDrawio(): Result<string, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const xml = this.wasm.export_drawio(this.handle as number);
      return ok(xml);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Connect two vertices with an edge.
   * @param from Source vertex SlotmapId
   * @param to Target vertex SlotmapId
   * @param routingKind 'orthogonal' (default) or 'straight'
   * @returns The new edge's SlotmapId, or an error
   */
  connectVertices(
    from: SlotmapId,
    to: SlotmapId,
    routingKind: 'orthogonal' | 'straight' = 'orthogonal',
  ): Result<SlotmapId, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const routingKindVal = routingKind === 'straight' ? 1 : 0;
      const rawEdgeId = this.wasm.connect_vertices(
        this.handle as number,
        from.idx,
        to.idx,
        routingKindVal,
      );
      this.#onStateChange?.();
      return ok({ idx: rawEdgeId, version: 0 });
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Disconnect an edge (remove it from the diagram).
   * @param edgeId The edge to disconnect
   */
  disconnectEdge(edgeId: SlotmapId): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.disconnect_edge(this.handle as number, edgeId.idx);
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Rotate a vertex by a delta angle (radians).
   * @param id The vertex to rotate
   * @param angleDelta The angle in radians to add to the current rotation
   */
  rotateVertex(id: SlotmapId, angleDelta: number): Result<void, EngineError> {
    const cmd = JSON.stringify({
      RotateVertex: {
        id: slotmapIdToField(id),
        angle_delta: angleDelta,
      },
    });
    return this.executeCommand(cmd);
  }

  /**
   * Flip a vertex along an axis.
   * @param id The vertex to flip
   * @param axis 'horizontal' for left-right mirror, 'vertical' for top-bottom mirror
   */
  flipVertex(id: SlotmapId, axis: 'horizontal' | 'vertical'): Result<void, EngineError> {
    const cmd = JSON.stringify({
      FlipVertex: {
        id: slotmapIdToField(id),
        axis: axis === 'horizontal' ? 'Horizontal' : 'Vertical',
      },
    });
    return this.executeCommand(cmd);
  }

  /**
   * Get the resolved style for a vertex.
   * @param id The vertex's SlotmapId
   * @returns The resolved style with typed effect fields, or an error
   */
  getResolvedStyle(id: SlotmapId): Result<ResolvedStyle, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const raw = this.wasm.get_resolved_style(this.handle as number, id.idx);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        return err('ResolvedStyleParse: ' + (e instanceof Error ? e.message : String(e)));
      }
      return ok(parsed as ResolvedStyle);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }
}
