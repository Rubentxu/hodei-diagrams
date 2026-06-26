import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildEmptyUi, populatePageTabs, showError, hideError, wireFileInput } from '../src/ui.js';
import type { PageRender, PageToken, Result } from '../src/types.js';
import type { DiagramEngineSession } from '../src/session.js';

// Minimal mock session for testing buildEmptyUi without engine
const mockSession: DiagramEngineSession = {
  executeCommand: (_cmd: string): Result<void, string> => ({ ok: true, value: undefined }),
  executeTransaction: (_cmds: string[]): Result<void, string> => ({ ok: true, value: undefined }),
  undo: (): Result<void, string> => ({ ok: true, value: undefined }),
  redo: (): Result<void, string> => ({ ok: true, value: undefined }),
  canUndo: (): boolean => false,
  canRedo: (): boolean => false,
  importDrawio: (_xml: string): Result<void, string> => ({ ok: true, value: undefined }),
  exportDrawio: (): Result<string, string> => ({ ok: true, value: '' }),
  renderAllPages: (): Result<PageRender[], string> => ({ ok: true, value: [] }),
  renderPage: (_pageIdx: bigint): Result<string, string> => ({ ok: true, value: '' }),
  getScene: (): Result<import('../src/types.js').ScenePage[], string> => ({ ok: true, value: [] }),
  loadStencilLibrary: (_name: string, _url: string): Promise<void> => Promise.resolve(),
  executeCommands: (_cmds: string[]): Result<void, string> => ({ ok: true, value: undefined }),
  getResolvedStyle: () => ({ ok: true, value: { remaining: {} } }),
  getMetadata: () => ({
    ok: true,
    value: {
      title: null,
      author: null,
      description: null,
      tags: [],
      created: null,
      modified: null,
    },
  }),
  setMetadata: () => ({ ok: true, value: undefined }),
  setOnStateChange: () => {},
  dispose: () => {},
  isActive: true,
} as unknown as DiagramEngineSession;

function createRoot(): HTMLDivElement {
  return document.createElement('div');
}

describe('ui', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('buildEmptyUi creates all required elements with correct types', () => {
    const root = createRoot();
    const ui = buildEmptyUi(root, mockSession);

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
    const callbacks = {
      onSelect: vi.fn(),
      onRename: vi.fn(),
      onDelete: vi.fn(),
    };

    populatePageTabs(container, pages, 1, callbacks);

    const tabs = container.querySelectorAll('.page-tab');
    expect(tabs.length).toBe(3);

    // Each tab renders the page name inside a .page-tab-name button; the tab
    // container also holds a close button (×), so textContent at the tab level
    // would include the × — assert against the name element directly.
    const tabNames = container.querySelectorAll('.page-tab-name');
    expect(tabNames.length).toBe(3);
    expect(tabNames[0]?.textContent).toBe('Page A');
    expect(tabNames[1]?.textContent).toBe('Page B');
    expect(tabNames[2]?.textContent).toBe('Page C');
    expect(tabs[1]?.classList.contains('active')).toBe(true);
  });

  it('populatePageTabs click triggers onSelect', () => {
    const container = document.createElement('div');
    const pages: PageRender[] = [
      { pageId: 10 as PageToken, name: 'Page A', svg: '' },
      { pageId: 20 as PageToken, name: 'Page B', svg: '' },
    ];
    const callbacks = {
      onSelect: vi.fn(),
      onRename: vi.fn(),
      onDelete: vi.fn(),
    };

    populatePageTabs(container, pages, 0, callbacks);

    // The onSelect listener is bound to the inner .page-tab-name button, not
    // the tab container (clicks on the close button must not select). Click the
    // name button to trigger selection.
    const secondTabName = container.querySelector(
      '[data-testid="page-tab-1"] .page-tab-name',
    ) as HTMLElement;
    expect(secondTabName).not.toBeNull();
    secondTabName.click();
    expect(callbacks.onSelect).toHaveBeenCalledWith(20);
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
