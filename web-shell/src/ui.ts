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
import { buildHud, type HudControls } from './hud.js';
import { ICONS } from './icon.js';

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
  setDiagnostics(state: DiagnosticState, msg?: string): void;

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

  // ─── Zone 3.5: HUD ───────────────────────────────────────────────────────
  const hud = buildHud();

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

  // Page add button
  const addPageBtn = document.createElement('button');
  addPageBtn.className = 'page-tab-add';
  addPageBtn.setAttribute('data-testid', 'page-tab-add');
  addPageBtn.textContent = '+';
  addPageBtn.title = 'Add page';
  addPageBtn.disabled = true; // page creation not yet wired
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

  // Diagnostics badge (idle by default, shown on clean/error)
  const diagnosticsBadge = document.createElement('div');
  diagnosticsBadge.className = 'diagnostics-badge';
  diagnosticsBadge.setAttribute('data-testid', 'diagnostics-badge');
  diagnosticsBadge.hidden = true;

  errorBanner.hidden = true;
  errorBanner.appendChild(errorMessage);
  errorBanner.appendChild(dismissButton);
  errorBanner.appendChild(diagnosticsBadge);
  bottomBar.appendChild(errorBanner);

  // ─── Assemble into grid ──────────────────────────────────────────────────
  root.appendChild(rail.container);
  root.appendChild(navbar.container);
  root.appendChild(sidebar.container);
  root.appendChild(canvasContainer);
  root.appendChild(hud.container);
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
    railContainer: rail.container,

    // Zone 1
    fileInput: navbar.fileInput,
    undoButton: navbar.undoBtn,
    redoButton: navbar.redoBtn,
    saveButton: navbar.saveBtn,
    zoomDisplay: navbar.zoomDisplay,

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

// ─── Properties Dialog ───────────────────────────────────────────────────────

export interface DiagramProperties {
  title: string;
  author: string;
  description: string;
}

const PROPS_LS_KEY = 'hodei:diagram-props';

export function loadProperties(): DiagramProperties {
  try {
    const raw = localStorage.getItem(PROPS_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DiagramProperties>;
      return {
        title: parsed.title ?? '',
        author: parsed.author ?? '',
        description: parsed.description ?? '',
      };
    }
  } catch {
    // localStorage unavailable
  }
  return { title: '', author: '', description: '' };
}

export function saveProperties(props: DiagramProperties): void {
  try {
    localStorage.setItem(PROPS_LS_KEY, JSON.stringify(props));
  } catch {
    // localStorage unavailable
  }
}

/** Build a properties dialog overlay and mount it to document.body */
export function buildPropertiesDialog(onSave: (props: DiagramProperties) => void): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.setAttribute('data-testid', 'properties-dialog');
  overlay.hidden = true;

  const currentProps = loadProperties();

  overlay.innerHTML = `
    <div class="dialog">
      <div class="dialog-header">
        <span class="dialog-title">Diagram Properties</span>
        <button class="dialog-close" data-testid="dialog-close" aria-label="Close">✕</button>
      </div>
      <div class="dialog-body">
        <div class="dialog-field">
          <label for="prop-title">Title</label>
          <input type="text" id="prop-title" value="${escapeHtml(currentProps.title)}" placeholder="Untitled Diagram" />
        </div>
        <div class="dialog-field">
          <label for="prop-author">Author</label>
          <input type="text" id="prop-author" value="${escapeHtml(currentProps.author)}" placeholder="Your name" />
        </div>
        <div class="dialog-field">
          <label for="prop-description">Description</label>
          <textarea id="prop-description" placeholder="Optional description...">${escapeHtml(currentProps.description)}</textarea>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="dialog-cancel" data-testid="dialog-cancel">Cancel</button>
        <button class="dialog-save" data-testid="dialog-save">Save</button>
      </div>
      <div class="dialog-footnote">Engine metadata support coming in v2</div>
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
    const description = (overlay.querySelector('#prop-description') as HTMLTextAreaElement)?.value ?? '';
    onSave({ title, author, description });
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
