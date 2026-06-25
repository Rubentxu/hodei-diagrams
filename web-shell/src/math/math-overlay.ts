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

    // Determine displayMode from the data attribute (default to inline)
    const displayMode = textEl.getAttribute('data-math-display') === 'true';

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
    renderer.render(latex, displayMode, overlay);
  }
}
