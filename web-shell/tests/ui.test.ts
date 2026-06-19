import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildEmptyUi,
  populatePageTabs,
  showError,
  hideError,
  wireFileInput,
} from '../src/ui.js';
import type { PageRender, PageToken } from '../src/types.js';

function createRoot(): HTMLDivElement {
  return document.createElement('div');
}

describe('ui', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('buildEmptyUi creates all required elements with correct types', () => {
    const root = createRoot();
    const ui = buildEmptyUi(root);

    // Zone 1 — Navbar
    expect(ui.fileInput).toBeInstanceOf(HTMLInputElement);
    expect(ui.undoButton).toBeInstanceOf(HTMLButtonElement);
    expect(ui.redoButton).toBeInstanceOf(HTMLButtonElement);
    expect(ui.saveButton).toBeInstanceOf(HTMLButtonElement);
    expect(ui.zoomDisplay).toBeInstanceOf(HTMLSpanElement);

    // Zone 2 — Sidebar
    expect(ui.rectToolButton).toBeInstanceOf(HTMLButtonElement);
    expect(ui.ellipseToolButton).toBeInstanceOf(HTMLButtonElement);

    // Zone 3 — Canvas
    expect(ui.viewer).toBeInstanceOf(HTMLElement);
    expect(ui.canvasContainer).toBeInstanceOf(HTMLElement);

    // Zone 4 — Inspector
    expect(ui.inspectorContainer).toBeInstanceOf(HTMLElement);

    // Zone 5 — Bottom
    expect(ui.bottomBar).toBeInstanceOf(HTMLElement);
    expect(ui.errorBanner).toBeInstanceOf(HTMLElement);
    expect(ui.errorMessage).toBeInstanceOf(HTMLSpanElement);
    expect(ui.dismissButton).toBeInstanceOf(HTMLButtonElement);
    expect(ui.pageTabContainer).toBeInstanceOf(HTMLElement);

    // 5 zones in the grid
    expect(ui.navbar).toBeTruthy();
    expect(ui.sidebar).toBeTruthy();
    expect(ui.viewer).toBeTruthy();
    expect(ui.inspectorContainer).toBeTruthy();
    expect(ui.bottomBar).toBeTruthy();
  });

  it('populatePageTabs creates one tab per page and marks active', () => {
    const container = document.createElement('div');
    const pages: PageRender[] = [
      { pageId: 1 as PageToken, name: 'Page A', svg: '' },
      { pageId: 2 as PageToken, name: 'Page B', svg: '' },
      { pageId: 3 as PageToken, name: 'Page C', svg: '' },
    ];
    const onChange = vi.fn();

    populatePageTabs(container, pages, 1, onChange);

    const tabs = container.querySelectorAll('.page-tab');
    expect(tabs.length).toBe(3);
    expect(tabs[0]?.textContent).toBe('Page A');
    expect(tabs[1]?.textContent).toBe('Page B');
    expect(tabs[2]?.textContent).toBe('Page C');
    expect(tabs[1]?.classList.contains('active')).toBe(true);
  });

  it('populatePageTabs click triggers onChange', () => {
    const container = document.createElement('div');
    const pages: PageRender[] = [
      { pageId: 10 as PageToken, name: 'Page A', svg: '' },
      { pageId: 20 as PageToken, name: 'Page B', svg: '' },
    ];
    const onChange = vi.fn();

    populatePageTabs(container, pages, 0, onChange);

    const secondTab = container.querySelector('[data-testid="page-tab-1"]') as HTMLElement;
    expect(secondTab).not.toBeNull();
    secondTab.click();
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('showError sets textContent and unhides banner', () => {
    const banner = document.createElement('div');
    banner.hidden = true;
    const messageEl = document.createElement('span');

    showError(banner, messageEl, 'Test error message');

    expect(messageEl.textContent).toBe('Test error message');
    expect(banner.hidden).toBe(false);
  });

  it('hideError adds hidden to banner', () => {
    const banner = document.createElement('div');
    banner.hidden = false;

    hideError(banner);

    expect(banner.hidden).toBe(true);
  });

  it('wireFileInput invokes onFile with FileReader text on file selection', async () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    const onFile = vi.fn();

    let capturedFile: File | null = null;
    const originalReadAsText = FileReader.prototype.readAsText;
    FileReader.prototype.readAsText = function (file: File) {
      capturedFile = file;
      originalReadAsText.call(this, file);
    };

    wireFileInput(fileInput, onFile);

    const blob = new Blob(['<?xml?><mxfile></mxfile>'], { type: 'text/plain' });
    const mockFile = new File([blob], 'test.drawio', { type: 'text/plain' });

    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false,
    });

    const event = new Event('change', { bubbles: true });
    Object.defineProperty(event, 'target', { value: fileInput });
    fileInput.dispatchEvent(event);

    FileReader.prototype.readAsText = originalReadAsText;

    expect(capturedFile).toBe(mockFile);

    await new Promise((r) => setTimeout(r, 10));

    expect(onFile).toHaveBeenCalled();
    expect(onFile.mock.calls[0]?.[0]).toContain('mxfile');
  });
});
