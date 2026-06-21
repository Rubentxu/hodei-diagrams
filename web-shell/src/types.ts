// Branded types to prevent confusion between handles and tokens
export type EngineHandle = number & { readonly __brand: 'EngineHandle' };
export type PageToken = number & { readonly __brand: 'PageToken' };

export type EngineError = string;

export type Result<T, E = EngineError> = { ok: true; value: T } | { ok: false; error: E };

export interface PageRender {
  pageId: PageToken;
  name: string;
  svg: string;
}

// WasmModule mirrors the wasm-pack exports from diagram-wasm.
// Note: render_svg now accepts flat u64 page_idx (bigint) per R2 fix.
export type WasmModule = {
  create_engine(): number;
  dispose_engine(_h: number): void;
  execute_command(_h: number, _json: string): void;
  execute_transaction(_h: number, _json: string): void;
  get_scene(_h: number): string;
  render_svg(_h: number, _pageIdx: bigint): string;
  render_pages(_h: number): string;
  import_drawio(_h: number, _xml: string): void;
  export_drawio(_h: number): string;
  undo(_h: number): void;
  redo(_h: number): void;
  engine_can_undo(_h: number): boolean;
  engine_can_redo(_h: number): boolean;
  connect_vertices(_h: number, _from: number, _to: number, _routingKind: number): number;
  disconnect_edge(_h: number, _edgeId: number): void;
  parse_stencil_xml(_xml: string): string;
};

export const RESULT_TAG = { OK: 'ok', ERR: 'err' } as const;

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ─── Slotmap Helpers ─────────────────────────────────────────────────────────

/** A slotmap key with both idx and version fields. */
export type SlotmapId = {
  readonly idx: number;
  readonly version: number;
};

/** Current selection state: single VertexId or null. */
export type SelectionState = {
  selectedId: SlotmapId | null;
};

/**
 * Parse a `data-vertex-id` attribute value in `"idx:version"` format.
 * Returns `null` if the value is malformed.
 */
export function parseSlotmapAttr(attr: string): SlotmapId | null {
  const parts = attr.split(':');
  if (parts.length !== 2) return null;
  const idx = parseInt(parts[0]!, 10);
  const version = parseInt(parts[1]!, 10);
  if (isNaN(idx) || isNaN(version)) return null;
  if (idx < 0 || version < 0) return null;
  return { idx, version };
}

/** Convert a SlotmapId to a plain object for JSON serialization. */
export function slotmapIdToField(id: SlotmapId): { idx: number; version: number } {
  return { idx: id.idx, version: id.version };
}

// ─── Scene Types ──────────────────────────────────────────────────────────────

/** A page in the scene, mirroring the get_scene() JSON shape. */
export interface ScenePage {
  page_id: SlotmapId;
  name: string;
  width: number;
  height: number;
  display_list: Record<string, unknown>[];
}

// ─── Style Types ──────────────────────────────────────────────────────────────

/** Style changes payload for the ChangeStyle command. */
export interface StyleChanges {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  dashed?: boolean;
  rounded?: boolean;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  [key: string]: unknown;
}

/** Vertex shape data used by copy/paste. */
export interface Vertex {
  geometry: { x: number; y: number; width: number; height: number };
  style?: Record<string, unknown>;
}

// ─── Stencil Types ─────────────────────────────────────────────────────────────

/** Parsed stencil metadata returned by parse_stencil_xml. */
export interface StencilInfo {
  library: string;
  name: string;
  width: number;
  height: number;
  aspect: 'fixed' | 'variable';
  bg_len: number;
  fg_len: number;
  license: string | null;
  diagnostics: StencilDiagnostic[];
}

/** A diagnostic warning emitted during stencil parsing. */
export interface StencilDiagnostic {
  code: string;
  message: string;
}
