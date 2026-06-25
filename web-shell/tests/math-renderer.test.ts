/**
 * math-renderer.test.ts — Unit tests for the KaTeX renderer fallback behavior.
 *
 * Spec scenario covered: MATH-034 — graceful fallback on render error.
 *
 * Strategy:
 * - Use vi.mock to replace the katex module with a stub that throws on render.
 * - Drive ensureMathRenderer().render(badLatex, ...) and assert the target
 *   contains the raw LaTeX as monospace text.
 * - Assert no uncaught exception is propagated to the caller.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock katex so the dynamic import resolves without loading the real bundle
// and render() throws regardless of input — simulating malformed LaTeX.
vi.mock('katex', () => ({
  default: {
    render: (_latex: string, _target: HTMLElement, _opts: unknown) => {
      throw new Error('KaTeX parse error: malformed LaTeX');
    },
  },
  render: (_latex: string, _target: HTMLElement, _opts: unknown) => {
    throw new Error('KaTeX parse error: malformed LaTeX');
  },
}));

// Import AFTER vi.mock so the renderer picks up the mocked katex
import { ensureMathRenderer } from '../src/math/math-renderer.js';

describe('KaTeXRenderer fallback (MATH-034)', () => {
  let target: HTMLElement;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    target.remove();
    vi.restoreAllMocks();
  });

  it('math_034_fallback_renders_raw_latex_as_monospace_on_parse_error', async () => {
    const renderer = ensureMathRenderer();
    const badLatex = '\\not_a_real_command{';

    // Fire-and-forget render — must not throw to the caller
    expect(() => renderer.render(badLatex, false, target)).not.toThrow();

    // Wait for the async fallback to populate the target
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Target should display the raw LaTeX as monospace text (fallback)
    expect(target.textContent).toBe(badLatex);
    expect(target.style.fontFamily).toBe('monospace');
  });

  it('math_034_fallback_does_not_propagate_exception', async () => {
    const renderer = ensureMathRenderer();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Multiple bad renders — none should throw or log uncaught errors
    renderer.render('\\bad{a', false, target);
    renderer.render('\\also{bad', false, target);
    renderer.render('\\still_bad{', true, target);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // No "Uncaught" errors should have reached console.error
    const uncaughtCalls = consoleErrorSpy.mock.calls.filter((call) =>
      String(call[0] ?? '').toLowerCase().includes('uncaught'),
    );
    expect(uncaughtCalls).toHaveLength(0);
  });

  it('math_034_fallback_preserves_raw_latex_verbatim', async () => {
    const renderer = ensureMathRenderer();
    const trickyInputs = [
      '\\frac{1}{2}',
      '\\int_0^1 x\\,dx',
      '\\sum_{i=0}^n i^2',
      'a < b > c', // HTML-special chars that would normally be escaped
    ];

    for (const latex of trickyInputs) {
      const localTarget = document.createElement('div');
      document.body.appendChild(localTarget);
      renderer.render(latex, false, localTarget);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(localTarget.textContent).toBe(latex);
      localTarget.remove();
    }
  });
});