/**
 * main.ts — Bootstrap and wire the 5-zone web shell UI.
 *
 * Coordinates: engine session, editor, zoom/pan, inspector, menu actions.
 */

import { loadWasm } from './wasm-loader.js';
import { DiagramEngineSession } from './session.js';
import { StencilLibraryManager } from './stencil-library-manager.js';
import { mountSvg, setupZoomPan } from './renderer.js';
import { rasterizeSvgToPng } from './export-raster.js';
import {
  buildEmptyUi,
  populatePageTabs,
  showError,
  hideError,
  wireFileInput,
  wireDismiss,
  buildPropertiesDialog,
  showDialog,
  hideDialog,
} from './ui.js';
import { buildInspector } from './inspector.js';
import { type HudControls } from './hud.js';
import { Editor } from './editor.js';
import type { PageToken, PageRender, SlotmapId, ScenePage } from './types.js';
import { EMPTY_METADATA } from './types.js';
import { VersionStore } from './version-store.js';
import { HistoryPanel } from './history-panel.js';
import { runMathOverlay } from './math/math-overlay.js';
import { openMathInsertDialog } from './math/math-dialog.js';
import './styles.css';

let activeSession: DiagramEngineSession | null = null;
let activePages: PageRender[] = [];
let activeEditor: Editor | null = null;
let activeEditorIdx = 0;
let zoomPan: ReturnType<typeof setupZoomPan> | null = null;

// ─── Version history state ─────────────────────────────────────────────────────
const versionStore = new VersionStore();
let manualSaveCounter = 0;

// ─── Auto-save idle debounce (Task 3.2) ──────────────────────────────────────
const AUTO_SAVE_IDLE_MS = 30_000;
let last_command_at = 0;
let last_saved_at = 0;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let autoSavedTimer: ReturnType<typeof setTimeout> | null = null;
let hud: HudControls | null = null;

// ─── Grid overlay state ───────────────────────────────────────────────────────
const GRID_LS_KEY = 'hodei:grid-visible';

function setGridVisible(visible: boolean): void {
  try {
    localStorage.setItem(GRID_LS_KEY, String(visible));
  } catch {
    // localStorage may be unavailable
  }
}

// ─── Presentation mode state ──────────────────────────────────────────────────
let isPresentationMode = false;
let exitHintTimer: ReturnType<typeof setTimeout> | null = null;

function togglePresentationMode(): void {
  const el = document.getElementById('app');
  if (!el) return;
  if (!document.fullscreenElement) {
    el.requestFullscreen?.().catch(() => {
      /* graceful fallback */
    });
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

function exitPresentationMode(): void {
  // Belt-and-suspenders: directly update state in case fullscreenchange doesn't fire
  isPresentationMode = false;
  document.body.classList.remove('presentation-mode');
  hideExitHint();
  document.exitFullscreen?.().catch(() => {});
}

// ─── Keyboard Shortcuts Overlay ──────────────────────────────────────────────

function toggleShortcutsOverlay(): void {
  const existing = document.getElementById('keyboard-shortcuts-overlay');
  if (existing) {
    existing.remove();
    return;
  }
  const overlay = document.createElement('div');
  overlay.id = 'keyboard-shortcuts-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 2000;
    display: flex; align-items: center; justify-content: center;
  `;
  overlay.innerHTML = `
    <div style="background: var(--bg-secondary); border: 1px solid var(--border);
                border-radius: 10px; padding: 24px; min-width: 300px; color: var(--text);">
      <h3 style="margin: 0 0 16px; font-size: 14px; font-weight: 600;">Keyboard Shortcuts</h3>
      <div style="display: grid; gap: 8px; font-size: 12px;">
        <div><kbd style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">V</kbd> Select</div>
        <div><kbd style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">R</kbd> Shapes</div>
        <div><kbd style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">C</kbd> Connector</div>
        <div><kbd style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">T</kbd> Text</div>
        <div><kbd style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">F</kbd> Zoom to Fit</div>
        <div><kbd style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">Del</kbd> Delete</div>
        <div><kbd style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">Ctrl+Z</kbd> Undo</div>
        <div><kbd style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">Ctrl+Y</kbd> Redo</div>
      </div>
      <button id="close-shortcuts" style="
        margin-top: 16px; width: 100%; padding: 8px; background: var(--accent);
        color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;
      ">Close</button>
    </div>
  `;
  overlay.querySelector('#close-shortcuts')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

// ─── About Dialog ────────────────────────────────────────────────────────────

function showAboutDialog(): void {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.setAttribute('data-testid', 'about-dialog');
  overlay.innerHTML = `
    <div class="dialog">
      <div class="dialog-header">
        <span class="dialog-title">About Hodei Diagrams</span>
        <button class="dialog-close" data-testid="about-dialog-close" aria-label="Close">✕</button>
      </div>
      <div class="dialog-body" style="gap: 8px;">
        <p style="font-size: 13px; color: var(--text); margin: 0;">Hodei Diagrams</p>
        <p style="font-size: 12px; color: var(--text-dim); margin: 0;">Version 0.1.0</p>
        <p style="font-size: 12px; color: var(--text-dim); margin: 0;">Built with Rust + WebAssembly</p>
      </div>
      <div class="dialog-footer">
        <button class="dialog-save" data-testid="about-dialog-ok">OK</button>
      </div>
    </div>
  `;

  overlay.querySelector('[data-testid="about-dialog-close"]')?.addEventListener('click', () => {
    hideDialog(overlay);
  });
  overlay.querySelector('[data-testid="about-dialog-ok"]')?.addEventListener('click', () => {
    hideDialog(overlay);
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideDialog(overlay);
  });

  document.body.appendChild(overlay);
  showDialog(overlay);
}

// fullscreenchange — single source of truth for presentation mode state
function onFullscreenChange(): void {
  const active = document.fullscreenElement !== null;
  isPresentationMode = active;
  document.body.classList.toggle('presentation-mode', active);
  if (active) {
    zoomPan?.fitToView();
    showExitHint();
  } else {
    hideExitHint();
  }
}

function showExitHint(): void {
  let overlay = document.getElementById('exit-hint-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'exit-hint-overlay';
    overlay.setAttribute('aria-hidden', 'false');
    overlay.textContent = 'Press Esc to exit';
    document.body.appendChild(overlay);
  }
  overlay.style.opacity = '1';
  overlay.removeAttribute('aria-hidden');

  // Auto-fade after 3s
  if (exitHintTimer !== null) clearTimeout(exitHintTimer);
  exitHintTimer = setTimeout(() => {
    overlay!.style.opacity = '0';
    overlay!.setAttribute('aria-hidden', 'true');
  }, 3000);
}

function hideExitHint(): void {
  const overlay = document.getElementById('exit-hint-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.setAttribute('aria-hidden', 'true');
  }
  if (exitHintTimer !== null) {
    clearTimeout(exitHintTimer);
    exitHintTimer = null;
  }
}

document.addEventListener('fullscreenchange', onFullscreenChange);

function updateUndoRedoButtons(
  undoBtn: HTMLButtonElement | undefined,
  redoBtn: HTMLButtonElement | undefined,
): void {
  if (!activeSession) return;
  if (undoBtn) undoBtn.disabled = !activeSession.canUndo();
  if (redoBtn) redoBtn.disabled = !activeSession.canRedo();
}

/** Create a Blob download of a .drawio XML string. */
function downloadDrawio(xml: string, filename: string): void {
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Create a Blob download of an SVG string. */
function downloadSvg(svg: string, filename: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Create a Blob download of an SVG wrapped in a standalone HTML page. */
function downloadHtml(svg: string, filename: string): void {
  const html = `<!DOCTYPE html>
<html>
<head><title>${filename.replace('.html', '')}</title>
<style>body { margin: 0; } svg { display: block; }</style>
</head>
<body>${svg}</body>
</html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Capture the current diagram state and persist it to IndexedDB via VersionStore. */
async function manualSaveVersion(): Promise<void> {
  if (!activeSession) {
    console.warn('[manualSaveVersion] No active session');
    return;
  }

  // Mark as saving and cancel any pending auto-saved revert
  hud?.setSaveStatus('saving');
  if (autoSavedTimer !== null) {
    clearTimeout(autoSavedTimer);
    autoSavedTimer = null;
  }

  const exportResult = activeSession.exportDrawio();
  if (!exportResult.ok) {
    console.error('[manualSaveVersion] Export failed:', exportResult.error);
    return;
  }

  const metadataResult = activeSession.getMetadata();
  const metadataStr = metadataResult.ok ? JSON.stringify(metadataResult.value) : undefined;

  manualSaveCounter++;
  const name = `Manual: v${manualSaveCounter}`;

  try {
    const record: Omit<import('./version-store.js').VersionRecord, 'id' | 'created' | 'updated'> = {
      name,
      snapshot: exportResult.value,
      schema_version: 1,
    };
    if (metadataStr !== undefined) {
      record.metadata = metadataStr;
    }
    const id = await versionStore.put(record);
    console.log(`[manualSaveVersion] Saved "${name}" with id=${id}`);
    // Suppress next auto-save (Q8: timestamp comparison)
    last_saved_at = Date.now();
    hud?.setSaveStatus('saved');
  } catch (err) {
    console.error('[manualSaveVersion] IDB put failed:', err);
    hud?.setSaveStatus('unsaved');
  }
}

/**
 * Internal snapshot capture shared by manual and auto-save.
 * Returns { snapshot, metadataStr } or null if export fails.
 */
async function captureSnapshot(): Promise<{ snapshot: string; metadataStr?: string } | null> {
  if (!activeSession) return null;
  const exportResult = activeSession.exportDrawio();
  if (!exportResult.ok) {
    console.error('[captureSnapshot] Export failed:', exportResult.error);
    return null;
  }
  const metadataResult = activeSession.getMetadata();
  const metadataStr = metadataResult.ok ? JSON.stringify(metadataResult.value) : undefined;
  const result: { snapshot: string; metadataStr?: string } = { snapshot: exportResult.value };
  if (metadataStr !== undefined) {
    result.metadataStr = metadataStr;
  }
  return result;
}

/** Schedule a pending auto-save timer (clears any existing timer). */
function scheduleAutoSave(): void {
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer);
  }
  autoSaveTimer = setTimeout(autoSaveTick, AUTO_SAVE_IDLE_MS);
}

/** Fire auto-save if state has changed since last save (Q8: timestamp suppression). */
async function autoSaveTick(): Promise<void> {
  autoSaveTimer = null;
  if (last_command_at <= last_saved_at) {
    return; // No state change since last save — suppress
  }
  hud?.setSaveStatus('saving');
  const captured = await captureSnapshot();
  if (!captured) return;

  const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  try {
    const record: Omit<import('./version-store.js').VersionRecord, 'id' | 'created' | 'updated'> = {
      name: `Auto-save ${time}`,
      snapshot: captured.snapshot,
      schema_version: 1,
    };
    if (captured.metadataStr !== undefined) {
      record.metadata = captured.metadataStr;
    }
    const id = await versionStore.put(record);
    last_saved_at = Date.now();
    console.log(`[autoSaveTick] Saved auto-save with id=${id}`);
    hud?.setSaveStatus('auto-saved');
    // Schedule 2s revert to 'saved', cancelled on new command (see onStateChange)
    if (autoSavedTimer !== null) clearTimeout(autoSavedTimer);
    autoSavedTimer = setTimeout(() => {
      // Only revert if no new command landed during the 2s window
      if (last_command_at <= last_saved_at) {
        hud?.setSaveStatus('saved');
      }
      autoSavedTimer = null;
    }, 2000);
  } catch (err) {
    console.error('[autoSaveTick] IDB put failed:', err);
    hud?.setSaveStatus('unsaved');
    // Best-effort: editor continues (I10)
  }
}

/** Get human-readable selection label from scene data */
function getSelectionLabel(ids: SlotmapId[], sceneData: ScenePage[]): string {
  if (ids.length === 0) return 'Nothing selected';
  if (ids.length > 1) return `${ids.length} shapes selected`;

  // Single selection — find the vertex in scene data
  const id = ids[0]!;
  for (const page of sceneData) {
    for (const elem of page.display_list) {
      const e = elem as Record<string, unknown>;
      for (const key of ['Rect', 'RoundedRect', 'Ellipse'] as const) {
        const variant = e[key] as Record<string, unknown> | undefined;
        if (!variant) continue;
        const idField = variant['id'] as { idx?: number; version?: number } | undefined;
        if (!idField) continue;
        if (idField.idx === id.idx && idField.version === id.version) {
          const bounds = variant['bounds'] as
            | { origin?: Record<string, number>; size?: Record<string, number> }
            | undefined;
          if (bounds?.origin && bounds?.size) {
            const w = bounds.size['width'] ?? 0;
            const h = bounds.size['height'] ?? 0;
            const shapeType =
              key === 'Rect' ? 'Rect' : key === 'RoundedRect' ? 'RoundedRect' : 'Ellipse';
            return `${shapeType} ${Math.round(w)}×${Math.round(h)}`;
          }
          const shapeType =
            key === 'Rect' ? 'Rect' : key === 'RoundedRect' ? 'RoundedRect' : 'Ellipse';
          return shapeType;
        }
      }
    }
  }
  return 'Shape selected';
}

/** Show a loading overlay on root while WASM initializes */
function showWasmOverlay(root: HTMLElement): void {
  root.textContent = '';
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('data-testid', 'loading-overlay');
  overlay.innerHTML = `
    <span class="loading-overlay-spinner" aria-hidden="true"></span>
    <span>Loading engine...</span>
  `;
  root.appendChild(overlay);
}

/** Remove the WASM init overlay */
function hideWasmOverlay(root: HTMLElement): void {
  const overlay = root.querySelector('.loading-overlay');
  if (overlay) overlay.remove();
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) {
    document.body.textContent = 'Fatal: #app element not found';
    return;
  }

  // ─── 1. WASM loading ──────────────────────────────────────────────────────
  showWasmOverlay(root);
  const wasmResult = await loadWasm();
  if (!wasmResult.ok) {
    root.textContent = 'Failed to load diagram engine: ' + wasmResult.error;
    return;
  }
  hideWasmOverlay(root);

  // ─── 2. Engine session ────────────────────────────────────────────────────
  const sessionResult = DiagramEngineSession.create(wasmResult.value);
  if (!sessionResult.ok) {
    root.textContent = 'Failed to create engine session: ' + sessionResult.error;
    return;
  }

  activeSession = sessionResult.value;

  // ─── 3. Create StencilLibraryManager ───────────────────────────────────────
  // The manager auto-loads general.xml + flowchart.xml in its constructor.
  // It must exist BEFORE buildEmptyUi so the sidebar can subscribe to it.
  const stencilManager = new StencilLibraryManager(activeSession, wasmResult.value);

  // ─── 4. Build Inspector (needed before UI for update wiring) ──────────────
  const inspector = buildInspector(activeSession);

  // ─── 4.5. Create zoom/pan controls early so rail callbacks can reference them ─
  // We create a minimal container just for zoom/pan, then rebuild properly in buildEmptyUi
  const zoomPanPlaceholder = document.createElement('div');
  const viewerPlaceholder = document.createElement('div');
  // Initial zoom/pan setup — recreated with real DOM after buildEmptyUi
  zoomPan = setupZoomPan(zoomPanPlaceholder, viewerPlaceholder);

  // ─── 5. Build 5-zone UI with inspector ────────────────────────────────────
  const ui = buildEmptyUi(root, activeSession, inspector.container, {
    onSelectTool: () => {
      activeEditor?.setActiveTool(null);
      ui.rectToolButton.classList.remove('active-tool');
      ui.ellipseToolButton.classList.remove('active-tool');
    },
    onShapesTool: () => {
      // Shapes tool activates the rectangle by default
      if (activeEditor) {
        activeEditor.setActiveTool('rectangle');
        ui.rectToolButton.classList.add('active-tool');
        ui.ellipseToolButton.classList.remove('active-tool');
      }
    },
    onConnectorTool: () => {
      activeEditor?.setActiveTool('connector');
    },
    onTextTool: () => {
      activeEditor?.enterLabelPlacement();
    },
    onZoomFit: () => {
      zoomPan?.fitToView();
      ui.zoomDisplay.textContent = `${Math.round((zoomPan?.getZoom() ?? 1) * 100)}%`;
      ui.hud.setZoom((zoomPan?.getZoom() ?? 1) * 100);
      ui.canvasContainer.style.setProperty('--zoom', String(zoomPan?.getZoom() ?? 1));
    },
    onHelp: () => {
      toggleShortcutsOverlay();
    },
  }, stencilManager);

  // Make hud accessible to module-level save functions
  hud = ui.hud;

  // ─── 4.5. Restore grid state (default: visible) ─────────────────────────
  // The empty canvas benefits from a visible grid so users see the
  // drawing surface immediately. Default flipped from hidden to visible
  // in fix/empty-canvas-bootstrap.
  const gridMenuItem = document.getElementById('menu-item-grid');
  const shouldShowGrid = (() => {
    try {
      const stored = localStorage.getItem(GRID_LS_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  })();
  if (shouldShowGrid) {
    ui.canvasContainer.classList.add('show-grid');
    gridMenuItem?.classList.add('has-checkmark');
  }

  function toggleGrid(): void {
    const visible = ui.canvasContainer.classList.toggle('show-grid');
    setGridVisible(visible);
    gridMenuItem?.classList.toggle('has-checkmark', visible);
    ui.hud.setGrid(visible);
  }

  gridMenuItem?.addEventListener('click', () => {
    toggleGrid();
  });

  // ─── View > Math Mode toggle ───────────────────────────────────────────────
  const mathModeMenuItem = document.getElementById('menu-item-math-mode');
  function syncMathModeCheckmark(): void {
    const sceneResult = activeEditor?.getSceneCache();
    const scenePages = sceneResult?.ok ? sceneResult.value : [];
    const pageIdx = activeEditor?.activePageIdx ?? 0;
    const page = scenePages[pageIdx];
    const enabled = page?.math_enabled ?? false;
    mathModeMenuItem?.classList.toggle('has-checkmark', enabled);
  }
  mathModeMenuItem?.addEventListener('click', () => {
    if (!activeSession || !activeEditor) return;
    const pageIdx = activeEditor.activePageIdx;
    const sceneResult = activeEditor.getSceneCache();
    const scenePages = sceneResult?.ok ? sceneResult.value : [];
    const page = scenePages[pageIdx];
    const currentlyEnabled = page?.math_enabled ?? false;
    const result = activeSession.setPageMathEnabled(pageIdx, !currentlyEnabled);
    if (result.ok) {
      // Toggle the checkmark immediately using the value we just applied.
      // Reading it back from the scene cache would be racy because the
      // editor's triggerReplay() is rAF-scheduled.
      mathModeMenuItem?.classList.toggle('has-checkmark', !currentlyEnabled);
      refreshMathOverlay();
      requestAnimationFrame(syncMathModeCheckmark);
    }
  });
  syncMathModeCheckmark();

  // ─── Insert > Math Formula ─────────────────────────────────────────────────
  const insertMathMenuItem = document.getElementById('menu-item-insert-math');
  insertMathMenuItem?.addEventListener('click', () => {
    openMathInsertDialog((latex: string) => {
      // Insert a rectangle at canvas center with the LaTeX as its label.
      // The math overlay will render it as KaTeX after the next scene refresh,
      // provided the current page has View > Math Mode toggled on.
      activeEditor?.insertMathFormula(latex);
      refreshMathOverlay();
    });
  });

  // ─── Math overlay helper ──────────────────────────────────────────────────
  /**
   * Refresh the math overlay on the current SVG.
   * Called after mountSvg to apply KaTeX overlays on math-labeled text elements.
   */
  function refreshMathOverlay(): void {
    const svgEl = ui.viewer.querySelector('svg');
    if (!svgEl) return;
    const sceneResult = activeEditor?.getSceneCache();
    const scenePages = sceneResult?.ok ? sceneResult.value : [];
    const pageIdx = activeEditor?.activePageIdx ?? 0;
    const page = scenePages[pageIdx];
    const mathEnabled = page?.math_enabled ?? false;
    runMathOverlay(svgEl as SVGElement, mathEnabled);
  }

  // ─── 14.7. Ctrl+G keyboard shortcut for grid toggle ──────────────────────
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
      e.preventDefault();
      toggleGrid();
    }
    // Ctrl+Shift+P for presentation mode
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      togglePresentationMode();
    }
    // Escape to exit presentation mode (belt-and-suspenders for headless Chromium
    // where fullscreenchange may not fire reliably on Escape)
    if (e.key === 'Escape' && isPresentationMode) {
      exitPresentationMode();
    }
  });

  // ─── 4.6. Mount Version History panel in Zone 2 sidebar (Task 3.5) ───────
  // Create a container inside the sidebar for the history panel
  const historyPanelContainer = document.createElement('div');
  historyPanelContainer.className = 'history-panel-container';
  historyPanelContainer.setAttribute('data-testid', 'history-panel-container');
  ui.sidebar.appendChild(historyPanelContainer);

  // HistoryPanel instance — lives for the lifetime of the session
  const historyPanel = new HistoryPanel(historyPanelContainer, activeSession, versionStore);

  // Initial render of the panel
  historyPanel.render();

  // Wire history-save: manual save triggered from panel button
  historyPanelContainer.addEventListener('history-save', () => {
    manualSaveVersion().then(() => historyPanel.render());
  });

  // Wire history-restore: Q9 default — auto-save before restore (transparent preservation)
  historyPanelContainer.addEventListener('history-restore', async (e) => {
    const event = e as CustomEvent<{ id: string }>;
    const { id } = event.detail;
    if (!activeSession) return;

    // 1. Auto-save if state changed since last save (Q9)
    if (last_command_at > last_saved_at) {
      await manualSaveVersion();
    }

    // 2. Get version record
    const version = await versionStore.get(id);
    if (!version) {
      console.error('[history-restore] Version not found:', id);
      return;
    }

    // 3. Import snapshot
    const importResult = activeSession.importDrawio(version.snapshot);
    if (!importResult.ok) {
      console.error('[history-restore] Import failed:', importResult.error);
      showError(ui.errorBanner, ui.errorMessage, 'Restore failed: ' + importResult.error);
      return;
    }

    // 4. Apply metadata if present
    if (version.metadata) {
      try {
        const meta = JSON.parse(version.metadata);
        activeSession.setMetadata(meta);
      } catch (err) {
        console.warn('[history-restore] Failed to parse metadata:', err);
      }
    }

    // 5. Re-render scene and panel
    const renderResult = activeSession.renderAllPages();
    if (renderResult.ok && renderResult.value.length > 0) {
      mountSvg(ui.viewer, renderResult.value[0]!.svg);
      refreshMathOverlay();
    }
    activeEditor?.refreshScene();
    await historyPanel.render();
  });

  // Wire history-delete: remove version from store, re-render panel (Task 3.4)
  historyPanelContainer.addEventListener('history-delete', async (e) => {
    const event = e as CustomEvent<{ id: string }>;
    const { id } = event.detail;
    await versionStore.delete(id);
    await historyPanel.render();
  });

  // ─── 5. Zoom/Pan on canvas container ──────────────────────────────────────
  // zoomPan was created with placeholder elements above; now recreate with real DOM
  zoomPan = setupZoomPan(ui.canvasContainer, ui.viewer);

  // ─── 6. Editor ────────────────────────────────────────────────────────────
  const onEditorError = (msg: string) => {
    showError(ui.errorBanner, ui.errorMessage, msg);
  };

  const onStateChange = () => {
    updateUndoRedoButtons(ui.undoButton, ui.redoButton);
    // Reflect any snap-toggle triggered by a keyboard shortcut or the snap
    // menu (the menu's own click handler updates the HUD itself).
    if (activeEditor) {
      ui.hud.setSnap(activeEditor.snapEnabled);
    }
    // Track command for auto-save suppression (Q8: timestamp comparison)
    last_command_at = Date.now();
    scheduleAutoSave();
    // Cancel any pending auto-saved → saved revert and mark as unsaved
    if (autoSavedTimer !== null) {
      clearTimeout(autoSavedTimer);
      autoSavedTimer = null;
    }
    ui.hud.setSaveStatus('unsaved');
  };

  // Selection change → inspector update + HUD update
  const onSelectionChange = (ids: SlotmapId[]) => {
    // Update inspector with current selection and scene data
    if (activeEditor) {
      const scene = activeEditor.getSceneCache();
      const sceneData = scene.ok ? scene.value : [];
      inspector.update(ids, sceneData, activeEditor.activePageIdx);
      // Update arrange button states based on selection size
      inspector.setSelectionSize(ids.length);
      // Update HUD selection label
      ui.hud.setSelection(getSelectionLabel(ids, sceneData));
      // Update HUD selection count
      ui.hud.setSelectionCount(ids.length);
      // Update toolbar buttons
      ui.toolbar.update(ids);
    }
    // Update zoom display
    ui.zoomDisplay.textContent = `${Math.round((zoomPan?.getZoom() ?? 1) * 100)}%`;
    // Update HUD zoom
    ui.hud.setZoom((zoomPan?.getZoom() ?? 1) * 100);
  };

  // Tool change → UI update (remove active-tool class)
  const onToolChange = (tool: import('./editor.js').ToolKind) => {
    if (tool === null) {
      ui.rectToolButton.classList.remove('active-tool');
      ui.ellipseToolButton.classList.remove('active-tool');
    }
  };

  // ─── Bootstrap empty canvas ──────────────────────────────────────────────
  // The fresh engine has zero pages (DiagramModel::default). Without a
  // page, renderAllPages() returns an empty array, mountSvg is never
  // called, and the viewer stays dark. Add a default empty page so the
  // canvas is immediately visible and editable.
  const bootstrapResult = activeSession.executeCommand(JSON.stringify({
    AddPage: {
      page: {
        id: { idx: 0, version: 0 },
        name: { text: 'Page 1' },
        size: { width: 800, height: 600 },
      },
    },
  }));
  if (!bootstrapResult.ok) {
    showError(ui.errorBanner, ui.errorMessage, 'Bootstrap failed: ' + bootstrapResult.error);
  }

  // Render the initial empty page
  const bootstrapRender = activeSession.renderAllPages();
  if (bootstrapRender.ok && bootstrapRender.value.length > 0) {
    activePages = bootstrapRender.value;
    mountSvg(ui.viewer, activePages[0]!.svg);
    populatePageTabs(ui.pageTabContainer, activePages, 0, {
      onSelect: handlePageSelect,
      onRename: handlePageRename,
      onDelete: handlePageDelete,
    });
    ui.hud.setPage(1, activePages.length);
    ui.hud.setMode('Edit');
    ui.saveButton.disabled = false;
  }

  // ─── Initialize editor and wire shape/drop listeners at startup ─────────
  // Previously this lived inside handleImport, so before any file load the
  // canvas was inert and shape buttons did nothing. Now the editor is
  // ready as soon as the engine session is up.
  activeEditor = new Editor(
    activeSession,
    ui.viewer,
    onEditorError,
    onStateChange,
    onSelectionChange,
    onToolChange,
    () => zoomPan?.getZoom() ?? 1,
  );
  activeEditor.attach();

  activeEditor.setZoomCallbacks({
    zoomIn: () => {
      zoomPan?.setZoom((zoomPan?.getZoom() ?? 1) + 0.2);
      ui.hud.setZoom((zoomPan?.getZoom() ?? 1) * 100);
    },
    zoomOut: () => {
      zoomPan?.setZoom((zoomPan?.getZoom() ?? 1) - 0.2);
      ui.hud.setZoom((zoomPan?.getZoom() ?? 1) * 100);
    },
    resetZoom: () => {
      zoomPan?.resetView();
      ui.hud.setZoom(100);
    },
  });

  activeEditor.onCursorMove((p) => ui.hud.setCursor(p.x, p.y));

  // Snap menu wiring
  const snapMenuItem = document.getElementById('menu-item-snap');
  function updateSnapCheckState(): void {
    if (!activeEditor) return;
    snapMenuItem?.classList.toggle('has-checkmark', activeEditor.snapEnabled);
  }
  snapMenuItem?.addEventListener('click', () => {
    if (!activeEditor) return;
    activeEditor.toggleSnap();
    updateSnapCheckState();
    ui.hud.setSnap(activeEditor.snapEnabled);
  });

  inspector.setEditor(activeEditor);
  ui.toolbar.setEditor(activeEditor);
  ui.toolbar.update([]);

  // Stencil drag-and-drop
  const stencilBtns = [
    ui.rectangleStencilButton,
    ui.ellipseStencilButton,
    ui.diamondStencilButton,
    ui.triangleStencilButton,
    ui.hexagonStencilButton,
    ui.cylinderStencilButton,
    ui.cloudStencilButton,
    ui.parallelogramStencilButton,
    ui.trapezoidStencilButton,
    ui.blockArrowStencilButton,
  ];

  for (const btn of stencilBtns) {
    if (!btn) continue;
    btn.addEventListener('dragstart', (e) => {
      if (!activeEditor) return;
      const stencilName = btn.getAttribute('data-stencil-name') ?? '';
      const toolMap: Record<string, string> = {
        rectangle: 'rectangle-stencil',
        ellipse: 'ellipse-stencil',
        diamond: 'diamond-stencil',
        triangle: 'triangle-stencil',
        hexagon: 'hexagon-stencil',
        cylinder: 'cylinder-stencil',
        cloud: 'cloud-stencil',
        parallelogram: 'parallelogram-stencil',
        trapezoid: 'trapezoid-stencil',
        blockArrow: 'blockArrow-stencil',
      };
      const tool = toolMap[stencilName] ?? 'rectangle-stencil';
      activeEditor.startStencilDrag(tool, e.clientX, e.clientY);
    });
  }

  ui.canvasContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!activeEditor) return;
    activeEditor.updateStencilDragPreview(e.clientX, e.clientY);
  });

  ui.canvasContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!activeEditor) return;
    activeEditor.endStencilDrag(e.clientX, e.clientY);
  });

  // Dynamic stencil library shape activation (click-to-add)
  ui.sidebar.addEventListener('stencil-shape-activate', (e) => {
    if (!activeSession) return;
    const event = e as CustomEvent<{ library: string; name: string }>;
    const { library, name } = event.detail;
    activeSession.addStencilVertex(library, name, 400, 300);
  });

  // Re-render when session state changes
  activeSession.setOnStateChange(() => {
    activeEditor?.triggerReplay();
    onStateChange();
  });

  activeEditor.refreshScene();
  activeEditorIdx = 0;
  activeEditor.activePageIdx = 0;
  updateUndoRedoButtons(ui.undoButton, ui.redoButton);

  // ─── 6. Import handler ────────────────────────────────────────────────────
  // Editor + shape listeners are wired at startup (above). This handler
  // just replaces the engine contents with the imported diagram and
  // re-renders the canvas.
  function handleImport(xml: string): void {
    if (!activeSession) return;
    const importResult = activeSession.importDrawio(xml);
    if (!importResult.ok) {
      showError(ui.errorBanner, ui.errorMessage, 'Import failed: ' + importResult.error);
      ui.setDiagnostics('error', 'Import failed: ' + importResult.error);
      return;
    }

    const renderResult = activeSession.renderAllPages();
    if (!renderResult.ok) {
      showError(ui.errorBanner, ui.errorMessage, 'Render failed: ' + renderResult.error);
      ui.setDiagnostics('error', 'Render failed: ' + renderResult.error);
      return;
    }

    // Successful import — show clean diagnostics badge
    ui.setDiagnostics('clean');

    activePages = renderResult.value;
    if (activePages.length > 0) {
      mountSvg(ui.viewer, activePages[0]!.svg);
      refreshMathOverlay();
      populatePageTabs(ui.pageTabContainer, activePages, 0, {
        onSelect: handlePageSelect,
        onRename: handlePageRename,
        onDelete: handlePageDelete,
      });
    }

    activeEditor?.refreshScene();
    activeEditorIdx = 0;
    if (activeEditor) activeEditor.activePageIdx = 0;

    ui.hud.setPage(1, activePages.length);
    ui.hud.setMode('Edit');
    ui.saveButton.disabled = false;
    updateUndoRedoButtons(ui.undoButton, ui.redoButton);

    zoomPan?.resetView();
    ui.zoomDisplay.textContent = '100%';
    ui.hud.setZoom(100);
    ui.canvasContainer.style.setProperty('--zoom', '1');
  }

  // ─── 7. Page switch handler ───────────────────────────────────────────────
  function handlePageSelect(pageIdNum: number): void {
    if (!activeSession || activePages.length === 0) return;
    const token = pageIdNum as PageToken;
    const svg = activeSession.getPage(token);
    if (svg) {
      mountSvg(ui.viewer, svg);
      const idx = activePages.findIndex((p) => p.pageId === token);
      if (idx >= 0) {
        activeEditorIdx = idx;
        if (activeEditor) {
          activeEditor.activePageIdx = idx;
          activeEditor.refreshScene();
          refreshMathOverlay();
        }
        // Update HUD page info
        ui.hud.setPage(idx + 1, activePages.length);
        // Reset zoom on page switch
        zoomPan?.resetView();
        ui.zoomDisplay.textContent = '100%';
        ui.hud.setZoom(100);
        ui.canvasContainer.style.setProperty('--zoom', '1');
      }
    }
  }

  /** Re-render page tabs after any add/rename/delete operation. */
  function refreshPageTabs(): void {
    if (!activeSession) return;
    const renderResult = activeSession.renderAllPages();
    if (!renderResult.ok) return;
    activePages = renderResult.value;
    const idx = Math.min(activeEditorIdx, activePages.length - 1);
    populatePageTabs(ui.pageTabContainer, activePages, idx, {
      onSelect: handlePageSelect,
      onRename: handlePageRename,
      onDelete: handlePageDelete,
    });
    // Update HUD page info
    ui.hud.setPage(idx + 1, activePages.length);
  }

  /** Add a new page. */
  function handlePageAdd(): void {
    if (!activeSession) return;
    const cmd = JSON.stringify({
      AddPage: {
        page: {
          id: { idx: 0, version: 0 },
          name: null,
          size: { width: 800.0, height: 600.0 },
        },
      },
    });
    const r = activeSession.executeCommand(cmd);
    if (!r.ok) {
      showError(ui.errorBanner, ui.errorMessage, 'Add page failed: ' + r.error);
      return;
    }
    refreshPageTabs();
    // Switch to the new page (last one)
    const newIdx = activePages.length - 1;
    const newPage = activePages[newIdx];
    if (newPage) {
      activeEditorIdx = newIdx;
      if (activeEditor) {
        activeEditor.activePageIdx = newIdx;
        activeEditor.refreshScene();
      }
      const svg = activeSession.getPage(newPage.pageId);
      if (svg) {
        mountSvg(ui.viewer, svg);
        refreshMathOverlay();
      }
      ui.hud.setPage(newIdx + 1, activePages.length);
    }
    zoomPan?.resetView();
    ui.zoomDisplay.textContent = '100%';
    ui.hud.setZoom(100);
    ui.canvasContainer.style.setProperty('--zoom', '1');
  }

  /** Rename an existing page. */
  function handlePageRename(pageIdNum: number, newName: string): void {
    if (!activeSession) return;
    const cmd = JSON.stringify({
      RenamePage: {
        id: { idx: pageIdNum, version: 0 },
        name: { text: newName },
      },
    });
    const r = activeSession.executeCommand(cmd);
    if (!r.ok) {
      showError(ui.errorBanner, ui.errorMessage, 'Rename page failed: ' + r.error);
      return;
    }
    refreshPageTabs();
  }

  /** Delete an existing page (cannot delete the last page). */
  function handlePageDelete(pageIdNum: number): void {
    if (!activeSession || activePages.length <= 1) return;
    const cmd = JSON.stringify({
      RemovePage: {
        id: { idx: pageIdNum, version: 0 },
      },
    });
    const r = activeSession.executeCommand(cmd);
    if (!r.ok) {
      showError(ui.errorBanner, ui.errorMessage, 'Delete page failed: ' + r.error);
      return;
    }
    // Adjust active index if needed
    const oldIdx = activeEditorIdx;
    const deletedIdx = activePages.findIndex((p) => p.pageId === pageIdNum);
    refreshPageTabs();
    // Switch to appropriate page
    let newIdx = activeEditorIdx;
    if (deletedIdx <= oldIdx && activeEditorIdx > 0) {
      newIdx = activeEditorIdx - 1;
    }
    if (newIdx >= activePages.length) {
      newIdx = activePages.length - 1;
    }
    if (newIdx < 0) newIdx = 0;
    activeEditorIdx = newIdx;
    if (activeEditor) {
      activeEditor.activePageIdx = newIdx;
      activeEditor.refreshScene();
    }
    const newPage = activePages[newIdx];
    if (newPage) {
      const svg = activeSession.getPage(newPage.pageId);
      if (svg) {
        mountSvg(ui.viewer, svg);
        refreshMathOverlay();
      }
    }
    ui.hud.setPage(newIdx + 1, activePages.length);
    zoomPan?.resetView();
    ui.zoomDisplay.textContent = '100%';
    ui.hud.setZoom(100);
    ui.canvasContainer.style.setProperty('--zoom', '1');
  }

  // ─── 8. Wire file input (from navbar File > Open) ─────────────────────────
  wireFileInput(ui.fileInput, handleImport);

  // ─── 9. Wire error dismiss ────────────────────────────────────────────────
  wireDismiss(ui.dismissButton, () => {
    hideError(ui.errorBanner);
  });

  // ─── 10. Wire Save button ─────────────────────────────────────────────────
  ui.saveButton.addEventListener('click', () => {
    if (!activeSession) return;
    const result = activeSession.exportDrawio();
    if (result.ok) {
      downloadDrawio(result.value, 'diagram.drawio');
    } else {
      showError(ui.errorBanner, ui.errorMessage, 'Export failed: ' + result.error);
    }
  });

  // ─── 11. Wire Undo/Redo buttons ───────────────────────────────────────────
  ui.undoButton.addEventListener('click', () => {
    activeEditor?.undoCmd();
    updateUndoRedoButtons(ui.undoButton, ui.redoButton);
  });
  ui.redoButton.addEventListener('click', () => {
    activeEditor?.redoCmd();
    updateUndoRedoButtons(ui.undoButton, ui.redoButton);
  });

  // ─── 11.5. Wire Add Page button ──────────────────────────────────────────
  ui.pageTabAdd.addEventListener('click', () => {
    handlePageAdd();
  });

  // ─── 12. Wire palette tools ───────────────────────────────────────────────
  // All shape tool buttons share the same toggle pattern: click activates,
  // click again deactivates. The button visual class is synced to the active
  // tool so users always know which one is armed.
  type ShapeTool =
    | 'rectangle'
    | 'rounded-rect'
    | 'ellipse'
    | 'diamond'
    | 'triangle'
    | 'hexagon'
    | 'cylinder'
    | 'cloud'
    | 'parallelogram'
    | 'trapezoid'
    | 'polygon'
    | 'rectangle-stencil'
    | 'ellipse-stencil'
    | 'diamond-stencil'
    | 'triangle-stencil'
    | 'hexagon-stencil'
    | 'cylinder-stencil'
    | 'cloud-stencil'
    | 'parallelogram-stencil'
    | 'trapezoid-stencil'
    | 'blockArrow-stencil';
  interface ToolBtn {
    btn: HTMLButtonElement;
    tool: ShapeTool;
  }
  const uiRecord = ui as unknown as Record<string, HTMLButtonElement | undefined>;
  const pickBtn = (key: string, tool: ShapeTool): ToolBtn | null => {
    const b = uiRecord[key];
    return b ? { btn: b, tool } : null;
  };
  const allToolButtons: ToolBtn[] = [
    pickBtn('rectToolButton', 'rectangle'),
    pickBtn('roundedRectToolButton', 'rounded-rect'),
    pickBtn('ellipseToolButton', 'ellipse'),
    pickBtn('diamondToolButton', 'diamond'),
    pickBtn('triangleToolButton', 'triangle'),
    pickBtn('hexagonToolButton', 'hexagon'),
    pickBtn('cylinderToolButton', 'cylinder'),
    pickBtn('cloudToolButton', 'cloud'),
    pickBtn('parallelogramToolButton', 'parallelogram'),
    pickBtn('trapezoidToolButton', 'trapezoid'),
    pickBtn('polygonToolButton', 'polygon'),
    pickBtn('rectangleStencilButton', 'rectangle-stencil'),
    pickBtn('ellipseStencilButton', 'ellipse-stencil'),
    pickBtn('diamondStencilButton', 'diamond-stencil'),
    pickBtn('triangleStencilButton', 'triangle-stencil'),
    pickBtn('hexagonStencilButton', 'hexagon-stencil'),
    pickBtn('cylinderStencilButton', 'cylinder-stencil'),
    pickBtn('cloudStencilButton', 'cloud-stencil'),
    pickBtn('parallelogramStencilButton', 'parallelogram-stencil'),
    pickBtn('trapezoidStencilButton', 'trapezoid-stencil'),
    pickBtn('blockArrowStencilButton', 'blockArrow-stencil'),
  ].filter((x): x is ToolBtn => x !== null);

  for (const { btn, tool } of allToolButtons) {
    btn.addEventListener('click', () => {
      if (!activeEditor) return;
      if (activeEditor.activeTool === tool) {
        activeEditor.setActiveTool(null);
      } else {
        activeEditor.setActiveTool(tool);
      }
      // Sync visual class across all tool buttons
      for (const { btn: b, tool: t } of allToolButtons) {
        b.classList.toggle('active-tool', activeEditor?.activeTool === t);
      }
    });
  }

  // ─── 13. Wire menu items ──────────────────────────────────────────────────

  // File > Open - re-use fileInput
  // File > Save
  const menuSave = document.querySelector('[data-testid="menu-save"]');
  menuSave?.addEventListener('click', () => {
    ui.saveButton.click();
  });

  // Edit > Undo
  const menuUndo = document.querySelector('[data-testid="menu-undo"]');
  menuUndo?.addEventListener('click', () => {
    ui.undoButton.click();
  });

  // Edit > Redo
  const menuRedo = document.querySelector('[data-testid="menu-redo"]');
  menuRedo?.addEventListener('click', () => {
    ui.redoButton.click();
  });

  // Edit > Delete
  const menuDelete = document.querySelector('[data-testid="menu-delete"]');
  menuDelete?.addEventListener('click', () => {
    // Simulate Delete key press
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
  });

  // Edit > Select All (Ctrl+A)
  const menuSelectAll = document.querySelector('[data-testid="menu-select-all"]');
  menuSelectAll?.addEventListener('click', () => {
    activeEditor?.selectAll();
  });

  // View > Zoom In
  const menuZoomIn = document.querySelector('[data-testid="menu-view"] .menu-item:nth-child(1)');
  menuZoomIn?.addEventListener('click', () => {
    zoomPan?.setZoom((zoomPan?.getZoom() ?? 1) + 0.2);
    ui.zoomDisplay.textContent = `${Math.round((zoomPan?.getZoom() ?? 1) * 100)}%`;
  });

  // View > Zoom Out
  const menuZoomOut = document.querySelector('[data-testid="menu-view"] .menu-item:nth-child(2)');
  menuZoomOut?.addEventListener('click', () => {
    zoomPan?.setZoom((zoomPan?.getZoom() ?? 1) - 0.2);
    ui.zoomDisplay.textContent = `${Math.round((zoomPan?.getZoom() ?? 1) * 100)}%`;
  });

  // View > Zoom Reset
  const menuZoomReset = document.querySelector('[data-testid="menu-view"] .menu-item:nth-child(3)');
  menuZoomReset?.addEventListener('click', () => {
    zoomPan?.resetView();
    ui.zoomDisplay.textContent = '100%';
  });

  // View > Present
  const menuPresent = document.querySelector('[data-testid="menu-present"]');
  menuPresent?.addEventListener('click', () => {
    togglePresentationMode();
  });

  // ─── 13.5. Wire File > Export > SVG ─────────────────────────────────────
  const menuExportSvg = document.querySelector('[data-testid="menu-export-svg"]');
  menuExportSvg?.addEventListener('click', () => {
    if (!activeSession || activePages.length === 0) return;
    const pageIdx = activeEditorIdx ?? 0;
    // Use cached SVG from activePages for efficiency
    const page = activePages[pageIdx];
    if (!page) return;
    const svg = activeSession.getPage(page.pageId);
    if (!svg) return;
    const pageName = page.name ?? 'page';
    const safeName = pageName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    downloadSvg(svg, `diagram-${safeName}-${pageIdx + 1}.svg`);
  });

  // ─── 13.5. Wire File > Export > PNG ─────────────────────────────────────
  const menuExportPng = document.querySelector('[data-testid="menu-export-png"]');
  menuExportPng?.addEventListener('click', () => {
    if (!activeSession || activePages.length === 0) return;
    const pageIdx = activeEditorIdx ?? 0;
    const page = activePages[pageIdx];
    if (!page) return;
    const svg = activeSession.getPage(page.pageId);
    if (!svg) return;
    const pageName = page.name ?? 'page';
    const safeName = pageName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    rasterizeSvgToPng(svg, `diagram-${safeName}-${pageIdx + 1}.png`);
  });

  // ─── 13.5.1. Wire File > Export > PDF ───────────────────────────────────
  const menuExportPdf = document.querySelector('[data-testid="menu-export-pdf"]');
  menuExportPdf?.addEventListener('click', () => {
    window.print();
  });

  // ─── 13.5.2. Wire File > Export > HTML ──────────────────────────────────
  const menuExportHtml = document.querySelector('[data-testid="menu-export-html"]');
  menuExportHtml?.addEventListener('click', () => {
    if (!activeSession || activePages.length === 0) return;
    const pageIdx = activeEditorIdx ?? 0;
    const page = activePages[pageIdx];
    if (!page) return;
    const svg = activeSession.getPage(page.pageId);
    if (!svg) return;
    const pageName = page.name ?? 'page';
    const safeName = pageName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    downloadHtml(svg, `diagram-${safeName}-${pageIdx + 1}.html`);
  });

  // ─── 13.7. Wire Arrange > Z-order ─────────────────────────────────────────
  const menuBringFront = document.querySelector('[data-testid="menu-bring-front"]');
  menuBringFront?.addEventListener('click', () => {
    activeEditor?.bringToFront();
  });

  const menuSendBack = document.querySelector('[data-testid="menu-send-back"]');
  menuSendBack?.addEventListener('click', () => {
    activeEditor?.sendToBack();
  });

  const menuBringForward = document.querySelector('[data-testid="menu-bring-forward"]');
  menuBringForward?.addEventListener('click', () => {
    activeEditor?.bringForward();
  });

  const menuSendBackward = document.querySelector('[data-testid="menu-send-backward"]');
  menuSendBackward?.addEventListener('click', () => {
    activeEditor?.sendBackward();
  });

  // ─── 13.7.1. Wire Arrange > Align ────────────────────────────────────────
  const menuAlignLeft = document.querySelector('[data-testid="menu-align-left"]');
  menuAlignLeft?.addEventListener('click', () => {
    activeEditor?.alignSelection('left');
  });

  const menuAlignCenter = document.querySelector('[data-testid="menu-align-center"]');
  menuAlignCenter?.addEventListener('click', () => {
    activeEditor?.alignSelection('center-h');
  });

  const menuAlignRight = document.querySelector('[data-testid="menu-align-right"]');
  menuAlignRight?.addEventListener('click', () => {
    activeEditor?.alignSelection('right');
  });

  const menuAlignTop = document.querySelector('[data-testid="menu-align-top"]');
  menuAlignTop?.addEventListener('click', () => {
    activeEditor?.alignSelection('top');
  });

  const menuAlignMiddle = document.querySelector('[data-testid="menu-align-middle"]');
  menuAlignMiddle?.addEventListener('click', () => {
    activeEditor?.alignSelection('center-v');
  });

  const menuAlignBottom = document.querySelector('[data-testid="menu-align-bottom"]');
  menuAlignBottom?.addEventListener('click', () => {
    activeEditor?.alignSelection('bottom');
  });

  // ─── 13.7.2. Wire Arrange > Distribute ────────────────────────────────────
  const menuDistributeH = document.querySelector('[data-testid="menu-distribute-h"]');
  menuDistributeH?.addEventListener('click', () => {
    activeEditor?.distributeSelection('horizontal');
  });

  const menuDistributeV = document.querySelector('[data-testid="menu-distribute-v"]');
  menuDistributeV?.addEventListener('click', () => {
    activeEditor?.distributeSelection('vertical');
  });

  // ─── 13.7.3. Wire Arrange > Rotate ────────────────────────────────────────
  const menuRotateCw = document.querySelector('[data-testid="menu-rotate-cw"]');
  menuRotateCw?.addEventListener('click', () => {
    activeEditor?.rotateSelection(Math.PI / 2);
  });

  const menuRotateCcw = document.querySelector('[data-testid="menu-rotate-ccw"]');
  menuRotateCcw?.addEventListener('click', () => {
    activeEditor?.rotateSelection(-Math.PI / 2);
  });

  // ─── 13.7.4. Wire Arrange > Flip ─────────────────────────────────────────
  const menuFlipH = document.querySelector('[data-testid="menu-flip-h"]');
  menuFlipH?.addEventListener('click', () => {
    activeEditor?.flipSelection('horizontal');
  });

  const menuFlipV = document.querySelector('[data-testid="menu-flip-v"]');
  menuFlipV?.addEventListener('click', () => {
    activeEditor?.flipSelection('vertical');
  });

  // ─── 13.7.5. Wire Arrange > Group / Ungroup ─────────────────────────────────
  const menuGroup = document.querySelector('[data-testid="menu-group"]');
  menuGroup?.addEventListener('click', () => {
    activeEditor?.groupSelection();
  });

  const menuUngroup = document.querySelector('[data-testid="menu-ungroup"]');
  menuUngroup?.addEventListener('click', () => {
    activeEditor?.ungroupSelection();
  });

  // ─── 13.7.5. Wire Arrange > Layout ───────────────────────────────────────
  const menuLayoutTree = document.querySelector('[data-testid="menu-layout-tree"]');
  menuLayoutTree?.addEventListener('click', () => {
    activeEditor?.applyLayout('Tree', {});
  });

  const menuLayoutHierarchical = document.querySelector('[data-testid="menu-layout-hierarchical"]');
  menuLayoutHierarchical?.addEventListener('click', () => {
    activeEditor?.applyLayout('Hierarchical', {});
  });

  const menuLayoutOrganic = document.querySelector('[data-testid="menu-layout-organic"]');
  menuLayoutOrganic?.addEventListener('click', () => {
    activeEditor?.applyLayout('Organic', {});
  });

  const menuLayoutCircular = document.querySelector('[data-testid="menu-layout-circular"]');
  menuLayoutCircular?.addEventListener('click', () => {
    activeEditor?.applyLayout('Circular', {});
  });

  const menuLayoutGrid = document.querySelector('[data-testid="menu-layout-grid"]');
  menuLayoutGrid?.addEventListener('click', () => {
    activeEditor?.applyLayout('Grid', {});
  });

  // ─── 13.7.6. Wire Arrange > Re-route Edges ───────────────────────────────────
  const menuRerouteEdges = document.querySelector('[data-testid="menu-reroute-edges"]');
  menuRerouteEdges?.addEventListener('click', () => {
    activeEditor?.routeAllEdges();
  });

  // ─── 13.8. Wire Help > Keyboard Shortcuts ───────────────────────────────────
  const menuShortcuts = document.querySelector('[data-testid="menu-shortcuts"]');
  menuShortcuts?.addEventListener('click', () => {
    toggleShortcutsOverlay();
  });

  // ─── 13.8.1. Wire Help > About ───────────────────────────────────────────
  const menuAbout = document.querySelector('[data-testid="menu-about"]');
  menuAbout?.addEventListener('click', () => {
    showAboutDialog();
  });

  // ─── 13.6. Wire File > Properties ────────────────────────────────────────
  // Build the dialog with initial (empty) metadata; fields are populated from
  // the engine each time the dialog opens via showDialogWithMetadata.
  const propsDialog = buildPropertiesDialog(EMPTY_METADATA, (info) => {
    if (activeSession) {
      const r = activeSession.setMetadata(info);
      if (!r.ok) showError(ui.errorBanner, ui.errorMessage, r.error);
      else activeEditor?.refreshScene();
    }
  });

  /**
   * Update the properties dialog fields with fresh metadata from the engine
   * and then show the dialog.
   */
  function showPropsDialog(): void {
    if (activeSession) {
      const meta = activeSession.getMetadata();
      if (meta.ok && meta.value) {
        // Update the input fields with current engine metadata
        const titleInput = propsDialog.querySelector('#prop-title') as HTMLInputElement;
        const authorInput = propsDialog.querySelector('#prop-author') as HTMLInputElement;
        const descInput = propsDialog.querySelector('#prop-description') as HTMLTextAreaElement;
        if (titleInput) titleInput.value = meta.value.title ?? '';
        if (authorInput) authorInput.value = meta.value.author ?? '';
        if (descInput) descInput.value = meta.value.description ?? '';
      }
    }
    showDialog(propsDialog);
  }

  const menuProps = document.querySelector('[data-testid="menu-properties"]');
  menuProps?.addEventListener('click', showPropsDialog);

  // ─── 14. Listen for zoom changes from wheel events ────────────────────────
  ui.canvasContainer.addEventListener('zoomchange', ((e: CustomEvent) => {
    ui.zoomDisplay.textContent = `${Math.round(e.detail.zoom * 100)}%`;
    ui.hud.setZoom(e.detail.zoom * 100);
    // Update grid scale CSS variable for zoom-responsive grid
    ui.canvasContainer.style.setProperty('--zoom', String(e.detail.zoom));
  }) as (_e: Event) => void);

  // ─── 14.5. Wire HUD zoom reset button ─────────────────────────────────────
  ui.hud.onZoomClick(() => {
    zoomPan?.resetView();
    ui.zoomDisplay.textContent = '100%';
    ui.hud.setZoom(100);
    ui.canvasContainer.style.setProperty('--zoom', '1');
  });

  // ─── 14.6. Initialize HUD page info ────────────────────────────────────────
  ui.hud.setPage(1, 1);
  ui.hud.setMode('Edit');
  ui.canvasContainer.style.setProperty('--zoom', '1');

  // ─── 15. Expose debug API for E2E tests ───────────────────────────────────
  (window as unknown as Record<string, unknown>).__hodeiDebug = {
    getScene: () => {
      const result = activeEditor?.getSceneCache();
      if (!result || !result.ok) return [];
      return result.value;
    },
    getSession: () => activeSession,
    manualSaveVersion,
  };

  // ─── 15.5. Expose manual save for console-driven testing ────────────────────
  (window as unknown as Record<string, unknown>).__hodei = {
    manualSaveVersion,
  };
}

bootstrap().catch((e) => {
  console.error('Bootstrap failed:', e);
  const root = document.getElementById('app');
  if (root) {
    root.textContent = 'Fatal: ' + (e instanceof Error ? e.message : String(e));
  }
});
