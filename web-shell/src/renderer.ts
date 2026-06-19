import type { PageRender, PageToken, SlotmapId } from './types.js';

/**
 * Mount an SVG string into a container.
 * Only engine-returned SVG strings reach innerHTML (engine is the trust boundary).
 */
export function mountSvg(container: HTMLElement, svg: string): void {
  if (!svg || svg.trim() === '') {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = svg;
}

export function showPage(
  pages: ReadonlyArray<PageRender>,
  token: PageToken,
  container: HTMLElement,
): boolean {
  const page = pages.find((p) => p.pageId === token);
  if (!page) return false;
  mountSvg(container, page.svg);
  return true;
}

export function clear(container: HTMLElement): void {
  container.innerHTML = '';
}

/**
 * Apply or clear the `.selected` CSS class on elements with `data-vertex-id`.
 * Called after re-render to restore selection highlight.
 */
export function applySelectionClass(viewer: HTMLElement, id: SlotmapId | null): void {
  // Remove .selected from all elements
  viewer.querySelectorAll('[data-vertex-id]').forEach((el) => {
    el.classList.remove('selected');
  });
  if (id !== null) {
    const selector = `[data-vertex-id="${id.idx}:${id.version}"]`;
    const el = viewer.querySelector(selector);
    if (el) {
      el.classList.add('selected');
    }
  }
}
