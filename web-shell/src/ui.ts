import type { PageRender } from './types.js';

export interface UiElements {
  fileInput: HTMLInputElement;
  pageSelect: HTMLSelectElement;
  viewer: HTMLElement;
  errorBanner: HTMLElement;
  errorMessage: HTMLElement;
  dismissButton: HTMLButtonElement;
  undoButton?: HTMLButtonElement;
  redoButton?: HTMLButtonElement;
  saveButton?: HTMLButtonElement;
  rectToolButton?: HTMLButtonElement;
  ellipseToolButton?: HTMLButtonElement;
}

export function buildEmptyUi(root: HTMLElement): UiElements {
  // Toolbar row
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  // File input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.drawio,.xml';
  fileInput.setAttribute('data-testid', 'file-input');

  // Page select
  const pageSelect = document.createElement('select');
  pageSelect.className = 'page-select';
  pageSelect.setAttribute('data-testid', 'page-select');

  toolbar.appendChild(fileInput);
  toolbar.appendChild(pageSelect);

  // Spacer
  const spacer = document.createElement('span');
  spacer.className = 'toolbar-spacer';
  toolbar.appendChild(spacer);

  // Undo / Redo buttons
  const undoButton = document.createElement('button');
  undoButton.textContent = 'Undo';
  undoButton.disabled = true;
  undoButton.setAttribute('data-testid', 'undo-btn');
  toolbar.appendChild(undoButton);

  const redoButton = document.createElement('button');
  redoButton.textContent = 'Redo';
  redoButton.disabled = true;
  redoButton.setAttribute('data-testid', 'redo-btn');
  toolbar.appendChild(redoButton);

  // Separator
  const sep = document.createElement('span');
  sep.className = 'toolbar-sep';
  sep.textContent = '|';
  toolbar.appendChild(sep);

  // Palette: Rectangle tool
  const rectToolButton = document.createElement('button');
  rectToolButton.textContent = 'Rect';
  rectToolButton.setAttribute('data-testid', 'rect-tool-btn');
  toolbar.appendChild(rectToolButton);

  // Palette: Ellipse tool
  const ellipseToolButton = document.createElement('button');
  ellipseToolButton.textContent = 'Ellipse';
  ellipseToolButton.setAttribute('data-testid', 'ellipse-tool-btn');
  toolbar.appendChild(ellipseToolButton);

  // Separator
  const saveSep = document.createElement('span');
  saveSep.className = 'toolbar-sep';
  saveSep.textContent = '|';
  toolbar.appendChild(saveSep);

  // Save / Export button
  const saveButton = document.createElement('button');
  saveButton.textContent = 'Save .drawio';
  saveButton.disabled = true;
  saveButton.setAttribute('data-testid', 'save-btn');
  toolbar.appendChild(saveButton);

  // Error banner
  const errorBanner = document.createElement('div');
  errorBanner.className = 'error-banner';
  errorBanner.setAttribute('data-testid', 'error-banner');
  errorBanner.hidden = true;

  const errorMessage = document.createElement('span');
  errorMessage.className = 'error-message';

  const dismissButton = document.createElement('button');
  dismissButton.textContent = 'Dismiss';
  dismissButton.setAttribute('data-testid', 'dismiss-error');

  errorBanner.appendChild(errorMessage);
  errorBanner.appendChild(dismissButton);

  // Viewer container
  const viewer = document.createElement('div');
  viewer.className = 'viewer';
  viewer.setAttribute('data-testid', 'viewer');

  root.appendChild(toolbar);
  root.appendChild(errorBanner);
  root.appendChild(viewer);

  return {
    fileInput,
    pageSelect,
    viewer,
    errorBanner,
    errorMessage,
    dismissButton,
    undoButton,
    redoButton,
    saveButton,
    rectToolButton,
    ellipseToolButton,
  };
}

export function populatePageSelect(
  select: HTMLSelectElement,
  pages: ReadonlyArray<PageRender>,
  activeIndex: number,
): void {
  select.innerHTML = '';
  for (const [i, page] of pages.entries()) {
    const opt = document.createElement('option');
    opt.textContent = page.name;
    opt.value = String(page.pageId);
    if (i === activeIndex) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }
  select.disabled = pages.length === 1;
}

export function showError(banner: HTMLElement, messageEl: HTMLElement, message: string): void {
  messageEl.textContent = message;
  banner.hidden = false;
}

export function hideError(banner: HTMLElement): void {
  banner.hidden = true;
}

export function wireFileInput(fileInput: HTMLInputElement, onFile: (_xml: string) => void): void {
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const text = reader.result as string;
      onFile(text);
    });
    reader.addEventListener('error', () => {
      // FileReader error - file couldn't be read
    });
    reader.readAsText(file);
    // Reset so same file can be re-selected
    fileInput.value = '';
  });
}

export function wirePageSelect(
  select: HTMLSelectElement,
  onChange: (_pageId: number) => void,
): void {
  select.addEventListener('change', () => {
    const val = parseInt(select.value, 10);
    if (!isNaN(val)) {
      onChange(val);
    }
  });
}

export function wireDismiss(button: HTMLButtonElement, onDismiss: () => void): void {
  button.addEventListener('click', () => {
    onDismiss();
  });
}
