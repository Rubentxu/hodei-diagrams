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
} from './types.js';
import { ok, err, slotmapIdToField, EMPTY_METADATA } from './types.js';
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
      this.wasm.set_stencil_library(this.handle as number, library, xml);
    } catch (e) {
      console.error(`[session] Failed to load stencil library "${library}": ${e instanceof Error ? e.message : String(e)}`);
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
      return ok({ idx: rawEdgeId, version: 0 });
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
}

export interface EdgeAnchorsDto {
  source_anchor_kind: string;
  source_nx: number;
  source_ny: number;
  target_anchor_kind: string;
  target_nx: number;
  target_ny: number;
}
