/**
 * math-renderer.ts — Math rendering via KaTeX with lazy loading.
 *
 * Design:
 * - Lazy-imports katex and its CSS on first use (preserves initial load perf).
 * - Memoizes the dynamic import so multiple elements share one renderer.
 * - Catches KaTeX errors and falls back to raw LaTeX as monospace text.
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
  render(latex: string, displayMode: boolean, target: HTMLElement): void;
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

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
