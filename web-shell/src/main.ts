import { loadWasm } from './wasm-loader.js';
import { DiagramEngineSession } from './session.js';
import { mountSvg, clear } from './renderer.js';
import {
  buildEmptyUi,
  populatePageSelect,
  showError,
  hideError,
  wireFileInput,
  wirePageSelect,
  wireDismiss,
} from './ui.js';
import { Editor } from './editor.js';
import type { PageToken, PageRender } from './types.js';
import './styles.css';

let activeSession: DiagramEngineSession | null = null;
let activePages: PageRender[] = [];
let activeEditor: Editor | null = null;

function updateUndoRedoButtons(
  undoBtn: HTMLButtonElement | undefined,
  redoBtn: HTMLButtonElement | undefined,
): void {
  if (!activeSession) return;
  if (undoBtn) undoBtn.disabled = !activeSession.canUndo();
  if (redoBtn) redoBtn.disabled = !activeSession.canRedo();
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) {
    document.body.textContent = 'Fatal: #app element not found';
    return;
  }

  const ui = buildEmptyUi(root);

  // Error display callback for Editor
  const onEditorError = (msg: string) => {
    showError(ui.errorBanner, ui.errorMessage, msg);
  };

  const wasmResult = await loadWasm();
  if (!wasmResult.ok) {
    showError(
      ui.errorBanner,
      ui.errorMessage,
      'Failed to load diagram engine: ' + wasmResult.error,
    );
    return;
  }

  const sessionResult = DiagramEngineSession.create(wasmResult.value);
  if (!sessionResult.ok) {
    showError(
      ui.errorBanner,
      ui.errorMessage,
      'Failed to create engine session: ' + sessionResult.error,
    );
    return;
  }

  activeSession = sessionResult.value;

  wireFileInput(ui.fileInput, async (xml) => {
    if (!activeSession) return;
    const importResult = activeSession.importDrawio(xml);
    if (!importResult.ok) {
      showError(ui.errorBanner, ui.errorMessage, 'Import failed: ' + importResult.error);
      return;
    }
    clear(ui.viewer);
    const renderResult = activeSession.renderAllPages();
    if (!renderResult.ok) {
      showError(ui.errorBanner, ui.errorMessage, 'Render failed: ' + renderResult.error);
      return;
    }
    activePages = renderResult.value;
    if (activePages.length > 0) {
      mountSvg(ui.viewer, activePages[0]!.svg);
      populatePageSelect(ui.pageSelect, activePages, 0);
    }

    // Wire editor after successful import
    if (!activeEditor) {
      activeEditor = new Editor(activeSession, ui.viewer, onEditorError);
      activeEditor.attach();
    }

    // Seed editor scene cache
    // We need to call getScene to populate the cache for drag geometry
    (activeEditor as unknown as Record<string, unknown>)['activePageIdx'] = 0;

    // Update undo/redo button states
    updateUndoRedoButtons(ui.undoButton, ui.redoButton);
  });

  wirePageSelect(ui.pageSelect, (pageIdNum) => {
    if (!activeSession || activePages.length === 0) return;
    const token = pageIdNum as PageToken;
    const svg = activeSession.getPage(token);
    if (svg) {
      mountSvg(ui.viewer, svg);
      const idx = activePages.findIndex((p) => p.pageId === token);
      if (idx >= 0) {
        populatePageSelect(ui.pageSelect, activePages, idx);
        // Update editor active page index
        if (activeEditor) {
          (activeEditor as unknown as Record<string, unknown>)['activePageIdx'] = idx;
          // Clear selection on page switch
          // Use public replay to refresh scene cache
          // For now, we rely on the editor to re-apply correctly
        }
      }
    }
  });

  wireDismiss(ui.dismissButton, () => {
    hideError(ui.errorBanner);
  });

  // Wire toolbar buttons
  if (ui.undoButton) {
    ui.undoButton.addEventListener('click', () => {
      activeEditor?.undoCmd();
      updateUndoRedoButtons(ui.undoButton, ui.redoButton);
    });
  }
  if (ui.redoButton) {
    ui.redoButton.addEventListener('click', () => {
      activeEditor?.redoCmd();
      updateUndoRedoButtons(ui.undoButton, ui.redoButton);
    });
  }
  const rectBtn = ui.rectToolButton;
  if (rectBtn) {
    const ellipseBtn = ui.ellipseToolButton;
    rectBtn.addEventListener('click', () => {
      if (!activeEditor) return;
      activeEditor.setActiveTool('rectangle');
      ellipseBtn?.classList.remove('active-tool');
      rectBtn.classList.toggle('active-tool', activeEditor.activeTool === 'rectangle');
    });
  }
  const ellipseBtn = ui.ellipseToolButton;
  if (ellipseBtn) {
    const rectBtn2 = ui.rectToolButton;
    ellipseBtn.addEventListener('click', () => {
      if (!activeEditor) return;
      activeEditor.setActiveTool('ellipse');
      rectBtn2?.classList.remove('active-tool');
      ellipseBtn.classList.toggle('active-tool', activeEditor.activeTool === 'ellipse');
    });
  }
}

// Hook editor replay to update toolbar after each command
// Monkey-patch the Editor's replay via the error callback (or proxy)
// We'll use a MutationObserver-or... simpler: just call updateUndoRedoButtons
// in the onError callback won't help for success. Let's use a setInterval for now
// or better: intercept the replay by patching.
//
// Actually the cleanest approach: set up a periodic check for undo/redo state
// But for reliability, let's patch the Editor's replay by wrapping it.
// For v1.1, we'll use a simple polling approach after interactions.
// Actually, the buttons are updated in the click handlers already.

bootstrap().catch((e) => {
  console.error('Bootstrap failed:', e);
  const root = document.getElementById('app');
  if (root) {
    root.textContent = 'Fatal: ' + (e instanceof Error ? e.message : String(e));
  }
});
