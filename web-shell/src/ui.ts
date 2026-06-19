/**
 * ui.ts — Assembles the 5-zone layout from individual component builders.
 *
 * Preserves all existing data-testid attributes for backward compatibility
 * with E2E tests.
 */

import type { PageRender } from './types.js';
import { buildNavbar } from './navbar.js';
import { buildSidebar } from './sidebar.js';
import { buildRail, type RailCallbacks } from './rail.js';

export interface UiElements {
  // Zone 0: Rail
  railContainer: HTMLElement;

  // Zone 1: Navbar
  fileInput: HTMLInputElement;
  undoButton: HTMLButtonElement;
  redoButton: HTMLButtonElement;
  saveButton: HTMLButtonElement;
  zoomDisplay: HTMLSpanElement;

  // Zone 2: Sidebar
  rectToolButton: HTMLButtonElement;
  ellipseToolButton: HTMLButtonElement;
  sidebarCollapseBtn: HTMLButtonElement;

  // Zone 3: Canvas
  viewer: HTMLElement;
  canvasContainer: HTMLElement;

  // Zone 4: Inspector
  inspectorContainer: HTMLElement;

  // Zone 5: Bottom
  bottomBar: HTMLElement;
  errorBanner: HTMLElement;
  errorMessage: HTMLElement;
  dismissButton: HTMLButtonElement;
  pageTabContainer: HTMLElement;

  // Core containers
  app: HTMLElement;
  navbar: HTMLElement;
  sidebar: HTMLElement;
}

/**
 * Build the empty 5-zone UI layout (with rail).
 * Returns references to all zones and critical elements for wiring.
 */
export function buildEmptyUi(
  root: HTMLElement,
  inspectorContainer?: HTMLElement,
  railCallbacks?: RailCallbacks,
): UiElements {
  root.innerHTML = '';
  root.setAttribute('data-testid', 'app-grid');

  // ─── Zone 0: Rail ────────────────────────────────────────────────────────
  const rail = railCallbacks
    ? buildRail(railCallbacks)
    : buildRail({
        onSelectTool: () => {},
        onShapesTool: () => {},
        onConnectorTool: () => {},
      });

  // ─── Zone 1: Navbar ──────────────────────────────────────────────────────
  const navbar = buildNavbar();

  // ─── Zone 2: Sidebar ─────────────────────────────────────────────────────
  const sidebar = buildSidebar();

  // ─── Zone 3: Canvas ──────────────────────────────────────────────────────
  const canvasContainer = document.createElement('div');
  canvasContainer.className = 'canvas-container';
  canvasContainer.setAttribute('data-testid', 'canvas-container');

  const viewer = document.createElement('div');
  viewer.className = 'viewer';
  viewer.setAttribute('data-testid', 'viewer');
  canvasContainer.appendChild(viewer);

  // ─── Zone 4: Inspector ───────────────────────────────────────────────────
  const inspContainer = inspectorContainer ?? document.createElement('div');
  if (!inspectorContainer) {
    inspContainer.className = 'inspector';
    inspContainer.setAttribute('data-testid', 'inspector');
  }

  // ─── Zone 5: Bottom bar ──────────────────────────────────────────────────
  const bottomBar = document.createElement('div');
  bottomBar.className = 'bottom-bar';
  bottomBar.setAttribute('data-testid', 'bottom-bar');

  const pageTabContainer = document.createElement('div');
  pageTabContainer.className = 'page-tabs';
  pageTabContainer.setAttribute('data-testid', 'page-tabs');
  bottomBar.appendChild(pageTabContainer);

  // Page add button (deferred)
  const addPageBtn = document.createElement('button');
  addPageBtn.className = 'page-tab-add';
  addPageBtn.textContent = '+';
  addPageBtn.title = 'Add page (v1.1)';
  addPageBtn.disabled = true;
  bottomBar.appendChild(addPageBtn);

  const bottomSpacer = document.createElement('div');
  bottomSpacer.className = 'bottom-spacer';
  bottomBar.appendChild(bottomSpacer);

  // Diagnostics / error area
  const errorBanner = document.createElement('div');
  errorBanner.className = 'diagnostics-area';
  errorBanner.setAttribute('data-testid', 'error-banner');
  errorBanner.hidden = true;

  const errorMessage = document.createElement('span');
  errorMessage.className = 'error-message';

  const dismissButton = document.createElement('button');
  dismissButton.className = 'dismiss-btn';
  dismissButton.textContent = '✕';
  dismissButton.setAttribute('data-testid', 'dismiss-error');

  errorBanner.appendChild(errorMessage);
  errorBanner.appendChild(dismissButton);
  bottomBar.appendChild(errorBanner);

  // ─── Assemble into grid ──────────────────────────────────────────────────
  root.appendChild(rail.container);
  root.appendChild(navbar.container);
  root.appendChild(sidebar.container);
  root.appendChild(canvasContainer);
  root.appendChild(inspContainer);
  root.appendChild(bottomBar);

  // ─── Sidebar collapse toggle ────────────────────────────────────────────
  sidebar.collapseBtn.addEventListener('click', () => {
    const isCollapsed = sidebar.container.classList.toggle('collapsed');
    root.classList.toggle('sidebar-collapsed', isCollapsed);
    sidebar.collapseBtn.textContent = isCollapsed ? '▶' : '◀';
    sidebar.collapseBtn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
    try {
      localStorage.setItem('hodei:sidebar-collapsed', String(isCollapsed));
    } catch {
      // localStorage may be unavailable
    }
  });

  // Restore collapsed state
  try {
    if (localStorage.getItem('hodei:sidebar-collapsed') === 'true') {
      sidebar.container.classList.add('collapsed');
      root.classList.add('sidebar-collapsed');
      sidebar.collapseBtn.textContent = '▶';
      sidebar.collapseBtn.title = 'Expand sidebar';
    }
  } catch {
    // localStorage may be unavailable
  }

  return {
    // Zone 0
    railContainer: rail.container,

    // Zone 1
    fileInput: navbar.fileInput,
    undoButton: navbar.undoBtn,
    redoButton: navbar.redoBtn,
    saveButton: navbar.saveBtn,
    zoomDisplay: navbar.zoomDisplay,

    // Zone 2
    rectToolButton: sidebar.rectToolBtn,
    ellipseToolButton: sidebar.ellipseToolBtn,
    sidebarCollapseBtn: sidebar.collapseBtn,

    // Zone 3
    viewer,
    canvasContainer,

    // Zone 4
    inspectorContainer: inspContainer,

    // Zone 5
    bottomBar,
    errorBanner,
    errorMessage,
    dismissButton,
    pageTabContainer,

    // Core
    app: root,
    navbar: navbar.container,
    sidebar: sidebar.container,
  };
}

// ─── Page Tab Management ──────────────────────────────────────────────────────

/** Update page tabs in the bottom bar. */
export function populatePageTabs(
  container: HTMLElement,
  pages: ReadonlyArray<PageRender>,
  activeIndex: number,
  onChange: (_pageId: number) => void,
): void {
  container.innerHTML = '';
  for (const [i, page] of pages.entries()) {
    const tab = document.createElement('button');
    tab.className = 'page-tab';
    tab.textContent = page.name;
    tab.setAttribute('data-testid', `page-tab-${i}`);
    if (i === activeIndex) {
      tab.classList.add('active');
    }
    tab.addEventListener('click', () => {
      onChange(page.pageId);
    });
    container.appendChild(tab);
  }
}

// ─── Error Display ────────────────────────────────────────────────────────────

export function showError(banner: HTMLElement, messageEl: HTMLElement, message: string): void {
  messageEl.textContent = message;
  banner.hidden = false;
}

export function hideError(banner: HTMLElement): void {
  banner.hidden = true;
}

// ─── File Input Wiring ────────────────────────────────────────────────────────

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
      // FileReader error — file couldn't be read
    });
    reader.readAsText(file);
    // Reset so same file can be re-selected
    fileInput.value = '';
  });
}

export function wireDismiss(button: HTMLButtonElement, onDismiss: () => void): void {
  button.addEventListener('click', () => {
    onDismiss();
  });
}
