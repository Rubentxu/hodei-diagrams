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
import type { PageToken, PageRender } from './types.js';
import './styles.css';

let activeSession: DiagramEngineSession | null = null;
let activePages: PageRender[] = [];

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) {
    document.body.textContent = 'Fatal: #app element not found';
    return;
  }

  const ui = buildEmptyUi(root);

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
  });

  wirePageSelect(ui.pageSelect, (pageIdNum) => {
    if (!activeSession || activePages.length === 0) return;
    const token = pageIdNum as PageToken;
    const svg = activeSession.getPage(token);
    if (svg) {
      mountSvg(ui.viewer, svg);
      // Update active index
      const idx = activePages.findIndex((p) => p.pageId === token);
      if (idx >= 0) {
        populatePageSelect(ui.pageSelect, activePages, idx);
      }
    }
  });

  wireDismiss(ui.dismissButton, () => {
    hideError(ui.errorBanner);
  });
}

bootstrap().catch((e) => {
  console.error('Bootstrap failed:', e);
  const root = document.getElementById('app');
  if (root) {
    root.textContent = 'Fatal: ' + (e instanceof Error ? e.message : String(e));
  }
});
