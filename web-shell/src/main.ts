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
  buildPropertiesDialog,
  showDialog,
} from './ui.js';
import { buildInspector } from './inspector.js';
import { Editor } from './editor.js';
import type { PageToken, PageRender, SlotmapId, ScenePage } from './types.js';
import { EMPTY_METADATA } from './types.js';
import './styles.css';

let activeSession: DiagramEngineSession | null = null;
let activePages: PageRender[] = [];
let activeEditor: Editor | null = null;
let activeEditorIdx = 0;

// ─── Grid overlay state ───────────────────────────────────────────────────────
const GRID_LS_KEY = 'hodei:grid-visible';

function isGridVisible(): boolean {
  try {
    return localStorage.getItem(GRID_LS_KEY) === 'true';
  } catch {
    return false;
  }
}

function setGridVisible(visible: boolean): void {
  try {
    localStorage.setItem(GRID_LS_KEY, String(visible));
  } catch {
    // localStorage may be unavailable
  }
}

// ─── Presentation mode state ──────────────────────────────────────────────────
let isPresentationMode = false;

function togglePresentationMode(): void {
  isPresentationMode = !isPresentationMode;
  document.body.classList.toggle('presentation-mode', isPresentationMode);
}

function exitPresentationMode(): void {
  if (isPresentationMode) {
    isPresentationMode = false;
    document.body.classList.remove('presentation-mode');
  }
}

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
            const shapeType = key === 'Rect' ? 'Rect' : key === 'RoundedRect' ? 'RoundedRect' : 'Ellipse';
            return `${shapeType} ${Math.round(w)}×${Math.round(h)}`;
          }
          const shapeType = key === 'Rect' ? 'Rect' : key === 'RoundedRect' ? 'RoundedRect' : 'Ellipse';
          return shapeType;
        }
      }
    }
  }
  return 'Shape selected';
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

  // ─── 3. Load stencil libraries ─────────────────────────────────────────────
  // Load the general.xml stencil library (Rectangle, Ellipse from draw.io)
  // This makes stencil:general:Rectangle and stencil:general:Ellipse available
  activeSession.loadStencilLibrary('general', '/fixtures/general.xml');

  // ─── 4. Build Inspector (needed before UI for update wiring) ──────────────
  const inspector = buildInspector(activeSession);

  // ─── 4.5. Create zoom/pan controls early so rail callbacks can reference them ─
  // We create a minimal container just for zoom/pan, then rebuild properly in buildEmptyUi
  const zoomPanPlaceholder = document.createElement('div');
  const viewerPlaceholder = document.createElement('div');
  // Store zoomPan in a mutable binding so rail callbacks can access it
  // eslint-disable-next-line prefer-const
  let zoomPan = setupZoomPan(zoomPanPlaceholder, viewerPlaceholder);

  // ─── 5. Build 5-zone UI with inspector ────────────────────────────────────
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
      activeEditor?.setActiveTool('connector');
    },
    onTextTool: () => {
      activeEditor?.enterLabelPlacement();
    },
    onZoomFit: () => {
      zoomPan.fitToView();
      ui.zoomDisplay.textContent = `${Math.round(zoomPan.getZoom() * 100)}%`;
      ui.hud.setZoom(zoomPan.getZoom() * 100);
      ui.canvasContainer.style.setProperty('--zoom', String(zoomPan.getZoom()));
    },
    onHelp: () => {
      // Toggle keyboard shortcuts overlay
      const existing = document.getElementById('keyboard-shortcuts-overlay');
      if (existing) {
        existing.remove();
      } else {
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
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
      }
    },
  });

  // ─── 4.5. Restore grid state ────────────────────────────────────────────────
  const gridMenuItem = document.getElementById('menu-item-grid');
  if (isGridVisible()) {
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
    // Escape to exit presentation mode
    if (e.key === 'Escape' && isPresentationMode) {
      exitPresentationMode();
    }
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
    }
    // Update zoom display
    ui.zoomDisplay.textContent = `${Math.round(zoomPan.getZoom() * 100)}%`;
    // Update HUD zoom
    ui.hud.setZoom(zoomPan.getZoom() * 100);
  };

  // Tool change → UI update (remove active-tool class)
  const onToolChange = (tool: import('./editor.js').ToolKind) => {
    if (tool === null) {
      ui.rectToolButton.classList.remove('active-tool');
      ui.ellipseToolButton.classList.remove('active-tool');
    }
  };

  // ─── 6. Import handler ────────────────────────────────────────────────────
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
        onToolChange,
        () => zoomPan.getZoom(),
      );
      activeEditor.attach();

      // Wire cursor position to HUD (rAF-throttled)
      activeEditor.onCursorMove((p) => ui.hud.setCursor(p.x, p.y));

      // ── Snap menu ───────────────────────────────────────────────────────────────
      const snapMenuItem = document.getElementById('menu-item-snap');
      function updateSnapCheckState(): void {
        if (!activeEditor) return;
        const snapEnabled = activeEditor.snapEnabled;
        snapMenuItem?.classList.toggle('has-checkmark', snapEnabled);
      }
      snapMenuItem?.addEventListener('click', () => {
        if (!activeEditor) return;
        activeEditor.toggleSnap();
        updateSnapCheckState();
        ui.hud.setSnap(activeEditor.snapEnabled);
      });

      // Wire inspector to editor for arrange operations
      inspector.setEditor(activeEditor);

      // ── Stencil drag-and-drop ─────────────────────────────────────────────
      // Wire dragstart on all stencil sidebar buttons
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
          // Map to ToolKind stencil variant
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

      // Wire canvas container for dragover (update preview) and drop (create shape)
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
      // ─────────────────────────────────────────────────────────────────────

      // Re-render when inspector modifies state via session.executeCommand
      activeSession.setOnStateChange(() => {
        activeEditor?.triggerReplay();
      });
    }

    // Ensure the editor's scene cache is refreshed after import
    // This is needed because attach() might have been called when the engine had no diagram
    activeEditor.refreshScene();

    activeEditorIdx = 0;
    if (activeEditor) activeEditor.activePageIdx = 0;

    // Update HUD page info
    ui.hud.setPage(1, activePages.length);
    ui.hud.setMode('Edit');

    // Enable Save button
    ui.saveButton.disabled = false;

    updateUndoRedoButtons(ui.undoButton, ui.redoButton);

    // Reset zoom on import
    zoomPan.resetView();
    ui.zoomDisplay.textContent = '100%';
    ui.hud.setZoom(100);
    ui.canvasContainer.style.setProperty('--zoom', '1');
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
        // Update HUD page info
        ui.hud.setPage(idx + 1, activePages.length);
        // Reset zoom on page switch
        zoomPan.resetView();
        ui.zoomDisplay.textContent = '100%';
        ui.hud.setZoom(100);
        ui.canvasContainer.style.setProperty('--zoom', '1');
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
  // All shape tool buttons share the same toggle pattern: click activates,
  // click again deactivates. The button visual class is synced to the active
  // tool so users always know which one is armed.
  type ShapeTool = 'rectangle' | 'rounded-rect' | 'ellipse' | 'diamond' | 'triangle' | 'hexagon' | 'cylinder' | 'cloud' | 'parallelogram' | 'trapezoid' | 'polygon' | 'rectangle-stencil' | 'ellipse-stencil' | 'diamond-stencil' | 'triangle-stencil' | 'hexagon-stencil' | 'cylinder-stencil' | 'cloud-stencil' | 'parallelogram-stencil' | 'trapezoid-stencil' | 'blockArrow-stencil';
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
    const safeName = pageName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    downloadSvg(svg, `diagram-${safeName}-${pageIdx + 1}.svg`);
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
  }) as EventListener);

  // ─── 14.5. Wire HUD zoom reset button ─────────────────────────────────────
  ui.hud.onZoomClick(() => {
    zoomPan.resetView();
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
  };
}

bootstrap().catch((e) => {
  console.error('Bootstrap failed:', e);
  const root = document.getElementById('app');
  if (root) {
    root.textContent = 'Fatal: ' + (e instanceof Error ? e.message : String(e));
  }
});
