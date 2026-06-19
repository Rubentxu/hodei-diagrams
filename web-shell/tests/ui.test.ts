import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildEmptyUi,
  populatePageSelect,
  showError,
  hideError,
  wireFileInput,
} from '../src/ui.js';
import type { PageRender, PageToken } from '../src/types.js';

function createRoot(): HTMLDivElement {
  const root = document.createElement('div');
  return root;
}

describe('ui', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('buildEmptyUi creates all required elements with correct types', () => {
    const root = createRoot();
    const ui = buildEmptyUi(root);

    expect(ui.fileInput).toBeInstanceOf(HTMLInputElement);
    expect(ui.pageSelect).toBeInstanceOf(HTMLSelectElement);
    expect(ui.viewer).toBeInstanceOf(HTMLElement);
    expect(ui.errorBanner).toBeInstanceOf(HTMLDivElement);
    expect(ui.errorMessage).toBeInstanceOf(HTMLSpanElement);
    expect(ui.dismissButton).toBeInstanceOf(HTMLButtonElement);
  });

  it('populatePageSelect creates one option per page and marks active', () => {
    const select = document.createElement('select');
    const pages: PageRender[] = [
      { pageId: 1 as PageToken, name: 'Page A', svg: '' },
      { pageId: 2 as PageToken, name: 'Page B', svg: '' },
      { pageId: 3 as PageToken, name: 'Page C', svg: '' },
    ];

    populatePageSelect(select, pages, 1);

    expect(select.options.length).toBe(3);
    expect(select.value).toBe('2');
  });

  it('populatePageSelect disables select for single-page diagram', () => {
    const select = document.createElement('select');
    const pages: PageRender[] = [{ pageId: 1 as PageToken, name: 'Page A', svg: '' }];

    populatePageSelect(select, pages, 0);

    expect(select.disabled).toBe(true);
  });

  it('showError sets textContent and unhides banner', () => {
    const banner = document.createElement('div');
    banner.hidden = true;
    const messageEl = document.createElement('span');

    showError(banner, messageEl, 'Test error message');

    expect(messageEl.textContent).toBe('Test error message');
    expect(banner.hidden).toBe(false);
  });

  it('hideError adds hidden class to banner', () => {
    const banner = document.createElement('div');
    banner.hidden = false;

    hideError(banner);

    expect(banner.hidden).toBe(true);
  });

  it('wireFileInput invokes onFile with FileReader text on file selection', async () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    const onFile = vi.fn();

    // Track whether readAsText was called and with what file
    let capturedFile: File | null = null;
    const originalReadAsText = FileReader.prototype.readAsText;
    FileReader.prototype.readAsText = function (file: File) {
      capturedFile = file;
      // Call original to let jsdom handle the async behavior
      originalReadAsText.call(this, file);
    };

    wireFileInput(fileInput, onFile);

    // Create a proper jsdom File object
    const blob = new Blob(['<?xml?><mxfile></mxfile>'], { type: 'text/plain' });
    const mockFile = new File([blob], 'test.drawio', { type: 'text/plain' });

    // Set up files on the input
    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false,
    });

    // Create and dispatch change event
    const event = new Event('change', { bubbles: true });
    Object.defineProperty(event, 'target', { value: fileInput });
    fileInput.dispatchEvent(event);

    // Restore original
    FileReader.prototype.readAsText = originalReadAsText;

    // readAsText should have been called with the file
    expect(capturedFile).toBe(mockFile);

    // Wait for FileReader async to complete
    await new Promise((r) => setTimeout(r, 10));

    // onFile should have been called
    expect(onFile).toHaveBeenCalled();
    expect(onFile.mock.calls[0]?.[0]).toContain('mxfile');
  });
});
