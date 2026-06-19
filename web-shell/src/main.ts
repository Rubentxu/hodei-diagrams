/**
 * main.ts — Bootstrap and wire the 5-zone web shell UI.
 *
 * Coordinates: engine session, editor, zoom/pan, inspector, menu actions.
 */

import { loadWasm } from './wasm-loader.js';
import { DiagramEngineSession } from './session.js';
import { mountSvg, setupZoomPan } from './renderer.js';
import {
  buildEmptyUi,
  populatePageTabs,
  showError,
  hideError,
  wireFileInput,
  wireDismiss,
} from './ui.js';
import { buildInspector } from './inspector.js';
import { Editor } from './editor.js';
import type { PageToken, PageRender, SlotmapId } from './types.js';
import './styles.css';

let activeSession: DiagramEngineSession | null = null;
let activePages: PageRender[] = [];
let activeEditor: Editor | null = null;
let activeEditorIdx = 0;

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

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) {
    document.body.textContent = 'Fatal: #app element not found';
    return;
  }

  // ─── 1. WASM loading ──────────────────────────────────────────────────────
  const wasmResult = await loadWasm();
  if (!wasmResult.ok) {
    root.textContent = 'Failed to load diagram engine: ' + wasmResult.error;
    return;
  }

  // ─── 2. Engine session ────────────────────────────────────────────────────
  const sessionResult = DiagramEngineSession.create(wasmResult.value);
  if (!sessionResult.ok) {
    root.textContent = 'Failed to create engine session: ' + sessionResult.error;
    return;
  }

  activeSession = sessionResult.value;

  // ─── 3. Build Inspector (needed before UI for update wiring) ──────────────
  const inspector = buildInspector(activeSession);

  // ─── 4. Build 5-zone UI with inspector ────────────────────────────────────
  const ui = buildEmptyUi(root, inspector.container, {
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
      // Connector tool not yet implemented
    },
  });

  // ─── 5. Zoom/Pan on canvas container ──────────────────────────────────────
  const zoomPan = setupZoomPan(ui.canvasContainer, ui.viewer);

  // ─── 6. Editor ────────────────────────────────────────────────────────────
  const onEditorError = (msg: string) => {
    showError(ui.errorBanner, ui.errorMessage, msg);
  };

  const onStateChange = () => {
    updateUndoRedoButtons(ui.undoButton, ui.redoButton);
  };

  // Selection change → inspector update
  const onSelectionChange = (id: SlotmapId | null) => {
    // Update inspector with current selection and scene data
    if (activeEditor) {
      const scene = activeEditor.getSceneCache();
      const sceneData = scene.ok ? scene.value : [];
      inspector.update(id, sceneData, activeEditor.activePageIdx);
    }
    // Update zoom display
    ui.zoomDisplay.textContent = `${Math.round(zoomPan.getZoom() * 100)}%`;
  };

  // ─── 6. Import handler ────────────────────────────────────────────────────
  function handleImport(xml: string): void {
    if (!activeSession) return;
    const importResult = activeSession.importDrawio(xml);
    if (!importResult.ok) {
      showError(ui.errorBanner, ui.errorMessage, 'Import failed: ' + importResult.error);
      return;
    }

    const renderResult = activeSession.renderAllPages();
    if (!renderResult.ok) {
      showError(ui.errorBanner, ui.errorMessage, 'Render failed: ' + renderResult.error);
      return;
    }
    activePages = renderResult.value;
    if (activePages.length > 0) {
      mountSvg(ui.viewer, activePages[0]!.svg);
      populatePageTabs(ui.pageTabContainer, activePages, 0, handlePageSwitch);
    }

    // Wire editor after successful import
    if (!activeEditor) {
      activeEditor = new Editor(
        activeSession,
        ui.viewer,
        onEditorError,
        onStateChange,
        onSelectionChange,
        () => zoomPan.getZoom(),
      );
      activeEditor.attach();
    }

    activeEditorIdx = 0;
    if (activeEditor) activeEditor.activePageIdx = 0;

    // Enable Save button
    ui.saveButton.disabled = false;

    updateUndoRedoButtons(ui.undoButton, ui.redoButton);

    // Reset zoom on import
    zoomPan.resetView();
    ui.zoomDisplay.textContent = '100%';
  }

  // ─── 7. Page switch handler ───────────────────────────────────────────────
  function handlePageSwitch(pageIdNum: number): void {
    if (!activeSession || activePages.length === 0) return;
    const token = pageIdNum as PageToken;
    const svg = activeSession.getPage(token);
    if (svg) {
      mountSvg(ui.viewer, svg);
      const idx = activePages.findIndex((p) => p.pageId === token);
      if (idx >= 0) {
        populatePageTabs(ui.pageTabContainer, activePages, idx, handlePageSwitch);
        activeEditorIdx = idx;
        if (activeEditor) {
          activeEditor.activePageIdx = idx;
          // Refresh editor scene for new page
          activeEditor.refreshScene();
        }
        // Reset zoom on page switch
        zoomPan.resetView();
        ui.zoomDisplay.textContent = '100%';
      }
    }
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

  // ─── 12. Wire palette tools ───────────────────────────────────────────────
  const rectBtn = ui.rectToolButton;
  const ellipseBtn = ui.ellipseToolButton;

  rectBtn.addEventListener('click', () => {
    if (!activeEditor) return;
    if (activeEditor.activeTool === 'rectangle') {
      activeEditor.setActiveTool(null);
      rectBtn.classList.remove('active-tool');
      ellipseBtn.classList.remove('active-tool');
    } else {
      activeEditor.setActiveTool('rectangle');
      rectBtn.classList.add('active-tool');
      ellipseBtn.classList.remove('active-tool');
    }
  });

  ellipseBtn.addEventListener('click', () => {
    if (!activeEditor) return;
    if (activeEditor.activeTool === 'ellipse') {
      activeEditor.setActiveTool(null);
      ellipseBtn.classList.remove('active-tool');
      rectBtn.classList.remove('active-tool');
    } else {
      activeEditor.setActiveTool('ellipse');
      ellipseBtn.classList.add('active-tool');
      rectBtn.classList.remove('active-tool');
    }
  });

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

  // View > Zoom In
  const menuZoomIn = document.querySelector('[data-testid="menu-view"] .menu-item:nth-child(1)');
  menuZoomIn?.addEventListener('click', () => {
    zoomPan.setZoom(zoomPan.getZoom() + 0.2);
    ui.zoomDisplay.textContent = `${Math.round(zoomPan.getZoom() * 100)}%`;
  });

  // View > Zoom Out
  const menuZoomOut = document.querySelector('[data-testid="menu-view"] .menu-item:nth-child(2)');
  menuZoomOut?.addEventListener('click', () => {
    zoomPan.setZoom(zoomPan.getZoom() - 0.2);
    ui.zoomDisplay.textContent = `${Math.round(zoomPan.getZoom() * 100)}%`;
  });

  // View > Zoom Reset
  const menuZoomReset = document.querySelector('[data-testid="menu-view"] .menu-item:nth-child(3)');
  menuZoomReset?.addEventListener('click', () => {
    zoomPan.resetView();
    ui.zoomDisplay.textContent = '100%';
  });

  // ─── 14. Listen for zoom changes from wheel events ────────────────────────
  ui.canvasContainer.addEventListener('zoomchange', ((e: CustomEvent) => {
    ui.zoomDisplay.textContent = `${Math.round(e.detail.zoom * 100)}%`;
  }) as EventListener);

  // ─── 15. Expose debug API for E2E tests ───────────────────────────────────
  (window as unknown as Record<string, unknown>).__hodeiDebug = {
    getScene: () => {
      const result = activeEditor?.getSceneCache();
      if (!result || !result.ok) return [];
      return result.value;
    },
    getSession: () => activeSession,
  };
}

bootstrap().catch((e) => {
  console.error('Bootstrap failed:', e);
  const root = document.getElementById('app');
  if (root) {
    root.textContent = 'Fatal: ' + (e instanceof Error ? e.message : String(e));
  }
});
