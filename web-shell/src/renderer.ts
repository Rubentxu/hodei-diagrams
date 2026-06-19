import type { PageRender, PageToken } from './types.js';

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
