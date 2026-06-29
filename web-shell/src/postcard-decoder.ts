//! postcard wire-format decoder for the hodei-diagrams scene buffer.
//!
//! Supports the subset of the postcard/serde data model needed to deserialize
//! a `diagram_scene::Scene` serialized via `postcard::to_allocvec`.
//!
//! Not all CBOR features are implemented — only what's needed for scene data:
//! - VARINT (0x00-0x17 for 0-23, 0x18+N, 0x19+2, 0x1a+4, 0x1b+8 for varints)
//! - Floats (major type 7, subtype 27 = f64)
//! - Strings / byte strings
//! - Arrays and maps
//! - Booleans (0xF5/0xF4)
//! - Null (0xF6)
//! - Simple values

// ─── CBOR Major Types ─────────────────────────────────────────────────────────

const CBOR_UINT8: number = 0x18;
const CBOR_UINT16: number = 0x19;
const CBOR_UINT32: number = 0x1a;
const CBOR_UINT64: number = 0x1b;
const CBOR_NEGINT: number = 0x20;
const CBOR_ARRAY8: number = 0x98;
const CBOR_ARRAY16: number = 0x99;
const CBOR_MAP8: number = 0xb8;
const CBOR_MAP16: number = 0xb9;
const CBOR_TEXT8: number = 0x78;
const CBOR_TEXT16: number = 0x79;
const CBOR_BYTES8: number = 0x58;
const CBOR_BYTES16: number = 0x59;
const CBOR_FLOAT16: number = 0xf9;
const CBOR_FLOAT32: number = 0xfa;
const CBOR_FLOAT64: number = 0xfb;
const VAL_FALSE: number = 0xf4;
const VAL_TRUE: number = 0xf5;
const VAL_NULL: number = 0xf6;

// ─── Decoder Core ─────────────────────────────────────────────────────────────

export class PostcardDecodeError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'PostcardDecodeError';
  }
}

/** Throws if condition is false */
function chk(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new PostcardDecodeError(msg);
}

/** Read a Uint8Array from the underlying buffer at offset, or throw */
function cloneBytes(buf: Uint8Array, start: number, len: number): Uint8Array {
  chk(start >= 0 && start + len <= buf.byteLength, `cloneBytes OOB: ${start}+${len} vs ${buf.byteLength}`);
  return buf.slice(start, start + len);
}

export class PostcardDecoder {
  private readonly view: DataView;
  private readonly buf: Uint8Array;
  private pos: number = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.buf = bytes;
  }

  private peek(): number {
    chk(this.pos < this.buf.byteLength, 'peek past end');
    return this.buf[this.pos]!;
  }

  private advance(n: number): void {
    chk(this.pos + n <= this.buf.byteLength, `advance OOB: ${this.pos}+${n} vs ${this.buf.byteLength}`);
    this.pos += n;
  }

  private readUint8(): number {
    chk(this.pos < this.buf.byteLength, 'readUint8 past end');
    return this.buf[this.pos++]!;
  }

  // ─── Unsigned integers ─────────────────────────────────────────────────────

  read_u32(): number {
    const b = this.readUint8();
    if (b <= 0x17) return b;
    if (b === CBOR_UINT8) return this.view.getUint8(this.pos++);
    if (b === CBOR_UINT16) {
      const v = this.view.getUint16(this.pos); this.advance(2); return v;
    }
    if (b === CBOR_UINT32) {
      const v = this.view.getUint32(this.pos, false); this.advance(4); return v;
    }
    chk(false, `not a u32: 0x${b.toString(16)}`);
    return 0;
  }

  read_u64(): bigint {
    const b = this.readUint8();
    if (b <= 0x17) return BigInt(b);
    if (b === CBOR_UINT8) return BigInt(this.view.getUint8(this.pos++));
    if (b === CBOR_UINT16) {
      const v = this.view.getUint16(this.pos); this.advance(2); return BigInt(v);
    }
    if (b === CBOR_UINT32) {
      const v = this.view.getUint32(this.pos, false); this.advance(4); return BigInt(v);
    }
    if (b === CBOR_UINT64) {
      // JS bigint from two uint32s
      const lo = this.view.getUint32(this.pos, false);
      const hi = this.view.getUint32(this.pos + 4, false);
      this.advance(8);
      return (BigInt(hi) << 32n) | BigInt(lo);
    }
    chk(false, `not a u64: 0x${b.toString(16)}`);
    return 0n;
  }

  // ─── Signed integers ────────────────────────────────────────────────────────

  read_i32(): number {
    const b = this.peek();
    // unsigned
    if (b <= 0x17) { this.advance(1); return b; }
    if (b === CBOR_UINT8) { this.advance(1); return this.view.getUint8(this.pos++); }
    if (b === CBOR_UINT16) { const v = this.view.getUint16(this.pos); this.advance(3); return v; }
    if (b === CBOR_UINT32) { const v = this.view.getUint32(this.pos, false); this.advance(5); return v; }
    // negative
    if (b >= CBOR_NEGINT && b <= 0x37) {
      this.advance(1); return -1 - (b - CBOR_NEGINT);
    }
    if (b === 0x38) {
      this.advance(1); const v = this.view.getUint8(this.pos); this.advance(2); return -1 - v;
    }
    if (b === 0x39) {
      const v = this.view.getUint16(this.pos); this.advance(3); return -1 - v;
    }
    if (b === 0x3a) {
      const v = this.view.getUint32(this.pos, false); this.advance(5); return -1 - v;
    }
    chk(false, `not an i32: 0x${b.toString(16)}`);
    return 0;
  }

  // ─── Floats ────────────────────────────────────────────────────────────────

  read_f64(): number {
    const b = this.readUint8();
    if (b === CBOR_FLOAT16) {
      // half-precision float — decode manually
      const bits = this.view.getUint16(this.pos); this.advance(2);
      const sign = (bits >> 15) & 1;
      const exp = (bits >> 10) & 0x1f;
      const frac = bits & 0x3ff;
      if (exp === 0) return sign ? -0 : 0;
      if (exp === 31) return NaN;
      return (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + frac / 1024);
    }
    if (b === CBOR_FLOAT32) {
      const v = this.view.getFloat32(this.pos, false); this.advance(4); return v;
    }
    if (b === CBOR_FLOAT64) {
      const v = this.view.getFloat64(this.pos, false); this.advance(8); return v;
    }
    // Integer values encoded as floats (postcard does this sometimes)
    if (b <= 0x17) return b;
    if (b === CBOR_UINT8) { const v = this.view.getUint8(this.pos); this.advance(2); return v; }
    if (b === CBOR_UINT16) { const v = this.view.getUint16(this.pos); this.advance(3); return v; }
    if (b === CBOR_UINT32) { const v = this.view.getUint32(this.pos, false); this.advance(5); return v; }
    chk(false, `not an f64: 0x${b.toString(16)}`);
    return 0;
  }

  // ─── Bool / Null ──────────────────────────────────────────────────────────

  read_bool(): boolean {
    const b = this.readUint8();
    if (b === VAL_TRUE) return true;
    if (b === VAL_FALSE) return false;
    chk(false, `not a bool: 0x${b.toString(16)}`);
    return false;
  }

  read_null(): void {
    const b = this.readUint8();
    chk(b === VAL_NULL, `not null: 0x${b.toString(16)}`);
  }

  // ─── Strings / Byte strings ────────────────────────────────────────────────

  read_string(): string {
    const b = this.readUint8();
    let len: number;
    if (b <= 0x17) {
      len = b;
    } else if (b === CBOR_TEXT8) {
      len = this.view.getUint8(this.pos++);
    } else if (b === CBOR_TEXT16) {
      len = this.view.getUint16(this.pos); this.advance(2);
    } else {
      chk(false, `not a text: 0x${b.toString(16)}`);
      return '';
    }
    chk(this.pos + len <= this.buf.byteLength, `string OOB: ${len} at ${this.pos}`);
    const s = new TextDecoder('utf-8', { fatal: true }).decode(
      cloneBytes(this.buf, this.pos, len),
    );
    this.advance(len);
    return s;
  }

  read_bytes(): Uint8Array {
    const b = this.readUint8();
    let len: number;
    if (b <= 0x17) {
      len = b;
    } else if (b === CBOR_BYTES8) {
      len = this.view.getUint8(this.pos++);
    } else if (b === CBOR_BYTES16) {
      len = this.view.getUint16(this.pos); this.advance(2);
    } else {
      chk(false, `not bytes: 0x${b.toString(16)}`);
      return new Uint8Array(0);
    }
    chk(this.pos + len <= this.buf.byteLength, `bytes OOB: ${len} at ${this.pos}`);
    const result = cloneBytes(this.buf, this.pos, len);
    this.advance(len);
    return result;
  }

  // ─── Collections ───────────────────────────────────────────────────────────

  read_array_len(): number {
    const b = this.readUint8();
    if (b <= 0x17) return b;
    if (b === CBOR_ARRAY8) return this.view.getUint8(this.pos++);
    if (b === CBOR_ARRAY16) { const v = this.view.getUint16(this.pos); this.advance(2); return v; }
    chk(false, `not an array: 0x${b.toString(16)}`);
    return 0;
  }

  read_map_len(): number {
    const b = this.readUint8();
    if (b <= 0x17) return b;
    if (b === CBOR_MAP8) return this.view.getUint8(this.pos++);
    if (b === CBOR_MAP16) { const v = this.view.getUint16(this.pos); this.advance(2); return v; }
    chk(false, `not a map: 0x${b.toString(16)}`);
    return 0;
  }

  read_array<T>(readItem: () => T): T[] {
    const len = this.read_array_len();
    const result: T[] = new Array(len);
    for (let i = 0; i < len; i++) result[i] = readItem();
    return result;
  }

  read_map<K extends string | number, V>(readKey: () => K, readVal: () => V): Map<K, V> {
    const len = this.read_map_len();
    const result = new Map<K, V>();
    for (let i = 0; i < len; i++) result.set(readKey(), readVal());
    return result;
  }

  // ─── Optional ──────────────────────────────────────────────────────────────

  read_option<T>(readSome: () => T): T | null {
    const b = this.peek();
    if (b === VAL_FALSE) { this.advance(1); return null; }
    if (b === VAL_TRUE) { this.advance(1); return readSome(); }
    chk(false, `not an option: 0x${b.toString(16)}`);
    return null;
  }

  // ─── Struct helpers (field-order arrays) ────────────────────────────────────

  /** Read the next N values as a tuple/struct fields */
  read_struct<T>(fields: Array<() => T>): T[] {
    const len = this.read_array_len();
    chk(len === fields.length, `struct: expected ${fields.length} fields, got ${len}`);
    return fields.map((f) => f());
  }

  // ─── Public entry point ────────────────────────────────────────────────────

  /** Decode a complete Scene from the buffer bytes. */
  decodeScene(): Scene {
    // The outer serialization is Scene { pages: Vec<PageScene> }
    return this.decodeScene_();
  }

  private decodeScene_(): Scene {
    return {
      pages: this.read_array(() => this.decodePageScene()),
    };
  }

  private decodePageScene(): PageScene {
    // PageScene fields in order (postcard serde struct encoding):
    // page_id, name, width, height, display_list, background, math_enabled
    const len = this.read_array_len();
    chk(len === 7, `PageScene: expected 7 fields, got ${len}`);
    const page_id = this.decodePageId();
    const name = this.read_string();
    const width = this.read_f64();
    const height = this.read_f64();
    const display_list = this.read_array(() => this.decodeVisualElement());
    const background = this.read_option(() => this.read_string());
    const math_enabled = this.read_bool();
    return { page_id, name, width, height, display_list, background, math_enabled };
  }

  // ─── VisualElement ──────────────────────────────────────────────────────────

  private decodeVisualElement(): VisualElement {
    // Variants (postcard serde enum index):
    // 0=Rect, 1=RoundedRect, 2=Ellipse, 3=Diamond, 4=Triangle,
    // 5=Hexagon, 6=Cylinder, 7=Cloud, 8=Parallelogram, 9=Trapezoid,
    // 10=Polygon, 11=Text, 12=Line, 13=Path, 14=Group, 15=Stencil, 16=Image
    const variant = this.read_u32();
    switch (variant) {
      case 0: return { kind: 'Rect', ...this.decodeRectElement() };
      case 1: return { kind: 'RoundedRect', ...this.decodeRoundedRectElement() };
      case 2: return { kind: 'Ellipse', ...this.decodeEllipseElement() };
      case 3: return { kind: 'Diamond', ...this.decodeDiamondElement() };
      case 4: return { kind: 'Triangle', ...this.decodeTriangleElement() };
      case 5: return { kind: 'Hexagon', ...this.decodeHexagonElement() };
      case 6: return { kind: 'Cylinder', ...this.decodeCylinderElement() };
      case 7: return { kind: 'Cloud', ...this.decodeCloudElement() };
      case 8: return { kind: 'Parallelogram', ...this.decodeParallelogramElement() };
      case 9: return { kind: 'Trapezoid', ...this.decodeTrapezoidElement() };
      case 10: return { kind: 'Polygon', ...this.decodePolygonElement() };
      case 11: return { kind: 'Text', ...this.decodeTextElement() };
      case 12: return { kind: 'Line', ...this.decodeLineElement() };
      case 13: return { kind: 'Path', ...this.decodePathElement() };
      case 14: return { kind: 'Group', ...this.decodeGroupElement() };
      case 15: return { kind: 'Stencil', ...this.decodeStencilElement() };
      case 16: return { kind: 'Image', ...this.decodeImageElement() };
      default: throw new PostcardDecodeError(`unknown VisualElement variant: ${variant}`);
    }
  }

  // ─── Element decode helpers ─────────────────────────────────────────────────

  private decodeVertexId(): VertexId {
    const idx = this.read_u32();
    const version = this.read_u32();
    return { idx, version };
  }

  private decodeEdgeId(): EdgeId {
    const idx = this.read_u32();
    const version = this.read_u32();
    return { idx, version };
  }

  private decodeGroupId(): GroupId {
    const idx = this.read_u32();
    const version = this.read_u32();
    return { idx, version };
  }

  private decodePageId(): PageId {
    const idx = this.read_u32();
    const version = this.read_u32();
    return { idx, version };
  }

  private decodeRect(): Rect {
    return {
      origin: this.decodePoint(),
      size: this.decodeSize(),
    };
  }

  private decodePoint(): Point {
    const x = this.read_f64();
    const y = this.read_f64();
    return { x, y };
  }

  private decodeSize(): Size {
    const width = this.read_f64();
    const height = this.read_f64();
    return { width, height };
  }

  private decodeResolvedStyle(): ResolvedStyle {
    return {
      fill_color: this.read_option(() => this.read_string()),
      stroke_color: this.read_option(() => this.read_string()),
      stroke_width: this.read_option(() => this.read_f64()),
      rounded: this.read_option(() => this.read_bool()),
      dashed: this.read_option(() => this.read_bool()),
      font_color: this.read_option(() => this.read_string()),
      font_size: this.read_option(() => this.read_f64()),
      font_family: this.read_option(() => this.read_string()),
      opacity: this.read_option(() => this.read_f64()),
      shadow: this.read_option(() => this.decodeShadowConfig()),
      glass: this.read_option(() => this.decodeGlassConfig()),
      gradient: this.read_option(() => this.decodeGradientConfig()),
      end_arrow: this.read_option(() => this.read_string()),
      start_arrow: this.read_option(() => this.read_string()),
      curved: this.read_option(() => this.read_bool()),
      image_src: this.read_option(() => this.read_string()),
      remaining: this.decodeStyleMap(),
    };
  }

  private decodeShadowConfig(): ShadowConfig {
    return {
      enabled: this.read_bool(),
      dx: this.read_f64(),
      dy: this.read_f64(),
      blur: this.read_f64(),
      color: this.read_string(),
    };
  }

  private decodeGlassConfig(): GlassConfig {
    return {
      enabled: this.read_bool(),
      opacity: this.read_f64(),
    };
  }

  private decodeGradientConfig(): GradientConfig {
    return {
      kind: this.decodeGradientKind(),
      angle: this.read_f64(),
      fx: this.read_f64(),
      fy: this.read_f64(),
      stops: this.read_array(() => this.decodeGradientStop()),
    };
  }

  private decodeGradientKind(): 'Linear' | 'Radial' {
    const t = this.read_string();
    chk(t === 'Linear' || t === 'Radial', `unknown GradientKind: ${t}`);
    return t;
  }

  private decodeGradientStop(): GradientStop {
    return {
      offset: this.read_f64(),
      color: this.read_string(),
    };
  }

  private decodeStyleMap(): Record<string, string> {
    const map = new Map<string, string>();
    const len = this.read_map_len();
    for (let i = 0; i < len; i++) {
      const k = this.read_string();
      const v = this.read_string();
      map.set(k, v);
    }
    return Object.fromEntries(map);
  }

  // ─── Element types ───────────────────────────────────────────────────────────

  private decodeBaseElement(): BaseElement {
    const id = this.decodeVertexId();
    const bounds = this.decodeRect();
    const rotation = this.read_f64();
    const flip_h = this.read_bool();
    const flip_v = this.read_bool();
    const style = this.decodeResolvedStyle();
    return { id, bounds, rotation, flip_h, flip_v, style };
  }

  private decodeRectElement(): RectElement {
    return { ...this.decodeBaseElement() };
  }

  private decodeRoundedRectElement(): RoundedRectElement {
    const base = this.decodeBaseElement();
    const radius = this.read_f64();
    return { ...base, radius };
  }

  private decodeEllipseElement(): EllipseElement {
    return { ...this.decodeBaseElement() };
  }

  private decodeDiamondElement(): DiamondElement {
    return { ...this.decodeBaseElement() };
  }

  private decodeTriangleElement(): TriangleElement {
    return { ...this.decodeBaseElement() };
  }

  private decodeHexagonElement(): HexagonElement {
    return { ...this.decodeBaseElement() };
  }

  private decodeCylinderElement(): CylinderElement {
    return { ...this.decodeBaseElement() };
  }

  private decodeCloudElement(): CloudElement {
    return { ...this.decodeBaseElement() };
  }

  private decodeParallelogramElement(): ParallelogramElement {
    return { ...this.decodeBaseElement() };
  }

  private decodeTrapezoidElement(): TrapezoidElement {
    return { ...this.decodeBaseElement() };
  }

  private decodePolygonElement(): PolygonElement {
    const id = this.decodeVertexId();
    const points = this.read_array(() => this.decodePoint());
    const bounds = this.decodeRect();
    const rotation = this.read_f64();
    const flip_h = this.read_bool();
    const flip_v = this.read_bool();
    const style = this.decodeResolvedStyle();
    return { id, points, bounds, rotation, flip_h, flip_v, style };
  }

  private decodeTextElement(): TextElement {
    const owner = this.decodeEntityId();
    const anchor = this.decodePoint();
    const text = this.read_string();
    const style = this.decodeResolvedStyle();
    const is_math = this.read_bool();
    return { owner, anchor, text, style, is_math };
  }

  private decodeLineElement(): LineElement {
    const id = this.decodeEdgeId();
    const from = this.decodePoint();
    const to = this.decodePoint();
    const style = this.decodeResolvedStyle();
    return { id, from, to, style };
  }

  private decodePathElement(): PathElement {
    const id = this.decodeEdgeId();
    const points = this.read_array(() => this.decodePoint());
    const style = this.decodeResolvedStyle();
    return { id, points, style };
  }

  private decodeGroupElement(): GroupElement {
    const id = this.decodeGroupId();
    const bounds = this.decodeRect();
    const style = this.decodeResolvedStyle();
    const children = this.read_array(() => this.decodeVisualElement());
    const clip = this.read_bool();
    const header = this.read_option(() => this.decodeSwimlaneHeader());
    return { id, bounds, style, children, clip, header };
  }

  private decodeSwimlaneHeader(): SwimlaneHeader {
    const bounds = this.decodeRect();
    const horizontal = this.read_bool();
    return { bounds, horizontal };
  }

  private decodeStencilElement(): StencilElement {
    const id = this.decodeVertexId();
    const library = this.read_string();
    const name = this.read_string();
    const bounds = this.decodeRect();
    const aspect = this.decodeStencilAspect();
    const background = this.read_array(() => this.decodePathCommand());
    const foreground = this.read_array(() => this.decodePathCommand());
    const rotation = this.read_f64();
    const flip_h = this.read_bool();
    const flip_v = this.read_bool();
    const style = this.decodeResolvedStyle();
    return { id, library, name, bounds, aspect, background, foreground, rotation, flip_h, flip_v, style };
  }

  private decodeStencilAspect(): 'Fixed' | 'Variable' {
    const t = this.read_string();
    chk(t === 'Fixed' || t === 'Variable', `unknown StencilAspect: ${t}`);
    return t;
  }

  private decodeImageElement(): ImageElement {
    const id = this.decodeVertexId();
    const bounds = this.decodeRect();
    const image_src = this.read_option(() => this.read_string());
    const aspect = this.decodeImageAspect();
    const rotation = this.read_f64();
    const flip_h = this.read_bool();
    const flip_v = this.read_bool();
    const style = this.decodeResolvedStyle();
    return { id, bounds, image_src, aspect, rotation, flip_h, flip_v, style };
  }

  private decodeImageAspect(): 'Contain' | 'Cover' | 'Stretch' {
    const t = this.read_string();
    chk(t === 'Contain' || t === 'Cover' || t === 'Stretch', `unknown ImageAspect: ${t}`);
    return t;
  }

  private decodeEntityId(): EntityId {
    const variant = this.read_u32();
    switch (variant) {
      case 0: return { kind: 'Vertex', id: this.decodeVertexId() };
      case 1: return { kind: 'Edge', id: this.decodeEdgeId() };
      case 2: return { kind: 'Group', id: this.decodeGroupId() };
      default: throw new PostcardDecodeError(`unknown EntityId variant: ${variant}`);
    }
  }

  private decodePathCommand(): PathCommand {
    const variant = this.read_u32();
    switch (variant) {
      case 0: {
        const x = this.read_f64(); const y = this.read_f64();
        return { kind: 'Move', x, y };
      }
      case 1: {
        const x = this.read_f64(); const y = this.read_f64();
        return { kind: 'Line', x, y };
      }
      case 2: {
        const cx = this.read_f64(); const cy = this.read_f64();
        const x = this.read_f64(); const y = this.read_f64();
        return { kind: 'Quad', cx, cy, x, y };
      }
      case 3: {
        const c1x = this.read_f64(); const c1y = this.read_f64();
        const c2x = this.read_f64(); const c2y = this.read_f64();
        const x = this.read_f64(); const y = this.read_f64();
        return { kind: 'Curve', c1x, c1y, c2x, c2y, x, y };
      }
      case 4: {
        const rx = this.read_f64(); const ry = this.read_f64();
        const x_axis_rotation = this.read_f64();
        const large_arc = this.read_bool();
        const sweep = this.read_bool();
        const x = this.read_f64(); const y = this.read_f64();
        return { kind: 'Arc', rx, ry, x_axis_rotation, large_arc, sweep, x, y };
      }
      case 5: return { kind: 'Close' };
      case 6: return { kind: 'FillStroke' };
      default: throw new PostcardDecodeError(`unknown PathCommand variant: ${variant}`);
    }
  }
}

// ─── TypeScript type mirrors of the Rust structs ───────────────────────────────

export interface SlotmapId {
  readonly idx: number;
  readonly version: number;
}

export type VertexId = SlotmapId;
export type EdgeId = SlotmapId;
export type GroupId = SlotmapId;
export type PageId = SlotmapId;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  origin: Point;
  size: Size;
}

export interface BaseElement {
  id: VertexId;
  bounds: Rect;
  rotation: number;
  flip_h: boolean;
  flip_v: boolean;
  style: ResolvedStyle;
}

export interface RectElement extends BaseElement {}
export interface EllipseElement extends BaseElement {}
export interface DiamondElement extends BaseElement {}
export interface TriangleElement extends BaseElement {}
export interface HexagonElement extends BaseElement {}
export interface CylinderElement extends BaseElement {}
export interface CloudElement extends BaseElement {}
export interface ParallelogramElement extends BaseElement {}
export interface TrapezoidElement extends BaseElement {}

export interface RoundedRectElement extends BaseElement {
  radius: number;
}

export interface PolygonElement {
  id: VertexId;
  points: Point[];
  bounds: Rect;
  rotation: number;
  flip_h: boolean;
  flip_v: boolean;
  style: ResolvedStyle;
}

export interface EntityId {
  kind: 'Vertex' | 'Edge' | 'Group';
  id: VertexId | EdgeId | GroupId;
}

export interface TextElement {
  owner: EntityId;
  anchor: Point;
  text: string;
  style: ResolvedStyle;
  is_math: boolean;
}

export interface LineElement {
  id: EdgeId;
  from: Point;
  to: Point;
  style: ResolvedStyle;
}

export interface PathElement {
  id: EdgeId;
  points: Point[];
  style: ResolvedStyle;
}

export interface SwimlaneHeader {
  bounds: Rect;
  horizontal: boolean;
}

export interface GroupElement {
  id: GroupId;
  bounds: Rect;
  style: ResolvedStyle;
  children: VisualElement[];
  clip: boolean;
  header: SwimlaneHeader | null;
}

export type StencilAspect = 'Fixed' | 'Variable';

export type ImageAspect = 'Contain' | 'Cover' | 'Stretch';

export interface StencilElement {
  id: VertexId;
  library: string;
  name: string;
  bounds: Rect;
  aspect: StencilAspect;
  background: PathCommand[];
  foreground: PathCommand[];
  rotation: number;
  flip_h: boolean;
  flip_v: boolean;
  style: ResolvedStyle;
}

export interface ImageElement {
  id: VertexId;
  bounds: Rect;
  image_src: string | null;
  aspect: ImageAspect;
  rotation: number;
  flip_h: boolean;
  flip_v: boolean;
  style: ResolvedStyle;
}

export type PathCommand =
  | { kind: 'Move'; x: number; y: number }
  | { kind: 'Line'; x: number; y: number }
  | { kind: 'Quad'; cx: number; cy: number; x: number; y: number }
  | { kind: 'Curve'; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
  | { kind: 'Arc'; rx: number; ry: number; x_axis_rotation: number; large_arc: boolean; sweep: boolean; x: number; y: number }
  | { kind: 'Close' }
  | { kind: 'FillStroke' };

export type VisualElement =
  | { kind: 'Rect'; } & RectElement
  | { kind: 'RoundedRect'; } & RoundedRectElement
  | { kind: 'Ellipse'; } & EllipseElement
  | { kind: 'Diamond'; } & DiamondElement
  | { kind: 'Triangle'; } & TriangleElement
  | { kind: 'Hexagon'; } & HexagonElement
  | { kind: 'Cylinder'; } & CylinderElement
  | { kind: 'Cloud'; } & CloudElement
  | { kind: 'Parallelogram'; } & ParallelogramElement
  | { kind: 'Trapezoid'; } & TrapezoidElement
  | { kind: 'Polygon'; } & PolygonElement
  | { kind: 'Text'; } & TextElement
  | { kind: 'Line'; } & LineElement
  | { kind: 'Path'; } & PathElement
  | { kind: 'Group'; } & GroupElement
  | { kind: 'Stencil'; } & StencilElement
  | { kind: 'Image'; } & ImageElement;

export interface ShadowConfig {
  enabled: boolean;
  dx: number;
  dy: number;
  blur: number;
  color: string;
}

export interface GlassConfig {
  enabled: boolean;
  opacity: number;
}

export type GradientKind = 'Linear' | 'Radial';

export interface GradientStop {
  offset: number;
  color: string;
}

export interface GradientConfig {
  kind: GradientKind;
  angle: number;
  fx: number;
  fy: number;
  stops: GradientStop[];
}

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
  end_arrow: string | null;
  start_arrow: string | null;
  curved: boolean | null;
  image_src: string | null;
  remaining: Record<string, string>;
}

export interface PageScene {
  page_id: PageId;
  name: string;
  width: number;
  height: number;
  display_list: VisualElement[];
  background: string | null;
  math_enabled: boolean;
}

export interface Scene {
  pages: PageScene[];
}

// ─── High-level convenience API ─────────────────────────────────────────────────

/**
 * Decode a scene from a `Uint8Array` view of the WASM scene buffer.
 *
 * This is the zero-copy path: the caller holds a `Uint8Array` view into WASM
 * linear memory (via `session.readSceneBuffer()`). This function deserializes
 * it without any intermediate JSON string.
 *
 * Falls back to `null` if the bytes are empty or decoding fails.
 */
export function decodeSceneFromBytes(bytes: Uint8Array): Scene | null {
  if (bytes.byteLength === 0) return null;
  try {
    const dec = new PostcardDecoder(bytes);
    return dec.decodeScene();
  } catch (e) {
    console.warn('[postcard-decoder] decodeScene failed:', e);
    return null;
  }
}
