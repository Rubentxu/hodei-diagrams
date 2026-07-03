/**
 * stencil-library-manager.ts — Single source of truth for loaded .xml stencil libraries.
 *
 * Wraps DiagramEngineSession.setStencilLibrary() (engine registration) +
 * wasm.parse_stencil_library_xml() (TS-side shape cache for rendering).
 * The sidebar subscribes and re-renders categories dynamically.
 */

import type { StencilInfo } from './types.js';
import type { DiagramEngineSession } from './session.js';
import type { WasmModule } from './types.js';

export type StencilLoadingCallback = (loading: boolean) => void;

export class StencilLibraryManager {
  private readonly session: DiagramEngineSession;
  private readonly wasm: WasmModule;
  private readonly libraries = new Map<string, StencilInfo[]>();
  private readonly subscribers = new Set<() => void>();
  private onLoadingChange: StencilLoadingCallback | undefined;
  private activeLoads = 0;

  constructor(
    session: DiagramEngineSession,
    wasm: WasmModule,
    onLoadingChange?: StencilLoadingCallback,
  ) {
    this.session = session;
    this.wasm = wasm;
    if (onLoadingChange) this.onLoadingChange = onLoadingChange;
    // NOTE: Do NOT auto-load here. The HUD (which displays loading state)
    // is created AFTER this constructor returns (in buildEmptyUi). Loading
    // callbacks fire synchronously during construction, so the HUD would be null.
    // Call startAutoLoad() after the HUD is ready.
  }

  /** Start auto-loading default stencil libraries. Call after HUD is ready. */
  startAutoLoad(): void {
    this.loadFromUrl('general', '/fixtures/general.xml').catch((e) => {
      console.error('[StencilLibraryManager] Failed to auto-load general.xml:', e);
    });
    this.loadFromUrl('flowchart', '/fixtures/flowchart.xml').catch((e) => {
      console.error('[StencilLibraryManager] Failed to auto-load flowchart.xml:', e);
    });
  }

  /**
   * Fetch a stencil library XML from a URL, parse it, and register it with the engine.
   */
  async loadFromUrl(name: string, url: string): Promise<void> {
    this.activeLoads++;
    this.onLoadingChange?.(true);
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`);
      }
      const xml = await resp.text();
      await this.#parseAndRegister(name, xml);
    } finally {
      this.activeLoads--;
      if (this.activeLoads === 0) {
        this.onLoadingChange?.(false);
      }
    }
  }

  /**
   * Read a stencil library XML from a File object, parse it, and register it with the engine.
   */
  async loadFromFile(name: string, file: File): Promise<void> {
    this.activeLoads++;
    this.onLoadingChange?.(true);
    try {
      const xml = await file.text();
      await this.#parseAndRegister(name, xml);
    } finally {
      this.activeLoads--;
      if (this.activeLoads === 0) {
        this.onLoadingChange?.(false);
      }
    }
  }

  async #parseAndRegister(name: string, xml: string): Promise<void> {
    // Validate XML by parsing it
    const json = this.wasm.parse_stencil_library_xml(xml);
    const shapes: StencilInfo[] = JSON.parse(json);
    // Register with engine
    const registered = this.session.setStencilLibrary(name, xml);
    if (!registered.ok) {
      throw new Error(`Failed to register stencil library "${name}": ${registered.error}`);
    }
    // Update cache (replaces existing library under same name)
    this.libraries.set(name, shapes);
    this.notifyChange();
  }

  /** Returns a snapshot of all loaded libraries. */
  getLibraries(): ReadonlyMap<string, StencilInfo[]> {
    return this.libraries;
  }

  /**
   * Look up a shape by library name and shape name.
   * Returns null if the library or shape is not found.
   */
  getShapeByName(library: string, name: string): StencilInfo | null {
    const shapes = this.libraries.get(library);
    if (!shapes) return null;
    return shapes.find((s) => s.name === name) ?? null;
  }

  /**
   * Subscribe to library changes. Returns an unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notifyChange(): void {
    for (const cb of this.subscribers) {
      cb();
    }
  }
}
