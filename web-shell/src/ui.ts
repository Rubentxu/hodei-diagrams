/**
 * ui.ts — Assembles the 5-zone layout from individual component builders.
 *
 * Preserves all existing data-testid attributes for backward compatibility
 * with E2E tests.
 */

import type { PageRender } from './types.js';
import type { DiagramEngineSession } from './session.js';
import { buildNavbar, type ToolbarControls, type NavbarControls } from './navbar.js';
import { buildSidebar } from './sidebar.js';
import { buildRail, type RailCallbacks } from './rail.js';
import type { StencilLibraryManager } from './stencil-library-manager.js';
import type { DockMode } from './workbench-controller.js';
import { buildHud, type HudControls } from './hud.js';
import { ICONS } from './icon.js';
import { showContextMenu, type ContextMenuItem } from './context-menu.js';

export type DiagnosticState = 'idle' | 'clean' | 'error';

export interface UiElements {
  // Zone 0: Rail
  railContainer: HTMLElement;

  // Zone 1: Navbar
  fileInput: HTMLInputElement;
  undoButton: HTMLButtonElement;
  redoButton: HTMLButtonElement;
  saveButton: HTMLButtonElement;
  zoomDisplay: HTMLSpanElement;
  inspectorToggleBtn: HTMLButtonElement;
  sidebarToggleBtn: HTMLButtonElement;
  setDiagnosticsStatus: NavbarControls['setDiagnosticsStatus'];

  // Zone 2: Sidebar
  rectToolButton: HTMLButtonElement;
  roundedRectToolButton: HTMLButtonElement;
  ellipseToolButton: HTMLButtonElement;
  diamondToolButton: HTMLButtonElement;
  triangleToolButton: HTMLButtonElement;
  hexagonToolButton: HTMLButtonElement;
  cylinderToolButton: HTMLButtonElement;
  cloudToolButton: HTMLButtonElement;
  parallelogramToolButton: HTMLButtonElement;
  trapezoidToolButton: HTMLButtonElement;
  polygonToolButton: HTMLButtonElement;
  rectangleStencilButton: HTMLButtonElement;
  ellipseStencilButton: HTMLButtonElement;
  diamondStencilButton: HTMLButtonElement;
  triangleStencilButton: HTMLButtonElement;
  hexagonStencilButton: HTMLButtonElement;
  cylinderStencilButton: HTMLButtonElement;
  cloudStencilButton: HTMLButtonElement;
  parallelogramStencilButton: HTMLButtonElement;
  trapezoidStencilButton: HTMLButtonElement;
  blockArrowStencilButton: HTMLButtonElement;
  sidebarCollapseBtn: HTMLButtonElement;

  // Zone 3: Canvas
  viewer: HTMLElement;
  canvasContainer: HTMLElement;

  // Zone 3.5: HUD
  hud: HudControls;

  // Zone 4: Inspector
  inspectorContainer: HTMLElement;

  // Zone 5: Bottom
  bottomBar: HTMLElement;
  errorBanner: HTMLElement;
  errorMessage: HTMLElement;
  dismissButton: HTMLButtonElement;
  pageTabContainer: HTMLElement;
  pageTabAdd: HTMLButtonElement;

  // Diagnostics
  diagnosticsBadge: HTMLElement;
  setDiagnostics(_state: DiagnosticState, _msg?: string): void;

  // Core containers
  app: HTMLElement;
  navbar: HTMLElement;
  toolbar: ToolbarControls;
  sidebar: HTMLElement;
  dockHistory: HTMLElement;
  setDockMode: (_mode: DockMode) => void;

  // R3: Drawer overlay
  drawerOverlay: HTMLElement;
}

/**
 * Build the empty 5-zone UI layout (with rail).
 * Returns references to all zones and critical elements for wiring.
 */
export function buildEmptyUi(
  root: HTMLElement,
  session: DiagramEngineSession,
  inspectorContainer?: HTMLElement,
  railCallbacks?: RailCallbacks,
  stencilManager?: StencilLibraryManager,
): UiElements {
  root.innerHTML = '';
  root.setAttribute('data-testid', 'app-grid');

  // ─── Zone 0: Rail ────────────────────────────────────────────────────────
  const _rail = railCallbacks
    ? buildRail(railCallbacks)
    : buildRail({
        onSelectTool: () => {},
        onShapesTool: () => {},
        onConnectorTool: () => {},
        onTextTool: () => {},
        onZoomFit: () => {},
        onHelp: () => {},
      });

  // ─── Zone 1: Navbar ──────────────────────────────────────────────────────
  const navbar = buildNavbar(session);

  // ─── Zone 2: Sidebar ─────────────────────────────────────────────────────
  const sidebar = buildSidebar(stencilManager);

  // ─── Zone 3: Canvas ──────────────────────────────────────────────────────
  const canvasContainer = document.createElement('div');
  canvasContainer.className = 'canvas-container';
  canvasContainer.setAttribute('data-testid', 'canvas-container');

  const viewer = document.createElement('div');
  viewer.className = 'viewer';
  viewer.setAttribute('data-testid', 'viewer');
  canvasContainer.appendChild(viewer);

  // ─── Zone 3.5: HUD ───────────────────────────────────────────────────────
  const hud = buildHud();

  // ─── Zone 4: Inspector ───────────────────────────────────────────────────
  const inspContainer = inspectorContainer ?? document.createElement('div');
  if (!inspectorContainer) {
    inspContainer.className = 'inspector';
    inspContainer.setAttribute('data-testid', 'inspector');
  }

  // ─── Zone 5: Bottom-left cluster (floating, R2d) ─────────────────────────
  // Replaces full-width grid bottom row with a fixed-position cluster
  const bottomBar = document.createElement('div');
  bottomBar.className = 'bottom-bar bottom-left-cluster';
  bottomBar.setAttribute('data-testid', 'bottom-bar');

  const pageTabContainer = document.createElement('div');
  pageTabContainer.className = 'page-tabs';
  pageTabContainer.setAttribute('data-testid', 'page-tabs');
  bottomBar.appendChild(pageTabContainer);

  // Page add button
  const addPageBtn = document.createElement('button');
  addPageBtn.className = 'page-tab-add';
  addPageBtn.setAttribute('data-testid', 'page-tab-add');
  addPageBtn.textContent = '+';
  addPageBtn.title = 'Add page';
  bottomBar.appendChild(addPageBtn);

  // Diagnostics / error area
  const errorBanner = document.createElement('div');
  errorBanner.className = 'diagnostics-area';
  errorBanner.setAttribute('data-testid', 'error-banner');
  errorBanner.hidden = true;

  const errorMessage = document.createElement('span');
  errorMessage.className = 'error-message';
  errorMessage.setAttribute('data-testid', 'error-message');

  const dismissButton = document.createElement('button');
  dismissButton.className = 'dismiss-btn';
  dismissButton.textContent = '✕';
  dismissButton.setAttribute('data-testid', 'dismiss-error');

  // Diagnostics badge (idle by default, shown on clean/error)
  const diagnosticsBadge = document.createElement('div');
  diagnosticsBadge.className = 'diagnostics-badge';
  diagnosticsBadge.setAttribute('data-testid', 'diagnostics-badge');
  diagnosticsBadge.hidden = true;

  errorBanner.appendChild(errorMessage);
  errorBanner.appendChild(dismissButton);
  errorBanner.appendChild(diagnosticsBadge);
  bottomBar.appendChild(errorBanner);

  // ─── Assemble into grid ──────────────────────────────────────────────────
  root.appendChild(_rail.container);
  root.appendChild(navbar.container);
  root.appendChild(sidebar.container);
  root.appendChild(canvasContainer);
  root.appendChild(hud.container);
  root.appendChild(inspContainer);
  // bottomBar is a floating cluster, appended to body via document.body.appendChild below

  // ─── Floating bottom-left cluster (R2d) ───────────────────────────────────
  // Append to root so it floats above the grid layout (position:fixed is viewport-relative)
  root.appendChild(bottomBar);

  // ─── R3: Drawer overlay (backdrop for mobile drawers) ───────────────────
  const drawerOverlay = document.createElement('div');
  drawerOverlay.className = 'drawer-overlay';
  drawerOverlay.setAttribute('data-testid', 'drawer-overlay');
  drawerOverlay.setAttribute('aria-hidden', 'true');
  root.appendChild(drawerOverlay);

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

  // Diagnostics state management
  function setDiagnostics(state: DiagnosticState, msg?: string): void {
    diagnosticsBadge.hidden = true;
    errorBanner.hidden = true;

    if (state === 'idle') {
      return;
    }

    if (state === 'clean') {
      errorBanner.hidden = false;
      diagnosticsBadge.hidden = false;
      diagnosticsBadge.dataset['state'] = 'clean';
      diagnosticsBadge.innerHTML = `${ICONS.CLEAN.replace('width="16" height="16"', 'width="14" height="14"').replace('stroke="currentColor"', 'stroke="var(--accent)"')} <span>Clean</span>`;
      diagnosticsBadge.setAttribute('aria-label', 'No issues');
      return;
    }

    if (state === 'error') {
      errorBanner.hidden = false;
      errorMessage.textContent = msg ?? 'Import failed';
      return;
    }
  }

  return {
    // Zone 0
    railContainer: _rail.container,

    // Zone 1
    fileInput: navbar.fileInput,
    undoButton: navbar.undoBtn,
    redoButton: navbar.redoBtn,
    saveButton: navbar.saveBtn,
    zoomDisplay: navbar.zoomDisplay,
    inspectorToggleBtn: navbar.inspectorToggleBtn,
    sidebarToggleBtn: navbar.sidebarToggleBtn,
    setDiagnosticsStatus: navbar.setDiagnosticsStatus,

    // Zone 2
    rectToolButton: sidebar.rectToolBtn,
    roundedRectToolButton: sidebar.roundedRectToolBtn,
    ellipseToolButton: sidebar.ellipseToolBtn,
    diamondToolButton: sidebar.diamondToolBtn,
    triangleToolButton: sidebar.triangleToolBtn,
    hexagonToolButton: sidebar.hexagonToolBtn,
    cylinderToolButton: sidebar.cylinderToolBtn,
    cloudToolButton: sidebar.cloudToolBtn,
    parallelogramToolButton: sidebar.parallelogramToolBtn,
    trapezoidToolButton: sidebar.trapezoidToolBtn,
    polygonToolButton: sidebar.polygonToolBtn,
    rectangleStencilButton: sidebar.rectangleStencilBtn,
    ellipseStencilButton: sidebar.ellipseStencilBtn,
    diamondStencilButton: sidebar.diamondStencilBtn,
    triangleStencilButton: sidebar.triangleStencilBtn,
    hexagonStencilButton: sidebar.hexagonStencilBtn,
    cylinderStencilButton: sidebar.cylinderStencilBtn,
    cloudStencilButton: sidebar.cloudStencilBtn,
    parallelogramStencilButton: sidebar.parallelogramStencilBtn,
    trapezoidStencilButton: sidebar.trapezoidStencilBtn,
    blockArrowStencilButton: sidebar.blockArrowStencilBtn,
    sidebarCollapseBtn: sidebar.collapseBtn,

    // Zone 3
    viewer,
    canvasContainer,

    // Zone 3.5
    hud,

    // Zone 4
    inspectorContainer: inspContainer,

    // Zone 5
    bottomBar,
    errorBanner,
    errorMessage,
    dismissButton,
    pageTabContainer,
    pageTabAdd: addPageBtn,

    // Diagnostics
    diagnosticsBadge,
    setDiagnostics,

    // Core
    app: root,
    navbar: navbar.container,
    toolbar: navbar.toolbar,
    sidebar: sidebar.container,
    dockHistory: sidebar.dockHistory,
    setDockMode: sidebar.setDockMode,

    // R3: Drawer overlay (shared backdrop for mobile drawers)
    drawerOverlay,
  };
}

// ─── Page Tab Management ──────────────────────────────────────────────────────

export interface PageTabCallbacks {
  onSelect: (_pageId: number) => void;
  onRename: (_pageId: number, _newName: string) => void;
  onDelete: (_pageId: number) => void;
  // IP-D: page tab right-click menu (rename/duplicate/reorder)
  onDuplicate: (_pageId: number) => void;
  onMove: (_pageId: number, _direction: 'left' | 'right') => void;
  onSetColor: (_pageId: number, _color: string) => void;
}

/** Update page tabs in the bottom bar. */
export function populatePageTabs(
  container: HTMLElement,
  pages: ReadonlyArray<PageRender>,
  activeIndex: number,
  callbacks: PageTabCallbacks,
): void {
  container.innerHTML = '';
  for (const [i, page] of pages.entries()) {
    const tab = document.createElement('div');
    tab.className = 'page-tab' + (i === activeIndex ? ' active' : '');
    tab.setAttribute('data-testid', `page-tab-${i}`);

    // Color swatch (left of page name)
    const swatch = document.createElement('span');
    swatch.className = 'page-tab-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    // Use page background color if set; CSS fallback handles null (accent)
    if (page.background) {
      swatch.style.background = page.background;
    }
    tab.appendChild(swatch);

    // Tab name (clickable, double-click to rename)
    const tabName = document.createElement('button');
    tabName.className = 'page-tab-name';
    tabName.textContent = page.name;
    tabName.addEventListener('click', () => {
      callbacks.onSelect(page.pageId);
    });
    tabName.addEventListener('dblclick', () => {
      startRename(page.pageId, page.name, tabName, (newName) => {
        callbacks.onRename(page.pageId, newName);
      });
    });
    tab.appendChild(tabName);

    // Close button (not shown if only one page)
    if (pages.length > 1) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'page-tab-close';
      closeBtn.textContent = '×';
      closeBtn.setAttribute('aria-label', `Close ${page.name}`);
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onDelete(page.pageId);
      });
      tab.appendChild(closeBtn);
    }

    // IP-D: Right-click on page tab opens context menu.
    // Stash the page index on the element so the global handler can look
    // up the page from the pages array at click time.
    tab.setAttribute('data-page-index', String(i));
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      tabRightClickHandler(e as MouseEvent, i, page.pageId, pages.length, tab, callbacks);
    });

    container.appendChild(tab);
  }
}

/** Start inline rename of a page tab. */
function startRename(
  pageId: number,
  currentName: string,
  tabName: HTMLButtonElement,
  onCommit: (_newName: string) => void,
): void {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'page-tab-rename-input';
  input.value = currentName;

  // Replace tab name button with input
  const parent = tabName.parentElement!;
  tabName.style.display = 'none';
  parent.insertBefore(input, tabName);
  input.focus();
  input.select();

  const commit = () => {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      onCommit(newName);
    }
    input.remove();
    tabName.style.display = '';
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      input.remove();
      tabName.style.display = '';
    }
  });

  input.addEventListener('blur', commit);
}

/**
 * IP-D: Right-click handler on a page tab. Shows context menu with
 * Rename / Duplicate / Delete / Move Left / Move Right.
 *
 * @param e The contextmenu MouseEvent (already preventDefault'd)
 * @param pageIndex Index of the tab in the pages array
 * @param totalPages Total pages count (used to determine Move disabled state)
 * @param tab The tab element (used as the anchor for the context menu)
 * @param callbacks PageTabCallbacks
 */
function tabRightClickHandler(
  e: MouseEvent,
  pageIndex: number,
  pageId: number,
  totalPages: number,
  tab: HTMLElement,
  callbacks: PageTabCallbacks,
): void {
  void pageIndex; // kept for potential future use (e.g., debug)

  // Open the inline rename input: we need the tab's name element to swap it.
  // The simplest approach: trigger a synthetic dblclick on the name to
  // start the rename flow. But we don't have a direct reference here. So
  // we expose a quick "Rename" action that reuses the existing startRename
  // by re-fetching the tab's name button.
  const items: ContextMenuItem[] = [];

  // Rename — find the tab name button and trigger its dblclick handler
  items.push({
    label: 'Rename',
    action: () => {
      const nameBtn = tab.querySelector<HTMLButtonElement>('.page-tab-name');
      if (nameBtn) nameBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    },
  });

  items.push({
    label: 'Duplicate',
    action: () => callbacks.onDuplicate(pageId),
  });

  items.push({ separator: true, label: '', action: () => {} });

  items.push({
    label: 'Move Left',
    action: () => callbacks.onMove(pageId, 'left'),
    disabled: pageIndex === 0,
  });

  items.push({
    label: 'Move Right',
    action: () => callbacks.onMove(pageId, 'right'),
    disabled: pageIndex === totalPages - 1,
  });

  items.push({ separator: true, label: '', action: () => {} });

  // Set Page Color — opens a native color picker
  items.push({
    label: 'Set Page Color',
    action: () => {
      const input = document.createElement('input');
      input.type = 'color';
      input.value = '#ffffff';
      input.style.position = 'absolute';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.focus();
      input.click();
      input.addEventListener('input', () => {
        callbacks.onSetColor(pageId, input.value);
        document.body.removeChild(input);
      });
      input.addEventListener('change', () => {
        callbacks.onSetColor(pageId, input.value);
        document.body.removeChild(input);
      });
    },
  });

  items.push({
    label: 'Delete',
    action: () => callbacks.onDelete(pageId),
    disabled: totalPages <= 1,
  });

  showContextMenu(e.clientX, e.clientY, items);
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

// ─── Properties Dialog ───────────────────────────────────────────────────────

import type { MetadataInfo } from './types.js';

/** Build a properties dialog overlay and mount it to document.body.
 *
 * @param current - Current metadata from the engine (or EMPTY_METADATA)
 * @param onSave - Callback invoked with the updated MetadataInfo on save
 */
export function buildPropertiesDialog(
  current: MetadataInfo,
  onSave: (_info: MetadataInfo) => void,
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.setAttribute('data-testid', 'properties-dialog');
  overlay.hidden = true;

  overlay.innerHTML = `
    <div class="dialog">
      <div class="dialog-header">
        <span class="dialog-title">Diagram Properties</span>
        <button class="dialog-close" data-testid="dialog-close" aria-label="Close">✕</button>
      </div>
      <div class="dialog-body">
        <div class="dialog-field">
          <label for="prop-title">Title</label>
          <input type="text" id="prop-title" value="${escapeHtml(current.title ?? '')}" placeholder="Untitled Diagram" />
        </div>
        <div class="dialog-field">
          <label for="prop-author">Author</label>
          <input type="text" id="prop-author" value="${escapeHtml(current.author ?? '')}" placeholder="Your name" />
        </div>
        <div class="dialog-field">
          <label for="prop-description">Description</label>
          <textarea id="prop-description" placeholder="Optional description...">${escapeHtml(current.description ?? '')}</textarea>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="dialog-cancel" data-testid="dialog-cancel">Cancel</button>
        <button class="dialog-save" data-testid="dialog-save">Save</button>
      </div>
    </div>
  `;

  // Wire close button
  overlay.querySelector('[data-testid="dialog-close"]')?.addEventListener('click', () => {
    hideDialog(overlay);
  });

  // Wire cancel button
  overlay.querySelector('[data-testid="dialog-cancel"]')?.addEventListener('click', () => {
    hideDialog(overlay);
  });

  // Wire save button
  overlay.querySelector('[data-testid="dialog-save"]')?.addEventListener('click', () => {
    const title = (overlay.querySelector('#prop-title') as HTMLInputElement)?.value ?? '';
    const author = (overlay.querySelector('#prop-author') as HTMLInputElement)?.value ?? '';
    const description =
      (overlay.querySelector('#prop-description') as HTMLTextAreaElement)?.value ?? '';
    onSave({
      title: title || null,
      author: author || null,
      description: description || null,
      tags: current.tags ?? [],
      created: current.created,
      modified: current.modified,
    });
    hideDialog(overlay);
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideDialog(overlay);
    }
  });

  document.body.appendChild(overlay);
  return overlay;
}

export function showDialog(overlay: HTMLElement): void {
  overlay.hidden = false;
  // Add Escape key listener
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideDialog(overlay);
      document.removeEventListener('keydown', onKeydown);
    }
  };
  document.addEventListener('keydown', onKeydown);
  // Focus first input
  setTimeout(() => {
    (overlay.querySelector('input') as HTMLInputElement)?.focus();
  }, 50);
}

export function hideDialog(overlay: HTMLElement): void {
  overlay.hidden = true;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
