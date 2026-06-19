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

// WasmModule mirrors the 11 wasm-pack exports from diagram-wasm.
export type WasmModule = {
  create_engine(): number;
  dispose_engine(_h: number): void;
  execute_command(_h: number, _json: string): void;
  get_scene(_h: number): string;
  render_svg(_h: number, _pageIdJson: string): string;
  render_pages(_h: number): string;
  import_drawio(_h: number, _xml: string): void;
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
