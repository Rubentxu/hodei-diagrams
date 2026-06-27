/**
 * math-overlay.ts — Overlay KaTeX rendering on top of SVG text elements.
 *
 * Finds all `<text[data-math-id][data-latex]>` elements in the SVG, creates
 * sibling overlay `<div>`s positioned at the text bbox, hides the original text,
 * and renders KaTeX into the overlay.
 *
 * The SVG is the trust boundary (engine-produced), so no user input reaches here.
 */

import type { MathRenderer } from './math-renderer.js';
import { ensureMathRenderer } from './math-renderer.js';

/**
 * Run the math overlay on an SVG root element.
 *
 * @param svgRoot The SVG element (already mounted into DOM)
 * @param mathEnabled Whether math rendering is enabled for this page.
 *                    When false, this is a no-op (preserves lazy-load guarantee).
 */
export function runMathOverlay(svgRoot: SVGElement, mathEnabled: boolean): void {
  if (!mathEnabled) return;

  const renderer: MathRenderer = ensureMathRenderer();

  // Find all text elements that have math data attributes
  const mathTexts = svgRoot.querySelectorAll<SVGTextElement>('text[data-math-id][data-latex]');
  if (mathTexts.length === 0) return;

  for (const textEl of mathTexts) {
    const latex = textEl.getAttribute('data-latex');
    if (!latex) continue;

    // Strip TeX-style delimiters that the .drawio round-trip stores on
    // labels ($...$ for inline, $$...$$ for display) but KaTeX does not
    // recognize by default — KaTeX's built-in delimiters are \(...\)
    // for inline and \[...\] for display. Stripping here keeps the SVG
    // store as-is (so the same `.drawio` round-trips back identically)
    // and just unwraps the delimiters before handing the source to the
    // renderer. Without this, every math label falls back to the raw
    // monospace error path.
    const { source: latexSource, displayMode: detectedDisplay } = stripLatexDelimiters(latex);
    const displayMode = textEl.getAttribute('data-math-display') === 'true' || detectedDisplay;

    // Get the bbox of the text element in document coordinates
    // getBBox is synchronous and works on SVG elements in the DOM
    let bbox: DOMRect;
    try {
      bbox = textEl.getBBox();
    } catch {
      // getBBox can throw on detached elements — skip
      continue;
    }

    // Compute absolute position relative to the SVG root's viewport
    const svgRect = svgRoot.getBoundingClientRect();
    const absX = svgRect.left + bbox.x;
    const absY = svgRect.top + bbox.y;

    // Create overlay div positioned absolutely over the text
    const overlay = document.createElement('div');
    overlay.className = 'math-overlay';
    overlay.style.position = 'absolute';
    overlay.style.left = `${absX}px`;
    overlay.style.top = `${absY}px`;
    overlay.style.width = `${bbox.width}px`;
    overlay.style.height = `${bbox.height}px`;
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '10';
    overlay.style.overflow = 'hidden';

    // Insert overlay as a sibling of the SVG (inside the viewer container)
    svgRoot.parentElement?.appendChild(overlay);

    // Hide the original SVG text so KaTeX overlay shows instead
    textEl.style.visibility = 'hidden';

    // Render KaTeX into the overlay (fire-and-forget)
    renderer.render(latexSource, displayMode, overlay);
  }
}

/**
 * Strip TeX-style delimiters (`$...$` inline, `$$...$$` display) from a
 * math source string. Returns the unwrapped source and a flag indicating
 * whether the original used display delimiters. The SVG label store
 * preserves the delimiters (so .drawio round-trip is unchanged); this
 * helper is the boundary where they get unwrapped before rendering.
 */
function stripLatexDelimiters(latex: string): { source: string; displayMode: boolean } {
  const trimmed = latex.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
    return { source: trimmed.slice(2, -2).trim(), displayMode: true };
  }
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length >= 2) {
    return { source: trimmed.slice(1, -1).trim(), displayMode: false };
  }
  return { source: latex, displayMode: false };
}
