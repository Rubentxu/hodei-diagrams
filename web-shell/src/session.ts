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
  MetadataInfo,
  PageLayers,
} from './types.js';
import { ok, err, slotmapIdToField, EMPTY_METADATA } from './types.js';
import type { WasmModule } from './types.js';
import { decodeSceneFromBytes } from './postcard-decoder.js';

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
      this.svgCache.clear();
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
        const pageIdRaw = entry['page_id'];
        // The engine now serializes page_id as the full slotmap key
        // `{ idx, version }`. Older runtimes sent a bare u64; we accept
        // both for backward compatibility.
        let slotmapId: { idx: number; version: number };
        if (
          typeof pageIdRaw === 'object' &&
          pageIdRaw !== null &&
          'idx' in pageIdRaw &&
          'version' in pageIdRaw
        ) {
          const obj = pageIdRaw as { idx: number; version: number };
          slotmapId = { idx: obj.idx, version: obj.version };
        } else if (typeof pageIdRaw === 'number') {
          slotmapId = { idx: pageIdRaw, version: 0 };
        } else {
          return err(
            'RenderFailed: page_id has unexpected shape at index ' +
              i +
              ': ' +
              JSON.stringify(pageIdRaw),
          );
        }
        const pageId = slotmapId.idx as PageToken;
        // Cache the SVG
        this.svgCache.set(pageId, entry['svg'] as string);
        // Use name or default
        const name = typeof entry['name'] === 'string' ? entry['name'] : 'Page ' + (i + 1);
        pages.push({
          pageId,
          slotmapId,
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
      this.svgCache.clear();
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
      this.svgCache.clear();
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
      // The Rust side deserializes a Vec<Command>, not a Vec<String>.
      // We must re-serialize the parsed objects so each element is a real
      // Command object (not a stringified blob that serde rejects with
      // "unknown variant").
      const commands = cmdJsons.map((s) => JSON.parse(s));
      const json = JSON.stringify(commands);
      this.wasm.execute_transaction(this.handle as number, json);
      this.svgCache.clear();
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
      this.svgCache.clear();
      this.#onStateChange?.();
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
      this.svgCache.clear();
      this.#onStateChange?.();
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

  /** Get the full scene JSON string directly from the WASM engine.
   *  Bypasses any in-memory cache in the editor (e.g. `#sceneCache`)
   *  so callers can inspect what the engine actually holds. Used by
   *  `__hodeiDebug.fetchSceneFresh` for E2E diagnostics. */
  fetchSceneJson(): Result<string, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      return ok(this.wasm.get_scene(this.handle as number));
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
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

  /**
   * Get all layers for a given page index.
   *
   * IP-F PR5: Used by the Layers panel UI to enumerate and display layers.
   */
  getLayers(pageIdx: number): Result<PageLayers, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const raw = this.wasm.get_page_layers(this.handle as number, pageIdx);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        return err('LayersParse: ' + (e instanceof Error ? e.message : String(e)));
      }
      return ok(parsed as PageLayers);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Pure scene decode: deserialize the scene from the WASM scene buffer
   * using the TypeScript postcard decoder — no intermediate JSON string, no SVG.
   *
   * Returns the decoded `ScenePage[]` on success, or falls back to the JSON
   * path if the buffer is unavailable or decoding fails.
   *
   * This is the fast path for benchmarking scene decode in isolation:
   * WASM → postcard bytes → typed Scene (no SVG side effects).
   *
   * NOTE: caller must NOT hold the returned `bytes` view across any subsequent
   * WASM call — the view is invalidated if memory grows. Decode immediately.
   */
  decodeSceneBuffer(): Result<ScenePage[], EngineError> {
    const g = this.guard();
    if (!g.ok) return g;

    // Step 1: read scene bytes (zero-copy view, invalidated by next WASM call)
    const sceneBytes = this.readSceneBuffer();
    if (sceneBytes.byteLength === 0) {
      return this.getScene();
    }

    // Step 2: decode scene BEFORE any other WASM call (memory could grow)
    const scene = decodeSceneFromBytes(sceneBytes);
    if (scene === null) {
      return this.getScene();
    }

    return ok(scene.pages as unknown as ScenePage[]);
  }

  /**
   * Scene decode + SVG fetch: deserializes the scene from the WASM scene buffer
   * (via the postcard decoder) and then fetches the SVG buffer for each page.
   *
   * This is the combined path for callers that need both the decoded scene
   * structure AND the rendered SVG. For decode-only benchmarking, use
   * `decodeSceneBuffer()` instead.
   *
   * Returns `PageRender[]` with SVG strings filled in.
   */
  getScenePostcard(): Result<PageRender[], EngineError> {
    const g = this.guard();
    if (!g.ok) return g;

    // Decode scene first (no SVG side effects in this phase)
    const sceneResult = this.decodeSceneBuffer();
    if (!sceneResult.ok) return sceneResult;

    // Now safe to call readSvgBuffer for each page
    const pages: PageRender[] = sceneResult.value.map((page) => {
      const pageId = page.page_id.idx as PageToken;
      const svgBytes = this.readSvgBuffer(page.page_id.idx);
      const svg = svgBytes.byteLength > 0
        ? new TextDecoder().decode(svgBytes)
        : '';
      this.svgCache.set(pageId, svg);
      return {
        pageId,
        slotmapId: page.page_id,
        name: page.name,
        svg,
      };
    });
    return ok(pages);
  }

  /**
   * Zero-copy scene buffer: serializes the scene as postcard bytes into a
   * pre-allocated slab in WASM linear memory. Returns `{ptr, len}` so the
   * caller can create a `Uint8Array` view without any JSON round-trip.
   *
   * The caller is responsible for creating the view immediately after
   * this call returns — the pointer is invalidated by any subsequent WASM
   * call that might grow memory.
   *
   * If the WASM module does not export `write_scene_to_buffer` (older
   * builds), returns `{ptr: 0, len: 0}` to signal "use JSON fallback".
   */
  writeSceneBuffer(): Result<{ ptr: number; len: number }, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      if (typeof this.wasm.write_scene_to_buffer !== 'function') {
        return ok({ ptr: 0, len: 0 });
      }
      const handle = this.handle as number;
      const len = this.wasm.write_scene_to_buffer(handle);
      const ptr = this.wasm.get_scene_buffer_ptr(handle);
      return ok({ ptr, len });
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Read the scene buffer as a `Uint8Array` view into WASM linear memory.
   *
   * Convenience wrapper that pairs `writeSceneBuffer` with
   * `new Uint8Array(wasm.memory.buffer, ptr, len)`. The returned view is
   * zero-copy — it shares the same backing memory as the WASM slab.
   *
   * If the WASM module is older, returns an empty `Uint8Array` (0 length).
   * Use the buffer's `length` to detect the fallback.
   */
  readSceneBuffer(): Uint8Array {
    const r = this.writeSceneBuffer();
    if (!r.ok) return new Uint8Array(0);
    if (r.value.len === 0) return new Uint8Array(0);
    const mem = (this.wasm as unknown as { memory?: WebAssembly.Memory }).memory;
    if (!mem) return new Uint8Array(0);
    return new Uint8Array(mem.buffer, r.value.ptr, r.value.len);
  }

  /**
   * Zero-copy SVG buffer: renders the page to a pre-allocated slab in
   * WASM linear memory. Returns `{ptr, len}` for `Uint8Array` view creation.
   *
   * Same safety contract as `writeSceneBuffer` — never hold a view across
   * a WASM call. Decode with `new TextDecoder().decode(new Uint8Array(...))`
   * to get the SVG string without any String round-trip.
   *
   * If the WASM module does not export `write_svg_to_buffer` (older builds),
   * returns `{ptr: 0, len: 0}` to signal "use String fallback".
   *
   * @param pageIdx - page index to render
   * @param viewport - optional viewport rect for culling; defaults to sentinel (0,0,0,0) = full render
   */
  writeSvgBuffer(pageIdx: number, viewport?: { x: number; y: number; w: number; h: number }): Result<{ ptr: number; len: number }, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      if (typeof this.wasm.write_svg_to_buffer !== 'function') {
        return ok({ ptr: 0, len: 0 });
      }
      const handle = this.handle as number;
      const { x = 0, y = 0, w = 0, h = 0 } = viewport ?? {};
      const len = this.wasm.write_svg_to_buffer(handle, BigInt(pageIdx), x, y, w, h);
      const ptr = this.wasm.get_svg_buffer_ptr(handle);
      return ok({ ptr, len });
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Read the SVG buffer as a `Uint8Array` view into WASM linear memory.
   *
   * Convenience wrapper that pairs `writeSvgBuffer` with
   * `new Uint8Array(wasm.memory.buffer, ptr, len)`. Use `TextDecoder` on
   * the returned view to get the SVG string.
   */
  readSvgBuffer(pageIdx: number): Uint8Array {
    const r = this.writeSvgBuffer(pageIdx);
    if (!r.ok) return new Uint8Array(0);
    if (r.value.len === 0) return new Uint8Array(0);
    const mem = (this.wasm as unknown as { memory?: WebAssembly.Memory }).memory;
    if (!mem) return new Uint8Array(0);
    return new Uint8Array(mem.buffer, r.value.ptr, r.value.len);
  }

  /**
   * Zero-copy command dispatch: writes postcard-encoded `Vec<Command>`
   * bytes to the engine's command buffer, then calls `flush_commands` to
   * apply them as an atomic batch.
   *
   * The caller is responsible for:
   *  1. Getting the buffer ptr+capacity via `getCommandBufferPtr()` /
   *     `getCommandBufferCapacity()`.
   *  2. Encoding the commands as postcard (e.g. via
   *     `postcard::to_allocvec` in a WebAssembly module) and writing
   *     them into the buffer via `DataView.setUint8(...)`.
   *  3. Calling `flushCommands(written_len)` to apply.
   *
   * Returns the buffer ptr+capacity so the caller can build a
   * `Uint8Array` view. Same "never hold a view across a WASM call"
   * contract as `writeSceneBuffer`.
   *
   * If the WASM module is older, returns `{ptr: 0, capacity: 0}` to
   * signal "use `executeTransaction` with JSON instead".
   */
  getCommandBuffer(): Result<{ ptr: number; capacity: number }, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      if (typeof this.wasm.command_buffer_ptr !== 'function') {
        return ok({ ptr: 0, capacity: 0 });
      }
      const handle = this.handle as number;
      const ptr = this.wasm.command_buffer_ptr(handle);
      const capacity = this.wasm.command_buffer_capacity(handle);
      return ok({ ptr, capacity });
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Apply the bytes written to the command buffer (via
   * `getCommandBuffer()` + a postcard encoder in JS) as an atomic batch.
   * Returns Ok on success, or an error if deserialization or any command
   * application fails (the engine rolls back applied commands on error).
   *
   * The buffer is cleared on success.
   */
  flushCommands(written_len: number): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      if (typeof this.wasm.flush_commands !== 'function') {
        return err('flush_commands not available');
      }
      this.wasm.flush_commands(this.handle as number, written_len);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /** Render a single page by flat index. Returns SVG string.
   *
   * @param pageIdx - page index to render
   * @param viewport - optional viewport rect for culling; defaults to sentinel (0,0,0,0) = full render
   */
  renderPage(pageIdx: number, viewport?: { x: number; y: number; w: number; h: number }): Result<string, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const handle = this.handle as number;
      const { x = 0, y = 0, w = 0, h = 0 } = viewport ?? {};
      const svg = this.wasm.render_svg(handle, BigInt(pageIdx), x, y, w, h);
      // Keep cache in sync so getPage() stays reliable
      this.svgCache.set(pageIdx as PageToken, svg);
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
      | 'MetadataError'
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
    if (msg.startsWith('MetadataError')) return { kind: 'MetadataError', raw: msg };
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
   * Export using a synthesized IdMap (no import context required).
   * Useful when the editor was bootstrapped programmatically and
   * `exportDrawio` fails with `ExportFailed: no import context`.
   */
  exportDrawioFresh(): Result<string, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const xml = this.wasm.export_drawio_fresh_engine(this.handle as number);
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
   * @param sourcePort 0=auto, 1=N, 2=E, 3=S, 4=W (default: 0)
   * @param targetPort 0=auto, 1=N, 2=E, 3=S, 4=W (default: 0)
   * @returns The new edge's SlotmapId, or an error
   */
  connectVertices(
    from: SlotmapId,
    to: SlotmapId,
    routingKind: 'orthogonal' | 'straight' = 'orthogonal',
    sourcePort: number = 0,
    targetPort: number = 0,
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
        sourcePort,
        targetPort,
      );
      // Decode scene immediately to get the actual version assigned by the engine.
      const actualVersion = this.#decodeEdgeVersion(rawEdgeId);
      this.#onStateChange?.();
      return ok({ idx: rawEdgeId, version: actualVersion });
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Decode the actual version of an edge by scanning the scene cache.
   * Used after connectVertices / connectVerticesAnchored because the WASM
   * bindings only return u32 (idx); the version is managed internally.
   * Returning the correct version is required for findEdgeVariant lookups
   * (used by bend overlay, port overlay, hit-testing).
   *
   * Returns 0 if the edge is not found in the current scene (which should
   * not happen if writeSceneBuffer was called first).
   */
  #decodeEdgeVersion(idx: number): number {
    this.writeSceneBuffer();
    const sceneResult = this.decodeSceneBuffer();
    if (!sceneResult.ok) return 0;
    for (const page of sceneResult.value) {
      for (const elem of page.display_list) {
        if (!elem) continue;
        const e = elem as Record<string, unknown>;
        for (const key of ['Line', 'Path']) {
          const variant = e[key] as Record<string, unknown> | undefined;
          if (!variant) continue;
          const idField = variant['id'] as { idx?: unknown; version?: unknown } | undefined;
          if (idField?.idx === idx && typeof idField?.version === 'number') {
            return idField.version;
          }
        }
      }
    }
    return 0;
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

  /**
   * Add a vertex from a dynamic stencil library shape at the given canvas position.
   *
   * The shape is referenced as `stencil:<library>:<name>` (e.g. `stencil:flowchart:Process`).
   *
   * @param library The library name (e.g. "flowchart")
   * @param name The shape name within the library (e.g. "Process")
   * @param x The X coordinate in document space
   * @param y The Y coordinate in document space
   * @param pageId The page to add the vertex to (optional, defaults to { idx: 0, version: 0 })
   * @returns The new vertex's SlotmapId, or an error
   */
  addStencilVertex(
    library: string,
    name: string,
    x: number,
    y: number,
    pageId?: SlotmapId,
    opts?: {
      /** Override geometry fields (defaults: x, y, width=80, height=80, rotation=0, flip_h=false, flip_v=false) */
      geometry?: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        rotation?: number;
        flip_h?: boolean;
        flip_v?: boolean;
      };
      /**
       * Style overrides applied on top of the stencil's default.
       * SHAPE-008 (Shift): fill=#ffffff stroke=none (ignore stencil default style).
       */
      styleOverride?: {
        fill?: string;
        stroke?: string;
      };
    },
  ): Result<SlotmapId, EngineError> {
    const geom = opts?.geometry;
    const styleOverride = opts?.styleOverride;
    const cmd = JSON.stringify({
      AddVertex: {
        vertex: {
          geometry: {
            x: geom?.x ?? x,
            y: geom?.y ?? y,
            width: geom?.width ?? 80,
            height: geom?.height ?? 80,
            relative: false,
            rotation: geom?.rotation ?? 0,
            flip_h: geom?.flip_h ?? false,
            flip_v: geom?.flip_v ?? false,
          },
          page_id: pageId ? slotmapIdToField(pageId) : { idx: 0, version: 0 },
          z_order: 0,
          locked: false,
          visible: true,
        },
        style: {
          shape: `stencil:${library}:${name}`,
          ...(styleOverride?.fill !== undefined ? { fill: styleOverride.fill } : {}),
          ...(styleOverride?.stroke !== undefined ? { stroke: styleOverride.stroke } : {}),
        },
      },
    });
    const r = this.executeCommand(cmd);
    if (!r.ok) return r;
    return ok({ idx: 0, version: 0 });
  }

  /**
   * Load a stencil library XML file from a URL into the engine's cache.
   *
   * After loading, shapes in the library can be referenced as
   * `stencil:<library>:<name>` (e.g. `stencil:general:Rectangle`).
   *
   * Failures are logged to the console and do not throw.
   */
  async loadStencilLibrary(library: string, url: string): Promise<void> {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`[session] Failed to fetch stencil library "${library}" from ${url}: ${resp.status} ${resp.statusText}`);
        return;
      }
      const xml = await resp.text();
      // Validate that the XML parses before calling set_stencil_library
      this.wasm.parse_stencil_library_xml(xml); // throws on parse error
      const r = this.setStencilLibrary(library, xml);
      if (!r.ok) {
        console.error(`[session] Failed to register stencil library "${library}": ${r.error}`);
      }
    } catch (e) {
      console.error(`[session] Failed to load stencil library "${library}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Register already-loaded stencil XML in the engine cache. */
  setStencilLibrary(library: string, xml: string): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.set_stencil_library(this.handle as number, library, xml);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Get the current diagram metadata from the engine.
   *
   * Returns `EMPTY_METADATA` if no metadata has been set.
   */
  getMetadata(): Result<MetadataInfo, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const raw = this.wasm.get_metadata(this.handle as number);
      if (raw === 'null') {
        return ok(EMPTY_METADATA);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        return err('MetadataError: parse: ' + (e instanceof Error ? e.message : String(e)));
      }
      return ok(parsed as MetadataInfo);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Set the diagram metadata in the engine.
   *
   * The engine will stamp `modified` to the current time and set `created`
   * if it is still at the default epoch.
   */
  setMetadata(info: MetadataInfo): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      // Serialize with all six fields present (even nulls) to match DTO contract
      const json = JSON.stringify(info);
      this.wasm.set_metadata(this.handle as number, json);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Apply a layout algorithm to the current page.
   * @param kind Layout kind string (e.g. "Organic", "Tree", "Hierarchical")
   * @param config Optional layout-specific configuration
   */
  applyLayout(kind: string, config: object = {}): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.apply_layout(this.handle as number, JSON.stringify(kind), JSON.stringify(config));
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Apply the Hierarchical layout algorithm to the current page.
   *
   * This is separate from `applyLayout` because `HierarchicalLayout` mutates
   * the store in-place, unlike other layouts that return a `TreeLayoutResult`.
   *
   * @param config Optional layout-specific configuration
   */
  applyHierarchicalLayout(config: object = {}): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.apply_hierarchical_layout(this.handle as number, JSON.stringify(config));
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Re-route all edges on the current page using orthogonal routing.
   *
   * After moving vertices, edges retain their old waypoints. This function recomputes
   * orthogonal routes for all edges on the first page and commits the results as a
   * single atomic transaction (one undo reverts all).
   */
  routeAllEdges(): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.route_all_edges(this.handle as number);
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Insert a Z-bend into an edge at a click position on the given segment.
   * @param edgeId The edge's SlotmapId
   * @param segmentIndex The waypoint segment index (0 = between waypoint 0 and 1)
   * @param x Click X coordinate in document space
   * @param y Click Y coordinate in document space
   */
  insertBend(edgeId: SlotmapId, segmentIndex: number, x: number, y: number): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.insert_bend(this.handle as number, edgeId.idx, segmentIndex, x, y);
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Move an existing bend point to a new position.
   * @param edgeId The edge's SlotmapId
   * @param bendIndex The waypoint index of the bend to move
   * @param x New X coordinate in document space
   * @param y New Y coordinate in document space
   */
  moveBend(edgeId: SlotmapId, bendIndex: number, x: number, y: number): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.move_bend(this.handle as number, edgeId.idx, bendIndex, x, y);
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Remove a bend point from an edge.
   * @param edgeId The edge's SlotmapId
   * @param bendIndex The waypoint index of the bend to remove
   */
  removeBend(edgeId: SlotmapId, bendIndex: number): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.remove_bend(this.handle as number, edgeId.idx, bendIndex);
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Group selected vertices into a new container group.
   * @param ids Array of vertex SlotmapIds to group
   * @returns Error if grouping fails
   */
  groupVertices(ids: SlotmapId[]): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const indices = ids.map((id) => id.idx);
      const json = JSON.stringify(indices);
      this.wasm.group_vertices(this.handle as number, json);
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Ungroup a vertex by removing it from its parent group.
   * @param id The vertex SlotmapId to ungroup
   * @returns Error if ungrouping fails
   */
  ungroupVertices(id: SlotmapId): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.ungroup_vertices(this.handle as number, id.idx);
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Connect two vertices with an edge, using the specified anchors.
   * @param from Source vertex SlotmapId
   * @param to Target vertex SlotmapId
   * @param sourceAnchor Anchor specification: { kind: 'auto'|'north'|'south'|'east'|'west'|'normalized', nx?: number, ny?: number }
   * @param targetAnchor Anchor specification: { kind: 'auto'|'north'|'south'|'east'|'west'|'normalized', nx?: number, ny?: number }
   * @returns The new edge's SlotmapId, or an error
   */
  connectVerticesAnchored(
    from: SlotmapId,
    to: SlotmapId,
    sourceAnchor: { kind: string; nx?: number; ny?: number },
    targetAnchor: { kind: string; nx?: number; ny?: number },
  ): Result<SlotmapId, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const rawEdgeId = this.wasm.connect_vertices_anchored(
        this.handle as number,
        from.idx,
        to.idx,
        sourceAnchor.kind,
        sourceAnchor.nx ?? 0,
        sourceAnchor.ny ?? 0,
        targetAnchor.kind,
        targetAnchor.nx ?? 0,
        targetAnchor.ny ?? 0,
      );
      this.#onStateChange?.();
      const actualVersion = this.#decodeEdgeVersion(rawEdgeId);
      return ok({ idx: rawEdgeId, version: actualVersion });
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Set an edge's anchor on a specific end (source or target).
   * @param edgeId The edge's SlotmapId
   * @param end 0 for source, 1 for target
   * @param anchor Anchor specification: { kind: 'auto'|'north'|'south'|'east'|'west'|'normalized', nx?: number, ny?: number }
   */
  setEdgeAnchor(
    edgeId: SlotmapId,
    end: 0 | 1,
    anchor: { kind: string; nx?: number; ny?: number },
  ): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.set_edge_anchor(
        this.handle as number,
        edgeId.idx,
        end,
        anchor.kind,
        anchor.nx ?? 0,
        anchor.ny ?? 0,
      );
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Clear an edge's anchor on a specific end (source or target), resetting it to Auto.
   * @param edgeId The edge's SlotmapId
   * @param end 0 for source, 1 for target
   */
  clearEdgeAnchor(edgeId: SlotmapId, end: 0 | 1): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.clear_edge_anchor(this.handle as number, edgeId.idx, end);
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Get the anchor information for an edge.
   * @param edgeId The edge's SlotmapId
   * @returns The anchor information, or an error
   */
  getEdgeAnchors(edgeId: SlotmapId): Result<EdgeAnchorsDto, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const raw = this.wasm.get_edge_anchors(this.handle as number, edgeId.idx);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        return err('EdgeAnchorsParse: ' + (e instanceof Error ? e.message : String(e)));
      }
      return ok(parsed as EdgeAnchorsDto);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Set whether math typesetting is enabled on a page.
   * @param pageIdx The page's slotmap index (page_id.idx)
   * @param enabled true to enable math rendering, false to disable
   * @returns Ok on success, or an error
   */
  setPageMathEnabled(pageIdx: number, enabled: boolean): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.set_page_math_enabled(this.handle as number, pageIdx, enabled);
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  // ─── Selection (Slice 3) ─────────────────────────────────────────────────────

  /**
   * Resolve a click point + modifiers into an engine-owned SelectionTarget.
   *
   * Uses the engine's scene hit-testing and SelectionService to apply
   * the correct selection semantics (SEL-015, SEL-016).
   *
   * @param x Document-space X coordinate
   * @param y Document-space Y coordinate
   * @param modifiers Keyboard modifiers (alt, shift, ctrl, meta)
   * @returns The resolved SelectionTarget, or an error
   */
  resolveSelection(
    x: number,
    y: number,
    modifiers: { alt: boolean; shift: boolean; ctrl: boolean; meta: boolean },
  ): Result<import('./types.js').SelectionTarget, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const raw = this.wasm.resolve_selection(
        this.handle as number,
        x,
        y,
        modifiers.alt,
        modifiers.shift,
        modifiers.ctrl,
        modifiers.meta,
      );
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        return err('SelectionTargetParse: ' + (e instanceof Error ? e.message : String(e)));
      }
      return ok(parsed as import('./types.js').SelectionTarget);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Select a target using the engine's selection model.
   *
   * @param target A SelectionTarget to select
   */
  selectTarget(target: import('./types.js').SelectionTarget): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.select_target(this.handle as number, JSON.stringify(target));
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Clear all selections in the engine.
   */
  clearSelection(): Result<void, EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      this.wasm.clear_selection(this.handle as number);
      this.#onStateChange?.();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Get the current engine selection as a JSON array of SelectionTarget.
   *
   * @returns Array of currently selected targets, or an error
   */
  getSelection(): Result<import('./types.js').SelectionTarget[], EngineError> {
    const g = this.guard();
    if (!g.ok) return g;
    try {
      const raw = this.wasm.get_selection(this.handle as number);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        return err('SelectionParse: ' + (e instanceof Error ? e.message : String(e)));
      }
      if (!Array.isArray(parsed)) {
        return err('SelectionParse: expected array, got ' + typeof parsed);
      }
      return ok(parsed as import('./types.js').SelectionTarget[]);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }
}

export interface EdgeAnchorsDto {
  source_anchor_kind: string;
  source_nx: number;
  source_ny: number;
  target_anchor_kind: string;
  target_nx: number;
  target_ny: number;
}
