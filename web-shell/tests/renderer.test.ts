import { describe, it, expect } from 'vitest';
import { mountSvg, showPage, clear, setupZoomPan } from '../src/renderer.js';
import type { PageRender, PageToken } from '../src/types.js';

function createDiv(): HTMLDivElement {
  const div = document.createElement('div');
  return div;
}

describe('renderer', () => {
  it('mountSvg injects SVG into container', () => {
    const div = createDiv();
    mountSvg(div, '<svg><rect/></svg>');
    expect(div.querySelector('svg')).not.toBeNull();
  });

  it('mountSvg with empty string clears the container', () => {
    const div = createDiv();
    div.innerHTML = '<svg>old</svg>';
    mountSvg(div, '');
    expect(div.innerHTML).toBe('');
  });

  it('showPage mounts the matching page and returns true', () => {
    const div = createDiv();
    const pages: PageRender[] = [
      { pageId: 1 as PageToken, slotmapId: { idx: 1, version: 0 }, name: 'Page 1', svg: '<svg>page1</svg>' },
      { pageId: 2 as PageToken, slotmapId: { idx: 2, version: 0 }, name: 'Page 2', svg: '<svg>page2</svg>' },
    ];

    const result = showPage(pages, 2 as PageToken, div);

    expect(result).toBe(true);
    expect(div.innerHTML).toBe('<svg>page2</svg>');
  });

  it('showPage returns false for unknown token and does not modify container', () => {
    const div = createDiv();
    div.innerHTML = '<svg>original</svg>';
    const pages: PageRender[] = [
      { pageId: 1 as PageToken, slotmapId: { idx: 1, version: 0 }, name: 'Page 1', svg: '<svg>page1</svg>' },
    ];

    const result = showPage(pages, 99 as PageToken, div);

    expect(result).toBe(false);
    expect(div.innerHTML).toBe('<svg>original</svg>');
  });

  it('clear empties the container', () => {
    const div = createDiv();
    div.innerHTML = '<svg>old</svg>';
    clear(div);
    expect(div.innerHTML).toBe('');
  });

  it('panBy mutates viewBox additively while preserving zoom', () => {
    const container = createDiv();
    const viewer = createDiv();
    container.appendChild(viewer);

    // Create an SVG so the viewport has something to apply to
    viewer.innerHTML = '<svg viewBox="0 0 800 600"></svg>';

    const zoomPan = setupZoomPan(container, viewer);

    // panBy(10, 0) then panBy(5, 0) yields panX=15, panY=0 at zoom=1
    // viewport applies to SVG viewBox: "panX panY viewW viewH"
    zoomPan.panBy(10, 0);
    const svg1 = viewer.querySelector('svg');
    expect(svg1).not.toBeNull();
    // At zoom 1, viewW=800, viewH=600, so viewBox should be "10 0 800 600"
    expect(svg1!.getAttribute('viewBox')).toContain('10');

    zoomPan.panBy(5, 0);
    const svg2 = viewer.querySelector('svg');
    expect(svg2).not.toBeNull();
    // Cumulative pan: 15
    expect(svg2!.getAttribute('viewBox')).toContain('15');
  });
});
