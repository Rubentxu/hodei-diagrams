/**
 * main.ts — Bootstrap and wire the 5-zone web shell UI.
 *
 * Coordinates: engine session, editor, zoom/pan, inspector, menu actions.
 */

import { snapToZoom } from './viewport.js';
import { FrameBudgetMonitor } from './frame-budget-monitor.js';
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
import { WorkbenchController } from './workbench-controller.js';
import { DrawerController } from './responsive-drawer.js';
import { buildDockLayers } from './dock-layers.js';
import { runMathOverlay } from './math/math-overlay.js';
import { openMathInsertDialog } from './math/math-dialog.js';
import { showEditXmlDialog } from './edit-xml-dialog.js';
import './styles.css';

let activeSession: DiagramEngineSession | null = null;
let activePages: PageRender[] = [];
let activeEditor: Editor | null = null;
let activeEditorIdx = 0;
let zoomPan: ReturnType<typeof setupZoomPan> | null = null;

// ─── R2b: interaction-state lifecycle (dispose on beforeunload) ────────────────
let unsubInteractionState: (() => void) | null = null;
// Last-seen 3-field interaction state from editor seam (for grid toggle augmentation)
let lastInteractionState: { isDragging: boolean; snapEnabled: boolean; isEditing: boolean } | null = null;

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
let frameBudgetMonitor: FrameBudgetMonitor | null = null;

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
let copySvgTimer: ReturnType<typeof setTimeout> | null = null;

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
        <div style="margin-top: 4px; font-size: 11px; color: var(--text-dim);">— Edit —</div>
        <div><kbd style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">Ctrl+G</kbd> Group</div>
        <div><kbd style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">Ctrl+Shift+U</kbd> Ungroup</div>
        <div><kbd style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">Ctrl+Shift+G</kbd> Toggle snap</div>
        <div style="font-size: 11px; color: var(--text-dim);">Grid: View &gt; Grid (no shortcut)</div>
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
  // The manager must exist BEFORE buildEmptyUi so the sidebar can subscribe to it.
  // Default libraries are loaded after the HUD exists (see startAutoLoad below),
  // otherwise loading callbacks would fire before the indicator can render.
  const stencilManager = new StencilLibraryManager(activeSession, wasmResult.value, (loading: boolean) => {
    hud?.setLoading({ wasm: false, stencil: loading });
  });

  // ─── 4. Build Inspector (needed before UI for update wiring) ──────────────
  // Wire the inspector's style change events to the editor. The editor is
  // created later (in the bootstrap), so we capture activeEditor via a
  // closure that reads the module-level variable on each call.
  const inspector = buildInspector(activeSession, (changes) => {
    if (changes.fillColor !== undefined) {
      activeEditor?.applyFillToSelection(changes.fillColor);
    }
    if (changes.strokeColor !== undefined) {
      activeEditor?.applyStrokeToSelection(changes.strokeColor);
    }
  });

  // ─── 4.5. Create zoom/pan controls early so rail callbacks can reference them ─
  // We create a minimal container just for zoom/pan, then rebuild properly in buildEmptyUi
  const zoomPanPlaceholder = document.createElement('div');
  const viewerPlaceholder = document.createElement('div');
  // Initial zoom/pan setup — recreated with real DOM after buildEmptyUi
  zoomPan = setupZoomPan(zoomPanPlaceholder, viewerPlaceholder);

  // ─── 5. Build 5-zone UI with inspector ────────────────────────────────────
  // R1b: WorkbenchController instance for dock-mode state
  const workbenchController = new WorkbenchController();

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
    onDockMode: (mode) => {
      workbenchController.setState({ dockMode: mode });
    },
  }, stencilManager);

  // R1b: Subscribe sidebar dock mode to controller state
  workbenchController.subscribe((state) => {
    ui.setDockMode(state.dockMode);
  });

  // R2c: Mirror hudDensity state to data-hud-density attribute on #app.
  // CSS rules drive individual item visibility — no JS toggles per item.
  const appRoot = document.getElementById('app');
  workbenchController.subscribe((state) => {
    appRoot?.setAttribute('data-hud-density', state.hudDensity);
  });

  // R3: Wire responsive drawers via single-line lambda (used twice)
  const makeDrawer = (drawer: 'inspector' | 'sidebar', drawerEl: HTMLElement, triggerEl: HTMLElement | null, closeBtn: HTMLButtonElement) =>
    (c => (triggerEl?.addEventListener('click', () => c.toggle()), c))(new DrawerController({ drawer, drawerEl, triggerEl, closeBtn, overlayEl: ui.drawerOverlay }));

  makeDrawer('inspector', inspector.container, ui.inspectorToggleBtn, inspector.closeBtn);
  makeDrawer('sidebar', ui.sidebar, ui.sidebarToggleBtn, ui.sidebarCollapseBtn);

  // R1b: Wire buildDockLayers into .dock-mode-layers container
  const dockLayersContainer = ui.sidebar.querySelector('.dock-mode-layers') as HTMLElement | null;
  if (dockLayersContainer && activeSession) {
    const dockLayers = buildDockLayers(dockLayersContainer, activeSession, {
      onToggleVisibility: (layerIdx, layerVersion, currentVisible) => {
        if (!activeSession) return;
        const cmd = JSON.stringify({
          SetLayerVisible: { layer_id: { idx: layerIdx, version: layerVersion }, visible: !currentVisible },
        });
        const r = activeSession.executeCommand(cmd);
        if (!r.ok) { ui.setDiagnostics('error', `Set visibility failed: ${r.error}`); }
        else { activeEditor?.refreshScene(); dockLayers.refresh(); }
      },
      onToggleLock: (layerIdx, layerVersion, currentLocked) => {
        if (!activeSession) return;
        const cmd = JSON.stringify({
          SetLayerLocked: { layer_id: { idx: layerIdx, version: layerVersion }, locked: !currentLocked },
        });
        const r = activeSession.executeCommand(cmd);
        if (!r.ok) { ui.setDiagnostics('error', `Set lock failed: ${r.error}`); }
        else { activeEditor?.refreshScene(); dockLayers.refresh(); }
      },
      onRename: (layerIdx, layerVersion, currentName) => {
        if (!activeSession) return;
        const layerItem = document.querySelector(`[data-testid="layer-item-${currentName}"]`) as HTMLElement | null;
        if (!layerItem) return;
        const nameSpan = layerItem.querySelector('.layer-name') as HTMLElement | null;
        if (!nameSpan) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('data-testid', `layer-rename-input-${currentName}`);
        input.value = currentName;
        input.className = 'layer-rename-input';
        input.style.cssText = 'width: 80px; font-size: 12px; padding: 2px 4px; border: 1px solid var(--border); border-radius: 3px;';
        nameSpan.replaceWith(input);
        input.focus();
        input.select();
        const finishRename = (confirm: boolean) => {
          const newName = input.value.trim();
          input.remove();
          if (!confirm || newName === currentName || newName === '') {
            const restoredSpan = document.createElement('span');
            restoredSpan.className = 'layer-name';
            restoredSpan.textContent = currentName;
            layerItem.insertBefore(restoredSpan, layerItem.firstChild);
            return;
          }
          const cmd = JSON.stringify({
            RenameLayer: { layer_id: { idx: layerIdx, version: layerVersion }, name: { text: newName } },
          });
          const r = activeSession!.executeCommand(cmd);
          if (!r.ok) { ui.setDiagnostics('error', `Rename failed: ${r.error}`); }
          else { activeEditor?.refreshScene(); dockLayers.refresh(); }
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.stopPropagation(); finishRename(true); }
          else if (e.key === 'Escape') { e.stopPropagation(); finishRename(false); }
        });
        input.addEventListener('blur', () => finishRename(true));
        input.addEventListener('click', (e) => e.stopPropagation());
      },
      onRemove: (layerIdx, layerVersion) => {
        if (!activeSession) return;
        const cmd = JSON.stringify({ RemoveLayer: { layer_id: { idx: layerIdx, version: layerVersion } } });
        const r = activeSession.executeCommand(cmd);
        if (!r.ok) { ui.setDiagnostics('error', `Remove layer failed: ${r.error}`); }
        else { activeEditor?.refreshScene(); dockLayers.refresh(); }
      },
      onMoveToLayer: (layerIdx, layerVersion) => {
        if (!activeSession || !activeEditor) return;
        const pageIdx = activeEditorIdx ?? 0;
        const cmd = JSON.stringify({ MoveToLayer: { layer_id: { idx: layerIdx, version: layerVersion } } });
        const r = activeSession.executeCommand(cmd);
        if (!r.ok) { ui.setDiagnostics('error', `Move to layer failed: ${r.error}`); }
        else { activeEditor.refreshScene(); dockLayers.refresh(); }
        void pageIdx;
      },
    });

    // Refresh layers when dock mode switches to 'layers'
    workbenchController.subscribe((state) => {
      if (state.dockMode === 'layers') dockLayers.refresh();
    });
  }

  // R2a: Initialize app attributes at startup
  const appEl = document.getElementById('app');
  appEl?.setAttribute('data-context-toolbar', 'inactive');
  // R2c: Initialize data-hud-density from controller's initial state (compact)
  appEl?.setAttribute('data-hud-density', workbenchController.getState().hudDensity);

  // Make hud accessible to module-level save functions
  hud = ui.hud;

  // Initialize frame budget monitor (created early so menu toggle can reference it)
  frameBudgetMonitor = new FrameBudgetMonitor();

  // Start loading stencil libraries — HUD is now ready to receive callbacks
  stencilManager.startAutoLoad();

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
    // R2c: Push gridVisible to controller using last-seen interaction state from
    // the editor seam (or defaults if no interaction has happened yet). This keeps
    // the editor API limited to its disposable listener and avoids reading fields
    // that don't belong on the controller's read-only WorkbenchState.
    const last = lastInteractionState ?? { isDragging: false, snapEnabled: false, isEditing: false };
    workbenchController.updateHudDensity({
      isDragging: last.isDragging,
      snapEnabled: last.snapEnabled,
      gridVisible: visible,
      isEditing: last.isEditing,
    });
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
      // Toggle the checkmark immediately using the value we just applied
      // (the engine state change is already committed; no need to read back).
      mathModeMenuItem?.classList.toggle('has-checkmark', !currentlyEnabled);
      refreshMathOverlay();
      requestAnimationFrame(syncMathModeCheckmark);
    }
  });
  syncMathModeCheckmark();

  // ─── Extras > Edit XML ─────────────────────────────────────────────────────
  // Opens a dialog with the current .drawio XML, lets the user edit it,
  // and re-imports the result back into the engine on Apply.
  const editXmlMenuItem = document.getElementById('menu-item-edit-xml');
  editXmlMenuItem?.addEventListener('click', () => {
    if (!activeSession) return;
    // Try the import-context export first (preserves original .drawio IDs).
    // Fall back to the fresh-engine export when the engine was bootstrapped
    // programmatically (no import yet) — it synthesizes IDs from the model.
    let result = activeSession.exportDrawio();
    if (!result.ok) {
      result = activeSession.exportDrawioFresh();
    }
    if (!result.ok) {
      showError(ui.errorBanner, ui.errorMessage, 'Edit XML failed: ' + result.error);
      return;
    }
    showEditXmlDialog(result.value, (newXml: string) => {
      if (!activeSession) return false;
      const r = activeSession.importDrawio(newXml);
      if (!r.ok) {
        showError(ui.errorBanner, ui.errorMessage, 'Edit XML failed: ' + r.error);
        return false;
      }
      handleImport(newXml);
      return true;
    });
  });

  // ─── 13.6. Wire Extras > Copy as SVG ─────────────────────────────────────
  const menuCopySvg = document.querySelector('[data-testid="menu-copy-svg"]');
  menuCopySvg?.addEventListener('click', async () => {
    if (!activeSession || activePages.length === 0) return;
    const pageIdx = activeEditorIdx ?? 0;
    const page = activePages[pageIdx];
    if (!page) return;
    const svg = activeSession.getPage(page.pageId);
    if (!svg) return;
    try {
      await navigator.clipboard.writeText(svg);
      const original = menuCopySvg.textContent;
      menuCopySvg.textContent = 'Copied!';
      if (copySvgTimer !== null) clearTimeout(copySvgTimer);
      copySvgTimer = setTimeout(() => { menuCopySvg.textContent = original; }, 1500);
    } catch (err) {
      console.warn('[copy-svg] Clipboard write failed:', err);
    }
  });

  // ─── 13.6.2. Wire Extras > Performance Monitor toggle ─────────────────────
  // REQ-AFBUDGET-003: "?perf=1 or the development toggle MUST enable monitoring"
  // Either ?perf=1 OR the menu toggle alone is sufficient — no AND logic.
  const menuPerfToggle = document.querySelector('[data-testid="menu-perf-toggle"]');
  let perfToggleActive = false;

  function startPerfMonitor(): void {
    if (!frameBudgetMonitor || frameBudgetMonitor.isRunning()) return;
    frameBudgetMonitor.start((stats) => {
      hud?.setFrameStats?.(stats);
    });
    // Show FPS and memory HUD items
    const fpsItem = hud?.container.querySelector('[data-testid="hud-fps"]') as HTMLElement | null;
    const memoryItem = hud?.container.querySelector('[data-testid="hud-memory"]') as HTMLElement | null;
    if (fpsItem) fpsItem.style.display = 'flex';
    if (memoryItem) memoryItem.style.display = 'flex';
  }

  function stopPerfMonitor(): void {
    if (!frameBudgetMonitor) return;
    frameBudgetMonitor.stop();
    // Hide FPS and memory HUD items
    const fpsItem = hud?.container.querySelector('[data-testid="hud-fps"]') as HTMLElement | null;
    const memoryItem = hud?.container.querySelector('[data-testid="hud-memory"]') as HTMLElement | null;
    if (fpsItem) fpsItem.style.display = 'none';
    if (memoryItem) memoryItem.style.display = 'none';
  }

  // Auto-start if ?perf=1 is in URL (REQ-AFBUDGET-003: EITHER is sufficient)
  const perfFlag = new URLSearchParams(window.location.search).get('perf') === '1';
  if (perfFlag) {
    perfToggleActive = true;
    // Defer start until HUD is ready (after bootstrap)
    requestAnimationFrame(() => {
      startPerfMonitor();
      startPerfPolling();
      menuPerfToggle?.classList.add('has-checkmark');
    });
  }

  menuPerfToggle?.addEventListener('click', () => {
    // Toggle works regardless of ?perf=1 — either activation path is sufficient
    perfToggleActive = !perfToggleActive;
    if (perfToggleActive) {
      startPerfMonitor();
      startPerfPolling();
      menuPerfToggle.classList.add('has-checkmark');
    } else {
      stopPerfMonitor();
      stopPerfPolling();
      menuPerfToggle.classList.remove('has-checkmark');
    }
  });

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

  // ─── 14.7. App-level keyboard shortcuts ─────────────────────────────────
  // Cycle 16: previously duplicated editor-level shortcuts (Ctrl+Z/Y) here,
  // which caused a single keypress to fire undoCmd twice (editor.ts also
  // registers a keydown handler on document at attach() time).
  // IP-D (ADR-0080): Ctrl+G grid toggle moved to View > Grid menu only;
  // Ctrl+G now means "Group" in the editor. Ctrl+Shift+P is presentation mode.
  // Escape from presentation. Editor-level shortcuts live in editor.ts.
  document.addEventListener('keydown', (e: KeyboardEvent) => {
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
  // R1c: Mount into dock-history container so it shows when dock mode is 'history'
  ui.dockHistory.appendChild(historyPanelContainer);

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
      // Update HUD geometry (R2c: W×H of first selected shape)
      let geoW = 0, geoH = 0;
      if (ids.length === 1) {
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
                if (bounds?.size) {
                  geoW = bounds.size['width'] ?? 0;
                  geoH = bounds.size['height'] ?? 0;
                }
              }
            }
          }
        }
      }
      ui.hud.setGeometry(geoW, geoH);
      // Update toolbar buttons
      ui.toolbar.update(ids);
    }
    // Update zoom display
    ui.zoomDisplay.textContent = `${Math.round((zoomPan?.getZoom() ?? 1) * 100)}%`;
    // Update HUD zoom
    ui.hud.setZoom((zoomPan?.getZoom() ?? 1) * 100);

    // R2a: Update contextual toolbar via controller
    workbenchController.updateContextualToolbar({
      hasSelection: ids.length > 0,
      isDragging: false,
      snapEnabled: false,
      gridVisible: ui.canvasContainer.classList.contains('show-grid'),
      isEditing: false,
    });
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
      onDuplicate: handlePageDuplicate,
      onMove: handlePageMove,
    });
    ui.toolbar.setMode('Edit');
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
    zoomPan?.viewport,
  );
  activeEditor.attach();

  /** Apply a zoom delta and snap to the nearest canonical zoom point. */
  const applyZoomStep = (delta: number): void => {
    const target = (zoomPan?.getZoom() ?? 1) + delta;
    const snapped = snapToZoom(target);
    zoomPan?.setZoom(snapped);
    const pct = Math.round(snapped * 100);
    ui.hud.setZoom(pct);
    ui.zoomDisplay.textContent = `${pct}%`;
  };

  activeEditor.setZoomCallbacks({
    zoomIn: () => applyZoomStep(+0.2),
    zoomOut: () => applyZoomStep(-0.2),
    resetZoom: () => {
      zoomPan?.resetView();
      ui.hud.setZoom(100);
      ui.zoomDisplay.textContent = '100%';
    },
    pan: (dx, dy) => zoomPan?.panBy(dx, dy),
  });

  // Zoom menu item wiring (View > Zoom In/Out/Reset)
  const zoomInMenuItem = document.getElementById('menu-item-zoom-in');
  const zoomOutMenuItem = document.getElementById('menu-item-zoom-out');
  const zoomResetMenuItem = document.getElementById('menu-item-zoom-reset');
  zoomInMenuItem?.addEventListener('click', () => applyZoomStep(+0.2));
  zoomOutMenuItem?.addEventListener('click', () => applyZoomStep(-0.2));
  zoomResetMenuItem?.addEventListener('click', () => {
    zoomPan?.resetView();
    ui.hud.setZoom(100);
    ui.zoomDisplay.textContent = '100%';
  });

  activeEditor.onCursorMove((p) => ui.hud.setCursor(p.x, p.y));

  // R2b: Wire editor interaction state → controller HUD density
  unsubInteractionState = activeEditor.onInteractionStateChange((state) => {
    lastInteractionState = { isDragging: state.isDragging, snapEnabled: state.snapEnabled, isEditing: state.isEditing };
    workbenchController.updateHudDensity({
      isDragging: state.isDragging,
      snapEnabled: state.snapEnabled,
      gridVisible: ui.canvasContainer.classList.contains('show-grid'),
      isEditing: state.isEditing,
    });
  });

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
  // IP-C modifier routing for dynamic stencils:
  //   Shift (no selection) → insert with white fill (SHAPE-008, ignore default style)
  //   Shift (one selected) → delete + insert at same position (SHAPE-010, replace selected)
  //   Alt (no selection)  → insert at bottom-left (SHAPE-009)
  ui.sidebar.addEventListener('stencil-shape-activate', (e) => {
    if (!activeSession || !activeEditor) return;
    const event = e as CustomEvent<{
      library: string;
      name: string;
      shiftKey: boolean;
      altKey: boolean;
    }>;
    const { library, name, shiftKey, altKey } = event.detail;
    const pageId = activeEditor.getActivePageSlotId() ?? undefined;
    const selectionSize = activeEditor.selection.length;

    // Default position: center of viewport
    const DEFAULT_X = 400;
    const DEFAULT_Y = 300;

    let x = DEFAULT_X;
    let y = DEFAULT_Y;
    let styleOverride: { fill?: string; stroke?: string } | undefined;

    if (altKey && !shiftKey) {
      // SHAPE-009: insert at bottom-left of diagram
      const bbox = activeEditor.getDiagramBBox();
      if (bbox) {
        x = bbox.minX;
        y = bbox.maxY;
      } else {
        x = 40;
        y = 40;
      }
    } else if (shiftKey && !altKey) {
      // SHAPE-008: insert with white fill and no stroke (ignore stencil default)
      styleOverride = { fill: '#ffffff', stroke: 'none' };
    }

    const result = activeSession.addStencilVertex(library, name, x, y, pageId,
      styleOverride ? { styleOverride } : undefined);
    if (result.ok) {
      // SHAPE-010: if one shape was selected, delete it (replaces the shape)
      if (shiftKey && !altKey && selectionSize === 1) {
        activeEditor.deleteSelection();
      }
      activeEditor.refreshScene();
      activeEditor.triggerReplay();
    }
  });

  // Re-render when session state changes. Cycle 16: page-level mutations
  // (page add/delete, undo/redo of such commands) need page-tab refresh
  // in addition to the scene refresh the editor does. The cost is one
  // decodeSceneBuffer per state change — bounded, since state changes
  // are user-initiated.
  activeSession.setOnStateChange(() => {
    activeEditor?.triggerReplay();
    onStateChange();
    refreshPageTabs();
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
      ui.setDiagnosticsStatus('error', 'Import failed');
      return;
    }

    const renderResult = activeSession.renderAllPages();
    if (!renderResult.ok) {
      showError(ui.errorBanner, ui.errorMessage, 'Render failed: ' + renderResult.error);
      ui.setDiagnostics('error', 'Render failed: ' + renderResult.error);
      ui.setDiagnosticsStatus('error', 'Render failed');
      return;
    }

    // Successful import — show clean diagnostics badge
    ui.setDiagnostics('clean');
    ui.setDiagnosticsStatus('clean');

    activePages = renderResult.value;
    // Point the editor at page 0 BEFORE refreshScene so the cache
    // reads the imported state. Then mount the SVG and refresh the
    // math overlay — the overlay reads math_enabled from the scene
    // cache, so the cache must be fresh before the overlay runs.
    activeEditorIdx = 0;
    if (activeEditor) {
      activeEditor.activePageIdx = 0;
      activeEditor.refreshScene();
    }
    if (activePages.length > 0) {
      // Compute initial viewport from container size for culling.
      // This viewport will be used for the initial render so the DOM only
      // contains shapes within the visible area (REQ-CULL-008).
      const containerRect = ui.canvasContainer.getBoundingClientRect();
      const viewport = { x: 0, y: 0, w: containerRect.width, h: containerRect.height };
      const pageIdx = Number(activePages[0]!.pageId);
      // renderPage with viewport gives culled render for the active page.
      // renderAllPages still caches full renders for all pages (for tabs).
      const culledResult = activeSession.renderPage(pageIdx, viewport);
      if (culledResult.ok) {
        mountSvg(ui.viewer, culledResult.value);
      } else {
        // Fallback: mount full render if culled render fails
        mountSvg(ui.viewer, activePages[0]!.svg);
      }
      // Apply viewport so the viewBox reflects the current pan/zoom state.
      // After this, zoomPan is initialized so applyViewport will work.
      zoomPan?.applyViewport();
      refreshMathOverlay();
      populatePageTabs(ui.pageTabContainer, activePages, 0, {
        onSelect: handlePageSelect,
        onRename: handlePageRename,
        onDelete: handlePageDelete,
        onDuplicate: handlePageDuplicate,
        onMove: handlePageMove,
      });
    }

    ui.toolbar.setMode('Edit');
    ui.saveButton.disabled = false;
    updateUndoRedoButtons(ui.undoButton, ui.redoButton);

    // Keep the default viewport (panX=0, panY=0, zoom=1.0) after import.
    // Users can zoom/pan to navigate to content — fitToView with wrong bounds
    // is worse than no fit-to-view at all.
    ui.zoomDisplay.textContent = `${Math.round((zoomPan?.getZoom() ?? 1) * 100)}%`;
    ui.hud.setZoom((zoomPan?.getZoom() ?? 1) * 100);
    ui.canvasContainer.style.setProperty('--zoom', String(zoomPan?.getZoom() ?? 1));
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
        // Reset zoom on page switch
        zoomPan?.resetView();
        ui.zoomDisplay.textContent = '100%';
        ui.hud.setZoom(100);
        ui.canvasContainer.style.setProperty('--zoom', '1');
        // Re-render page tabs so the active class updates
        refreshPageTabs();
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
      onDuplicate: handlePageDuplicate,
      onMove: handlePageMove,
    });
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
    // Look up the full slotmap id (idx, version) for this page. The bare
    // idx is not enough — RemovePage requires a PageId that exists in the
    // engine's slotmap, and versions can be non-zero after deletes.
    const target = activePages.find((p) => p.pageId === pageIdNum);
    if (!target) return;
    const cmd = JSON.stringify({
      RemovePage: {
        id: target.slotmapId,
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
    zoomPan?.resetView();
    ui.zoomDisplay.textContent = '100%';
    ui.hud.setZoom(100);
    ui.canvasContainer.style.setProperty('--zoom', '1');
  }

  /** IP-D: Duplicate the current page. Wraps the editor's duplicateActivePage. */
  function handlePageDuplicate(pageIdNum: number): void {
    if (!activeEditor) return;
    const targetIdx = activePages.findIndex((p) => p.pageId === (pageIdNum as PageToken));
    if (targetIdx >= 0) {
      activeEditorIdx = targetIdx;
      activeEditor.activePageIdx = targetIdx;
      activeEditor.refreshScene();
    }
    const ok = activeEditor.duplicateActivePage();
    if (!ok) {
      showError(ui.errorBanner, ui.errorMessage, 'Duplicate page failed');
      return;
    }
    // The editor switched to the new page; refresh the tab bar.
    refreshPageTabs();
    if (activeEditor.activePageIdx !== undefined) {
      activeEditorIdx = activeEditor.activePageIdx;
    }
    const newPage = activePages[activeEditorIdx];
    if (newPage) {
      const svg = activeSession?.getPage(newPage.pageId);
      if (svg) mountSvg(ui.viewer, svg);
      refreshMathOverlay();
    }
  }

  /** Move the selected page left or right using the engine reorder command. */
  function handlePageMove(pageIdNum: number, direction: 'left' | 'right'): void {
    if (!activeEditor) return;
    const targetIdx = activePages.findIndex((p) => p.pageId === (pageIdNum as PageToken));
    if (targetIdx >= 0) {
      activeEditorIdx = targetIdx;
      activeEditor.activePageIdx = targetIdx;
      activeEditor.refreshScene();
    }
    const ok = activeEditor.moveActivePage(direction);
    if (!ok) {
      showError(ui.errorBanner, ui.errorMessage, 'Move page failed');
      return;
    }
    activeEditorIdx = activeEditor.activePageIdx;
    refreshPageTabs();
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
  // Cycle 16: page-tab refresh is handled by setOnStateChange, so the
  // button handlers only need to invoke undo/redo and let the state
  // change propagate. updateUndoRedoButtons is called inside
  // onStateChange, so it's covered there too.
  ui.undoButton.addEventListener('click', () => {
    activeEditor?.undoCmd();
  });
  ui.redoButton.addEventListener('click', () => {
    activeEditor?.redoCmd();
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
  // File > Save → version-store save + download
  const menuSave = document.querySelector('[data-testid="menu-save"]');
  menuSave?.addEventListener('click', async () => {
    if (!activeSession) return;
    // Save to version store (updates HUD to "Saved")
    await manualSaveVersion();
    // Also download as .drawio (preserves existing toolbar behaviour)
    const result = activeSession.exportDrawio();
    if (result.ok) {
      downloadDrawio(result.value, 'diagram.drawio');
    } else {
      showError(ui.errorBanner, ui.errorMessage, 'Export failed: ' + result.error);
    }
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
  // Apply a layout via menu. Errors must be surfaced via diagnostics, otherwise
  // failures (e.g. invalid layout kind, no-vertices, was deserialization) get
  // silently swallowed. Bug uncovered in v0.78 review of LayoutConfig serde gap.
  function runLayout(kind: string, config: object = {}): void {
    const result = activeEditor?.applyLayout(kind, config);
    if (!result) return;
    if (!result.ok) {
      ui.setDiagnostics('error', `Layout (${kind}) failed: ${result.error}`);
      ui.setDiagnosticsStatus('error', 'Layout failed');
    } else {
      ui.setDiagnostics('clean');
      ui.setDiagnosticsStatus('clean');
    }
  }

  const menuLayoutTree = document.querySelector('[data-testid="menu-layout-tree"]');
  menuLayoutTree?.addEventListener('click', () => {
    runLayout('Tree', {});
  });

  const menuLayoutHierarchical = document.querySelector('[data-testid="menu-layout-hierarchical"]');
  menuLayoutHierarchical?.addEventListener('click', () => {
    runLayout('Hierarchical', {});
  });

  const menuLayoutOrganic = document.querySelector('[data-testid="menu-layout-organic"]');
  menuLayoutOrganic?.addEventListener('click', () => {
    runLayout('Organic', {});
  });

  const menuLayoutCircular = document.querySelector('[data-testid="menu-layout-circular"]');
  menuLayoutCircular?.addEventListener('click', () => {
    runLayout('Circular', {});
  });

  const menuLayoutGrid = document.querySelector('[data-testid="menu-layout-grid"]');
  menuLayoutGrid?.addEventListener('click', () => {
    runLayout('Grid', {});
  });

  // ─── 13.7.6. Wire Arrange > Re-route Edges ───────────────────────────────────
  const menuRerouteEdges = document.querySelector('[data-testid="menu-reroute-edges"]');
  menuRerouteEdges?.addEventListener('click', () => {
    // ADR-0078: routeAllEdges returns Result — surface failures via diagnostics.
    if (!activeEditor) return;
    const result = activeEditor.routeAllEdges();
    if (!result.ok) {
      ui.setDiagnostics('error', `Re-route Edges failed: ${result.error}`);
      ui.setDiagnosticsStatus('error', 'Re-route failed');
    } else {
      ui.setDiagnostics('clean');
      ui.setDiagnosticsStatus('clean');
    }
  });

  // ─── 13.9. Wire Layers menu (IP-F PR5) ─────────────────────────────────────
  // Show/hide layers panel when Layers menu is toggled
  const menuLayers = document.querySelector('[data-testid="menu-layers"]') as HTMLDetailsElement | null;
  const layersPanel = ui.sidebar.querySelector('[data-testid="layers-panel"]') as HTMLElement | null;
  const layersListEl = layersPanel?.querySelector('.layers-list') as HTMLElement | null;
  const addLayerBtn = layersPanel?.querySelector('[data-testid="layers-add-layer"]') as HTMLButtonElement | null;

  function populateLayersPanel(): void {
    if (!layersPanel || !layersListEl || !activeSession) return;
    layersPanel.hidden = false;
    layersListEl.innerHTML = '';

    const pageIdx = activeEditorIdx ?? 0;
    const result = activeSession.getLayers(pageIdx);
    if (!result.ok) return;

    const { layers } = result.value;
    for (const layer of layers) {
      const layerName = layer.name ?? '(default)';
      const item = document.createElement('div');
      item.className = 'layer-item';
      item.setAttribute('data-testid', `layer-item-${layerName}`);

      // Name
      const nameSpan = document.createElement('span');
      nameSpan.className = 'layer-name';
      nameSpan.textContent = layerName;
      item.appendChild(nameSpan);

      // Visibility toggle
      const visBtn = document.createElement('button');
      visBtn.className = 'layer-toggle';
      visBtn.setAttribute('data-testid', `layer-visibility-${layerName}`);
      visBtn.setAttribute('data-state', layer.visible ? 'visible' : 'hidden');
      visBtn.textContent = layer.visible ? '👁' : '🙈';
      visBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
      visBtn.addEventListener('click', () => {
        handleLayerToggleVisibility(layer.idx, layer.version, layer.visible);
      });
      item.appendChild(visBtn);

      // Lock toggle
      const lockBtn = document.createElement('button');
      lockBtn.className = 'layer-toggle';
      lockBtn.setAttribute('data-testid', `layer-lock-${layerName}`);
      lockBtn.setAttribute('data-state', layer.locked ? 'locked' : 'unlocked');
      lockBtn.textContent = layer.locked ? '🔒' : '🔓';
      lockBtn.title = layer.locked ? 'Unlock layer' : 'Lock layer';
      lockBtn.addEventListener('click', () => {
        handleLayerToggleLock(layer.idx, layer.version, layer.locked);
      });
      item.appendChild(lockBtn);

      // Rename button
      const renameBtn = document.createElement('button');
      renameBtn.className = 'layer-toggle';
      renameBtn.setAttribute('data-testid', `layer-rename-${layerName}`);
      renameBtn.textContent = '✏️';
      renameBtn.title = 'Rename layer';
      renameBtn.addEventListener('click', () => {
        handleLayerRename(layer.idx, layer.version, layerName);
      });
      item.appendChild(renameBtn);

      // Remove button (only for non-default layers)
      if (layer.name !== null) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'layer-toggle';
        removeBtn.setAttribute('data-testid', `layer-remove-${layerName}`);
        removeBtn.textContent = '🗑';
        removeBtn.title = 'Remove layer';
        removeBtn.addEventListener('click', () => {
          handleLayerRemove(layer.idx, layer.version);
        });
        item.appendChild(removeBtn);
      }

      // Move-to-layer: clicking the layer row (not a button) moves selected shapes here
      item.style.cursor = 'pointer';
      item.addEventListener('click', (e) => {
        // Don't trigger move if clicking a button inside the row
        if ((e.target as HTMLElement).tagName === 'BUTTON') return;
        handleMoveToLayer(layer.idx, layer.version);
      });

      layersListEl.appendChild(item);
    }
  }

  menuLayers?.addEventListener('toggle', () => {
    if (menuLayers?.open) {
      populateLayersPanel();
    }
  });

  // Add Layer button in layers panel
  addLayerBtn?.addEventListener('click', () => {
    if (!activeSession || !activeEditor) return;
    const pageIdx = activeEditorIdx ?? 0;
    const pageSlotId = activePages[pageIdx]?.slotmapId;
    if (!pageSlotId) return;
    const cmd = JSON.stringify({
      AddLayer: { page_id: pageSlotId, name: { text: 'New Layer' } },
    });
    const r = activeSession.executeCommand(cmd);
    if (!r.ok) {
      ui.setDiagnostics('error', `Add Layer failed: ${r.error}`);
    } else {
      activeEditor.refreshScene();
      populateLayersPanel();
    }
  });

  // ─── Layer interaction handlers (populated per layer item) ─────────────────

  /**
   * Rename a layer: show inline input, then dispatch RenameLayer command.
   */
  function handleLayerRename(layerIdx: number, layerVersion: number, currentName: string): void {
    if (!activeSession) return;

    // Create inline input for renaming
    const layerItem = document.querySelector(`[data-testid="layer-item-${currentName}"]`) as HTMLElement | null;
    if (!layerItem) return;

    // Replace the name span with an input
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('data-testid', `layer-rename-input-${currentName}`);
    input.value = currentName;
    input.className = 'layer-rename-input';
    input.style.cssText = 'width: 80px; font-size: 12px; padding: 2px 4px; border: 1px solid var(--border); border-radius: 3px;';

    // Replace name span with input
    const nameSpan = layerItem.querySelector('.layer-name') as HTMLElement | null;
    if (nameSpan) {
      nameSpan.replaceWith(input);
      input.focus();
      input.select();

      // Capture activeSession in a local to satisfy TypeScript's closure analysis
      const session = activeSession;

      const finishRename = (confirm: boolean) => {
        const newName = input.value.trim();
        input.remove();
        if (!confirm || newName === currentName || newName === '') {
          // Restore original name span
          const restoredSpan = document.createElement('span');
          restoredSpan.className = 'layer-name';
          restoredSpan.textContent = currentName;
          layerItem.insertBefore(restoredSpan, layerItem.firstChild);
          return;
        }
        const cmd = JSON.stringify({
          RenameLayer: { layer_id: { idx: layerIdx, version: layerVersion }, name: { text: newName } },
        });
        const r = session.executeCommand(cmd);
        if (!r.ok) {
          ui.setDiagnostics('error', `Rename failed: ${r.error}`);
        } else {
          activeEditor?.refreshScene();
          populateLayersPanel();
        }
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.stopPropagation();
          finishRename(true);
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          finishRename(false);
        }
      });
      input.addEventListener('blur', () => finishRename(true));
      input.addEventListener('click', (e) => e.stopPropagation());
    }
  }

  /**
   * Remove a non-default layer via RemoveLayer command.
   */
  function handleLayerRemove(layerIdx: number, layerVersion: number): void {
    if (!activeSession) return;
    const cmd = JSON.stringify({
      RemoveLayer: { layer_id: { idx: layerIdx, version: layerVersion } },
    });
    const r = activeSession.executeCommand(cmd);
    if (!r.ok) {
      ui.setDiagnostics('error', `Remove layer failed: ${r.error}`);
    } else {
      activeEditor?.refreshScene();
      populateLayersPanel();
    }
  }

  /**
   * Toggle layer visibility via SetLayerVisible command.
   */
  function handleLayerToggleVisibility(layerIdx: number, layerVersion: number, currentlyVisible: boolean): void {
    if (!activeSession) return;
    const cmd = JSON.stringify({
      SetLayerVisible: { layer_id: { idx: layerIdx, version: layerVersion }, visible: !currentlyVisible },
    });
    const r = activeSession.executeCommand(cmd);
    if (!r.ok) {
      ui.setDiagnostics('error', `Set visibility failed: ${r.error}`);
    } else {
      activeEditor?.refreshScene();
      populateLayersPanel();
    }
  }

  /**
   * Toggle layer locked state via SetLayerLocked command.
   */
  function handleLayerToggleLock(layerIdx: number, layerVersion: number, currentlyLocked: boolean): void {
    if (!activeSession) return;
    const cmd = JSON.stringify({
      SetLayerLocked: { layer_id: { idx: layerIdx, version: layerVersion }, locked: !currentlyLocked },
    });
    const r = activeSession.executeCommand(cmd);
    if (!r.ok) {
      ui.setDiagnostics('error', `Set locked failed: ${r.error}`);
    } else {
      activeEditor?.refreshScene();
      populateLayersPanel();
    }
  }

  /**
   * Move selected shapes to a target layer via MoveShapeToLayer command.
   */
  function handleMoveToLayer(targetLayerIdx: number, targetLayerVersion: number): void {
    if (!activeSession || !activeEditor) return;
    const selected = activeEditor.selection;
    if (selected.length === 0) return;
    const cmd = JSON.stringify({
      MoveShapeToLayer: {
        vertex_ids: selected.map((id) => ({ idx: id.idx, version: id.version })),
        edge_ids: [],
        layer_id: { idx: targetLayerIdx, version: targetLayerVersion },
      },
    });
    const r = activeSession.executeCommand(cmd);
    if (!r.ok) {
      ui.setDiagnostics('error', `Move to layer failed: ${r.error}`);
    } else {
      activeEditor.refreshScene();
      populateLayersPanel();
    }
  }

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

  // ─── 14.6. Initialize HUD mode indicator ───────────────────────────────────
  ui.toolbar.setMode('Edit');
  ui.canvasContainer.style.setProperty('--zoom', '1');

  // ─── 15. Expose debug API for E2E tests ───────────────────────────────────
  // frameBudgetMonitor is already initialized at module level (line ~62)
  // and created early in bootstrap (line ~653) so menu toggle can reference it.

  // ─── 15.1. Performance monitoring requires BOTH ?perf=1 AND menu toggle ─────
  const urlParams = new URLSearchParams(window.location.search);
  const perfEnabled = urlParams.get('perf') === '1';
  let perfIntervalId: ReturnType<typeof setInterval> | null = null;

  // Store whether menu toggle has been activated (requires ?perf=1)
  let perfMenuActive = false;

  // Start memory polling when menu toggle is activated
  function startPerfPolling(): void {
    if (perfIntervalId !== null) return; // already polling
    perfIntervalId = setInterval(() => {
      const memStats = {
        wasmBytes: activeSession?.getWasmMemoryBytes() ?? 0,
        sceneBytes: activeSession?.getSceneBufferBytes() ?? null,
        svgBytes: activeSession?.getSvgBufferBytes() ?? null,
      };
      hud?.setMemoryStats?.(memStats);
    }, 1000);
  }

  function stopPerfPolling(): void {
    if (perfIntervalId !== null) {
      clearInterval(perfIntervalId);
      perfIntervalId = null;
    }
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (perfIntervalId !== null) clearInterval(perfIntervalId);
    frameBudgetMonitor?.stop();
  });

  (window as unknown as Record<string, unknown>).__hodeiDebug = {
    getScene: () => {
      const result = activeEditor?.getSceneCache();
      if (!result || !result.ok) return [];
      return result.value;
    },
    /** Fetch a fresh scene directly from the WASM engine, bypassing
     *  the editor's in-memory `#sceneCache`. Useful for diagnostics
     *  where the cache and the live engine may diverge. */
    fetchSceneFresh: () => {
      if (!activeSession) return null;
      const r = activeSession.fetchSceneJson();
      if (!r.ok) return null;
      try {
        return JSON.parse(r.value);
      } catch {
        return null;
      }
    },
    getSession: () => activeSession,
    /**
     * Expose the active editor for E2E tests that need to invoke methods
     * and assert on the `Result`. Avoid using this from production code —
     * tests only.
     */
    getEditor: () => activeEditor ?? null,
    /** Add a Rectangle vertex at exact SVG (doc-space) coordinates. Used by
     *  E2E tests to set up fixtures with known bounds without going through
     *  the rect-tool palette (whose CSS-to-doc conversion depends on the
     *  viewBox fit-to-view transform). */
    addRectAt: (x: number, y: number, width: number, height: number) => {
      if (!activeSession) return null;
      // Look up the active page id from the scene cache. The vertex MUST
      // belong to a page for the scene builder to project it.
      const cache = activeEditor?.getSceneCache?.();
      if (!cache || !cache.ok || cache.value.length === 0) return null;
      const activePageSlot = cache.value[0]!.page_id;
      const w = width > 0 ? width : 80;
      const h = height > 0 ? height : 40;
      const r = activeSession.executeCommand(
        JSON.stringify({
          AddVertex: {
            vertex: {
              geometry: {
                x,
                y,
                width: w,
                height: h,
                relative: false,
                rotation: 0,
                flip_h: false,
                flip_v: false,
              },
              label: null,
              style_id: null,
              parent: null,
              page_id: { idx: activePageSlot.idx, version: activePageSlot.version },
              layer_id: null,
              z_order: 0,
              locked: false,
              visible: true,
            },
          },
        }),
      );
      if (!r.ok) return null;
      activeEditor?.refreshScene?.();
      return true;
    },
    /**
     * Add a Group cell at exact SVG (doc-space) coordinates. Used by
     * E2E tests to set up a Group fixture for handle rendering tests.
     * The Group is created empty (no children) with clip=true. */
    addGroupAt: (x: number, y: number, width: number, height: number) => {
      if (!activeSession) return null;
      const cache = activeEditor?.getSceneCache?.();
      if (!cache || !cache.ok || cache.value.length === 0) return null;
      const activePageSlot = cache.value[0]!.page_id;
      const w = width > 0 ? width : 200;
      const h = height > 0 ? height : 150;
      const r = activeSession.executeCommand(
        JSON.stringify({
          AddGroup: {
            group: {
              geometry: {
                x,
                y,
                width: w,
                height: h,
                relative: false,
                rotation: 0,
                flip_h: false,
                flip_v: false,
              },
              label: null,
              style_id: null,
              parent: null,
              page_id: { idx: activePageSlot.idx, version: activePageSlot.version },
              layer_id: null,
              clip: true,
              locked: false,
              visible: true,
              z_order: 0,
              children: [],
            },
          },
        }),
      );
      if (!r.ok) return null;
      activeEditor?.refreshScene?.();
      return true;
    },
    /**
     * Build an edge between two new rect vertices with explicit bend waypoints.
     * Used by bend-drag.spec.ts and EDGE-014 to set up a known bent-edge fixture
     * without going through the connector tool (which depends on hit-testing).
     */
    addBentEdgeAt: (
      x1: number, y1: number, x2: number, y2: number,
      bends: Array<{ x: number; y: number }>,
    ) => {
      if (!activeSession || !activeEditor) return null;
      const cache = activeEditor.getSceneCache?.();
      if (!cache || !cache.ok || cache.value.length === 0) return null;
      // 1. Create source + target rects via existing addRectAt
      const w = 60, h = 40;
      (window as any).__hodeiDebug.addRectAt(x1, y1, w, h);
      (window as any).__hodeiDebug.addRectAt(x2, y2, w, h);
      activeEditor.refreshScene?.();
      // 2. Read back the two new vertex ids from the scene
      const fresh = activeEditor.getSceneCache?.();
      if (!fresh || !fresh.ok) return null;
      const shapes = fresh.value[0]!.display_list.filter((e: unknown) => {
        const rec = e as Record<string, unknown>;
        return 'Rect' in rec;
      });
      if (shapes.length < 2) return null;
      const lastTwo = shapes.slice(-2);
      const fromId = (lastTwo[0] as any).Rect.id;
      const toId = (lastTwo[1] as any).Rect.id;
      // 3. Connect with a straight edge
      const r = activeSession.connectVertices(fromId, toId, 'straight');
      if (!r.ok) return null;
      const edgeId = r.value;
      // 4. Insert each bend at segmentIndex = i (grows as list expands)
      for (let i = 0; i < bends.length; i++) {
        const b = bends[i]!;
        const br = activeSession.insertBend(edgeId, i, b.x, b.y);
        if (!br.ok) return null;
      }
      activeEditor.refreshScene?.();
      return { edgeId, fromId, toId };
    },
    getFrameStats: () => frameBudgetMonitor?.getStats() ?? { fps: 0, frameMs: 0 },
    hideFrameStats: () => hud?.hideFrameStats?.(),
    showFrameStats: () => hud?.showFrameStats?.(),
    getWasmMemoryBytes: () => activeSession?.getWasmMemoryBytes() ?? 0,
    getSceneBufferBytes: () => activeSession?.getSceneBufferBytes() ?? null,
    getSvgBufferBytes: () => activeSession?.getSvgBufferBytes() ?? null,
    frameBudgetMonitor,
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

// R2b: Dispose interaction-state subscription on page unload
window.addEventListener('beforeunload', () => {
  unsubInteractionState?.();
});
