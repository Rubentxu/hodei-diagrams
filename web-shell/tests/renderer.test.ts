import { describe, it, expect } from 'vitest';
import { mountSvg, showPage, clear } from '../src/renderer.js';
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
      { pageId: 1 as PageToken, name: 'Page 1', svg: '<svg>page1</svg>' },
      { pageId: 2 as PageToken, name: 'Page 2', svg: '<svg>page2</svg>' },
    ];

    const result = showPage(pages, 2 as PageToken, div);

    expect(result).toBe(true);
    expect(div.innerHTML).toBe('<svg>page2</svg>');
  });

  it('showPage returns false for unknown token and does not modify container', () => {
    const div = createDiv();
    div.innerHTML = '<svg>original</svg>';
    const pages: PageRender[] = [
      { pageId: 1 as PageToken, name: 'Page 1', svg: '<svg>page1</svg>' },
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
});
