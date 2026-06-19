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
  get_scene(_h: number): string;
  render_svg(_h: number, _pageIdx: bigint): string;
  render_pages(_h: number): string;
  import_drawio(_h: number, _xml: string): void;
  export_drawio(_h: number): string;
  undo(_h: number): void;
  redo(_h: number): void;
  engine_can_undo(_h: number): boolean;
  engine_can_redo(_h: number): boolean;
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
