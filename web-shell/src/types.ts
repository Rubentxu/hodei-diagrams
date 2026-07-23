// Branded types to prevent confusion between handles and tokens
export type EngineHandle = number & { readonly __brand: 'EngineHandle' };
export type PageToken = number & { readonly __brand: 'PageToken' };

/** Engine-owned page identifier: (slotmap idx, slotmap version). */
export interface PageSlotId {
  idx: number;
  version: number;
}

export type EngineError = string;

export type Result<T, E = EngineError> = { ok: true; value: T } | { ok: false; error: E };

export interface PageRender {
  pageId: PageToken;
  /** Engine-owned slotmap id for the page (needed to dispatch RemovePage, etc.). */
  slotmapId: PageSlotId;
  name: string;
  svg: string;
  /** Page background color (hex string) or null if default (white). */
  background: string | null;
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
  // ─── Zero-copy scene buffer (Phase 2 / P2-3) ────────────────────────────
  // These write/read a pre-allocated slab in WASM linear memory.
  // JS reads via: new Uint8Array(wasm.memory.buffer, ptr, len)
  write_scene_to_buffer(_h: number): number;
  get_scene_buffer_ptr(_h: number): number;
  get_scene_buffer_len(_h: number): number;
  get_scene_buffer_capacity(_h: number): number;
  // ─── Zero-copy SVG buffer (Phase 2 / P2-3 Phase C) ─────────────────────
  // SVG buffer path: write_svg_to_buffer + ptr/len for zero-copy reads.
  write_svg_to_buffer(_h: number, _pageIdx: bigint): number;
  get_svg_buffer_ptr(_h: number): number;
  get_svg_buffer_len(_h: number): number;
  // ─── Zero-copy command buffer (Phase 2 / P2-3 Phase B) ───────────────
  // Command dispatch path: write postcard-encoded Vec<Command> to buffer
  // and flush to apply as an atomic batch.
  command_buffer_ptr(_h: number): number;
  command_buffer_capacity(_h: number): number;
  flush_commands(_h: number, _written_len: number): void;
  import_drawio(_h: number, _xml: string): void;
  export_drawio(_h: number): string;
  export_drawio_fresh_engine(_h: number): string;
  undo(_h: number): void;
  redo(_h: number): void;
  engine_can_undo(_h: number): boolean;
  engine_can_redo(_h: number): boolean;
  connect_vertices(_h: number, _from: number, _to: number, _routingKind: number, _sourcePort: number, _targetPort: number): number;
  disconnect_edge(_h: number, _edgeId: number): void;
  parse_stencil_xml(_xml: string): string;
  parse_stencil_library_xml(_xml: string): string;
  set_stencil_library(_h: number, _library: string, _xml: string): void;
  get_resolved_style(_h: number, _vertexId: number): string;
  get_metadata(_h: number): string;
  set_metadata(_h: number, _json: string): void;
  // ─── Layer queries (IP-F PR5) ────────────────────────────────────────────────
  get_page_layers(_h: number, _pageIdx: number): string;
  apply_layout(_h: number, _kind_json: string, _config_json: string): void;
  apply_hierarchical_layout(_h: number, _config_json: string): void;
  route_all_edges(_h: number): void;
  insert_bend(_h: number, _edge_idx: number, _seg: number, _x: number, _y: number): void;
  move_bend(_h: number, _edge_idx: number, _bend: number, _x: number, _y: number): void;
  remove_bend(_h: number, _edge_idx: number, _bend: number): void;
  group_vertices(_h: number, _vertex_indices_json: string): void;
  ungroup_vertices(_h: number, _vertex_idx: number): void;
  connect_vertices_anchored(_h: number, _from: number, _to: number, _source_kind: string, _source_nx: number, _source_ny: number, _target_kind: string, _target_nx: number, _target_ny: number): number;
  set_edge_anchor(_h: number, _edge_idx: number, _end: number, _anchor_kind: string, _nx: number, _ny: number): void;
  clear_edge_anchor(_h: number, _edge_idx: number, _end: number): void;
  get_edge_anchors(_h: number, _edge_idx: number): string;
  set_page_math_enabled(_h: number, _page_idx: number, _enabled: boolean): void;
  // ─── Selection (Slice 3) ─────────────────────────────────────────────────────
  resolve_selection(_h: number, _x: number, _y: number, _alt: boolean, _shift: boolean, _ctrl: boolean, _meta: boolean): string;
  select_target(_h: number, _target_json: string): void;
  clear_selection(_h: number): void;
  get_selection(_h: number): string;
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

/** Selection state discriminated union for editor FSM states. */
export type SelectionState =
  | { type: 'IDLE' }
  | { type: 'ONE'; element: SlotmapId }
  | { type: 'MANY'; elements: SlotmapId[] }
  | { type: 'GROUP_DRILL_DOWN'; groupId: SlotmapId; groupElement: Element };

/** Keyboard modifiers for selection resolution. Mirrors `SelectionModifiers` on the Rust side. */
export interface SelectionModifiers {
  alt: boolean;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
}

/**
 * Engine-owned selection target. Mirrors `SelectionTarget` on the Rust side.
 * Serialized as JSON: `{"type":"Vertex","id":{"idx":1,"version":1}}`
 */
export type SelectionTarget =
  | { type: 'None' }
  | { type: 'Vertex'; id: SlotmapId }
  | { type: 'Group'; id: SlotmapId }
  | { type: 'Edge'; id: SlotmapId };

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
  /** Whether math rendering is enabled for this page (from Rust PageScene.math_enabled). */
  math_enabled?: boolean;
}

// ─── Layer Types (IP-F PR5) ─────────────────────────────────────────────────────

/** A layer descriptor returned by get_page_layers WASM call. */
export interface LayerInfo {
  idx: number;
  version: number;
  name: string | null;
  visible: boolean;
  locked: boolean;
}

/** Response from get_page_layers WASM call. */
export interface PageLayers {
  page_idx: number;
  layers: LayerInfo[];
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

/**
 * A path command from a parsed stencil.
 * Mirrors `PathCommandDto` from diagram-wasm (serde tag = "kind").
 */
export type PathCommand =
  | { kind: 'Move'; x: number; y: number }
  | { kind: 'Line'; x: number; y: number }
  | { kind: 'Quad'; cx: number; cy: number; x: number; y: number }
  | { kind: 'Curve'; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
  | {
      kind: 'Arc';
      rx: number;
      ry: number;
      x_axis_rotation: number;
      large_arc: boolean;
      sweep: boolean;
      x: number;
      y: number;
    }
  | { kind: 'Close' }
  | { kind: 'FillStroke' };

/** Parsed stencil metadata returned by parse_stencil_xml / parse_stencil_library_xml. */
export interface StencilInfo {
  library: string;
  name: string;
  width: number;
  height: number;
  aspect: 'fixed' | 'variable';
  background: PathCommand[];
  foreground: PathCommand[];
  license: string | null;
  diagnostics: StencilDiagnostic[];
}

/** A diagnostic warning emitted during stencil parsing. */
export interface StencilDiagnostic {
  code: string;
  message: string;
}

// ─── Effect Types ─────────────────────────────────────────────────────────────

/** Shadow effect configuration. Corresponds to diagram_scene::resolver::ShadowConfig. */
export interface ShadowConfig {
  enabled: boolean;
  dx: number;
  dy: number;
  blur: number;
  color: string;
}

/** Glass effect configuration. Corresponds to diagram_scene::resolver::GlassConfig. */
export interface GlassConfig {
  enabled: boolean;
  opacity: number;
}

/** A single color stop in a gradient. Corresponds to diagram_scene::resolver::GradientStop. */
export interface GradientStop {
  offset: number;
  color: string;
}

/** Gradient kind. Corresponds to diagram_scene::resolver::GradientKind. */
export type GradientKind = 'Linear' | 'Radial';

/** Gradient effect configuration. Corresponds to diagram_scene::resolver::GradientConfig. */
export interface GradientConfig {
  kind: GradientKind;
  angle: number;
  fx: number;
  fy: number;
  stops: GradientStop[];
}

/**
 * Resolved style with typed effect fields.
 * Corresponds to diagram_scene::resolver::ResolvedStyle.
 *
 * Returned by `session.getResolvedStyle()`.
 */
export interface ResolvedStyle {
  fill_color: string | null;
  stroke_color: string | null;
  stroke_width: number | null;
  rounded: boolean | null;
  dashed: boolean | null;
  font_color: string | null;
  font_size: number | null;
  font_family: string | null;
  opacity: number | null;
  shadow: ShadowConfig | null;
  glass: GlassConfig | null;
  gradient: GradientConfig | null;
  /** Unknown keys preserved from the original StyleMap. */
  remaining: Record<string, string>;
}

// ─── Metadata Types ─────────────────────────────────────────────────────────────

/**
 * Diagram metadata persisted to the engine via WASM.
 * Mirrors `MetadataDto` on the Rust side.
 */
export interface MetadataInfo {
  title: string | null;
  author: string | null;
  description: string | null;
  tags: string[];
  /** ISO-8601 / RFC-3339 timestamp string, or null for default epoch. */
  created: string | null;
  /** ISO-8601 / RFC-3339 timestamp string, or null for default epoch. */
  modified: string | null;
}

/** Empty metadata sentinel returned when the engine has no metadata set. */
export const EMPTY_METADATA: MetadataInfo = {
  title: null,
  author: null,
  description: null,
  tags: [],
  created: null,
  modified: null,
};
