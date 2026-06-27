/**
 * math-renderer.ts — Math rendering via KaTeX with lazy loading.
 *
 * Design:
 * - Lazy-imports katex and its CSS on first use (preserves initial load perf).
 * - Memoizes the dynamic import so multiple elements share one renderer.
 * - Catches KaTeX errors and falls back to raw LaTeX as monospace text.
 *
 * Renderer swap path (MathJax 4, etc.):
 *
 * The `MathRenderer` interface is the abstraction boundary — consumers
 * (currently `math-overlay.ts`) only depend on the interface, never on
 * the concrete `KaTeXRenderer`. To swap renderers:
 *
 * 1. Implement `MathRenderer` for the new library (e.g. `MathJaxRenderer`).
 *    - Mirror the fire-and-forget `render()` contract.
 *    - Implement `isReady()` once the library is loaded.
 *    - Handle library-specific parse errors and fall back to raw LaTeX
 *      via the same monospace convention so the snapshot tests in
 *      `math-rendering.spec.ts` stay stable.
 * 2. Update `ensureMathRenderer()` (or add a selection branch) to return
 *    the new implementation. Consumers do not need changes.
 * 3. Update `tests/math-renderer.test.ts` to also cover the new fallback
 *    path if its error semantics differ from KaTeX's.
 *
 * The trigger for actually doing this swap is real-world coverage gaps —
 * when users report LaTeX constructs KaTeX cannot render that are common
 * in their domain. This is intentionally deferred until that trigger
 * fires; the abstraction is already in place to make the swap cheap.
 */

let katexImportPromise: Promise<typeof import('katex')> | null = null;
let katexInstance: typeof import('katex') | null = null;
let cssLoaded = false;

/** Lazy-import katex and its CSS once. */
async function ensureKatex(): Promise<typeof import('katex')> {
  if (katexInstance) return katexInstance;
  if (!katexImportPromise) {
    katexImportPromise = import('katex').then((katex) => {
      katexInstance = katex;
      if (!cssLoaded) {
        cssLoaded = true;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'katex/dist/katex.min.css';
        document.head.appendChild(link);
      }
      return katex;
    });
  }
  return katexImportPromise;
}

/**
 * Math renderer contract.
 * Implementations handle rendering LaTeX strings into an HTML element.
 */
export interface MathRenderer {
  /**
   * Render LaTeX into the given target element.
   * Implementations handle async loading internally (fire-and-forget).
   * @param latex The LaTeX string to render
   * @param displayMode Whether to use display mode (block) or inline
   * @param target The HTML element to render into
   */
  render(_latex: string, _displayMode: boolean, _target: HTMLElement): void;
  /** Returns true once the renderer is ready (i.e., library loaded). */
  isReady(): boolean;
}

/** KaTeX-backed math renderer with lazy loading. */
export class KaTeXRenderer implements MathRenderer {
  private ready = false;

  async #ensureReady(): Promise<void> {
    if (this.ready) return;
    await ensureKatex();
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  /** Fire-and-forget render: kicks off async load, updates target when ready. */
  render(latex: string, displayMode: boolean, target: HTMLElement): void {
    // Capture current state for the async closure
    const currentReady = this.ready;
    void this.#renderImpl(latex, displayMode, target, currentReady);
  }

  async #renderImpl(
    latex: string,
    displayMode: boolean,
    target: HTMLElement,
    _wasReadyBefore: boolean,
  ): Promise<void> {
    try {
      await this.#ensureReady();
    } catch {
      this.#fallback(latex, target);
      return;
    }

    try {
      // katexInstance is guaranteed non-null after ensureKatex() resolves
      katexInstance!.render(latex, target, {
        displayMode,
        throwOnError: true,
        trust: false,
      });
    } catch {
      // KaTeX parse or render error — show raw LaTeX as monospace
      this.#fallback(latex, target);
    }
  }

  /** Fallback: render raw LaTeX as monospace text. */
  #fallback(latex: string, target: HTMLElement): void {
    target.textContent = latex;
    target.style.fontFamily = 'monospace';
    target.style.whiteSpace = 'pre-wrap';
  }
}

// Singleton instance
let singletonRenderer: KaTeXRenderer | null = null;

/**
 * Factory: returns a singleton KaTeXRenderer instance.
 * Safe to call multiple times — returns the same instance.
 */
export function ensureMathRenderer(): MathRenderer {
  if (!singletonRenderer) {
    singletonRenderer = new KaTeXRenderer();
  }
  return singletonRenderer;
}
