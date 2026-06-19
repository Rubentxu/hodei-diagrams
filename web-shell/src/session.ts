import type { EngineHandle, PageToken, Result, PageRender, EngineError } from './types.js';
import { ok, err } from './types.js';
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

  categorizeError(msg: string): {
    kind:
      | 'ImportFailed'
      | 'InvalidCommand'
      | 'InvalidHandle'
      | 'PageNotFound'
      | 'TooManyEngines'
      | 'Unknown';
    raw: string;
  } {
    if (msg.startsWith('ImportFailed')) return { kind: 'ImportFailed', raw: msg };
    if (msg.startsWith('InvalidCommand')) return { kind: 'InvalidCommand', raw: msg };
    if (msg === 'InvalidHandle') return { kind: 'InvalidHandle', raw: msg };
    if (msg.startsWith('InvalidHandle')) return { kind: 'InvalidHandle', raw: msg };
    if (msg.startsWith('PageNotFound')) return { kind: 'PageNotFound', raw: msg };
    if (msg === 'TooManyEngines') return { kind: 'TooManyEngines', raw: msg };
    if (msg.startsWith('TooManyEngines')) return { kind: 'TooManyEngines', raw: msg };
    return { kind: 'Unknown', raw: msg };
  }
}
