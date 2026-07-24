/**
 * hud.ts — Zone 3.5: Status Strip / HUD
 *
 * 28px strip between canvas and bottom bar showing:
 * - Selection info (shape type + dimensions)
 * - Page info (Page X/Y)
 * - Zoom level (clickable to reset)
 * - Mode indicator (Edit / Read Only / Present)
 *
 * Monospace font, subtle text, minimal visual weight.
 */

import type { FrameStats } from './frame-budget-monitor.js';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'auto-saved';
export type LoadingState = { wasm: boolean; stencil: boolean };

export interface MemoryStats {
  wasmBytes: number;
  sceneBytes: number | null;
  svgBytes: number | null;
}

export interface HudControls {
  container: HTMLElement;
  setSelection: (_label: string) => void;
  setZoom: (_percent: number) => void;
  setMode: (_mode: 'Edit' | 'Read Only' | 'Present') => void;
  onZoomClick: (_handler: () => void) => void;
  setSnap: (_enabled: boolean) => void;
  setGrid: (_visible: boolean) => void;
  setCursor: (_x: number, _y: number) => void;
  setSelectionCount: (_n: number) => void;
  setSaveStatus: (_status: SaveStatus) => void;
  setLoading: (_state: LoadingState) => void;
  setGeometry: (_w: number, _h: number) => void;
  setFrameStats?: (s: FrameStats) => void;
  setMemoryStats?: (s: MemoryStats) => void;
  hideFrameStats?: () => void;
  showFrameStats?: () => void;
}

export function buildHud(): HudControls {
  const container = document.createElement('div');
  container.className = 'hud hud-weighted';
  container.setAttribute('data-testid', 'hud');

  // ─── Selection info ────────────────────────────────────────────────────────
  const selItem = document.createElement('div');
  selItem.className = 'hud-item hud-primary';
  selItem.setAttribute('data-hud-density-item', 'default');

  const selLabel = document.createElement('span');
  selLabel.className = 'hud-label';
  selLabel.textContent = 'Selection:';

  const selValue = document.createElement('span');
  selValue.className = 'hud-value';
  selValue.setAttribute('data-testid', 'hud-selection');
  selValue.textContent = 'Nothing selected';

  selItem.appendChild(selLabel);
  selItem.appendChild(selValue);
  container.appendChild(selItem);

  // ─── Loading indicator (ephemeral) ─────────────────────────────────────────
  const loadingItem = document.createElement('div');
  loadingItem.className = 'hud-item hud-loading';
  loadingItem.setAttribute('data-hud-density-item', 'contextual');
  loadingItem.setAttribute('aria-live', 'polite');
  loadingItem.setAttribute('data-testid', 'hud-loading');
  loadingItem.style.display = 'none';

  const loadingLabel = document.createElement('span');
  loadingLabel.className = 'hud-label';
  loadingLabel.textContent = 'Loading:';

  const loadingSpinner = document.createElement('span');
  loadingSpinner.className = 'hud-spinner';
  loadingSpinner.setAttribute('aria-hidden', 'true');

  const loadingValue = document.createElement('span');
  loadingValue.className = 'hud-value';

  loadingItem.appendChild(loadingLabel);
  loadingItem.appendChild(loadingSpinner);
  loadingItem.appendChild(loadingValue);
  container.appendChild(loadingItem);

  // ─── Snap indicator ────────────────────────────────────────────────────────
  const snapItem = document.createElement('div');
  snapItem.className = 'hud-item hud-snap';
  snapItem.setAttribute('data-hud-density-item', 'default');

  const snapLabel = document.createElement('span');
  snapLabel.className = 'hud-label';
  snapLabel.textContent = 'Snap:';

  const snapValue = document.createElement('span');
  snapValue.className = 'hud-value';
  snapValue.setAttribute('data-testid', 'hud-snap');
  snapValue.textContent = 'Off';

  snapItem.appendChild(snapLabel);
  snapItem.appendChild(snapValue);
  container.appendChild(snapItem);

  // ─── Grid indicator ───────────────────────────────────────────────────────
  const gridItem = document.createElement('div');
  gridItem.className = 'hud-item hud-grid';
  gridItem.setAttribute('data-hud-density-item', 'default');

  const gridLabel = document.createElement('span');
  gridLabel.className = 'hud-label';
  gridLabel.textContent = 'Grid:';

  const gridValue = document.createElement('span');
  gridValue.className = 'hud-value';
  gridValue.setAttribute('data-testid', 'hud-grid');
  gridValue.textContent = 'Off';

  gridItem.appendChild(gridLabel);
  gridItem.appendChild(gridValue);
  container.appendChild(gridItem);

  // ─── Cursor position ──────────────────────────────────────────────────────
  const cursorItem = document.createElement('div');
  cursorItem.className = 'hud-item hud-cursor';
  cursorItem.setAttribute('data-hud-density-item', 'default');

  const cursorLabel = document.createElement('span');
  cursorLabel.className = 'hud-label';
  cursorLabel.textContent = 'XY:';

  const cursorXValue = document.createElement('span');
  cursorXValue.className = 'hud-value';
  cursorXValue.setAttribute('data-testid', 'hud-cursor');
  cursorXValue.textContent = '0,0';

  cursorItem.appendChild(cursorLabel);
  cursorItem.appendChild(cursorXValue);
  container.appendChild(cursorItem);

  // ─── Separator ────────────────────────────────────────────────────────────
  const sep1 = document.createElement('div');
  sep1.className = 'hud-sep';
  container.appendChild(sep1);

  // ─── Geometry (R2c: shows W × H of selected shape) ─────────────────────────
  const geometryItem = document.createElement('div');
  geometryItem.className = 'hud-item hud-geometry';
  geometryItem.setAttribute('data-hud-density-item', 'default');

  const geometryLabel = document.createElement('span');
  geometryLabel.className = 'hud-label';
  geometryLabel.textContent = 'Size:';

  const geometryValue = document.createElement('span');
  geometryValue.className = 'hud-value';
  geometryValue.setAttribute('data-testid', 'hud-geometry');
  geometryValue.textContent = '—';

  geometryItem.appendChild(geometryLabel);
  geometryItem.appendChild(geometryValue);
  container.appendChild(geometryItem);

  // ─── Separator ────────────────────────────────────────────────────────────
  const sep2 = document.createElement('div');
  sep2.className = 'hud-sep';
  container.appendChild(sep2);

  // ─── Zoom ─────────────────────────────────────────────────────────────────
  const zoomItem = document.createElement('div');
  zoomItem.className = 'hud-item';
  zoomItem.setAttribute('data-hud-density-item', 'default');

  const zoomLabel = document.createElement('span');
  zoomLabel.className = 'hud-label';
  zoomLabel.textContent = 'Zoom:';

  const zoomBtn = document.createElement('button');
  zoomBtn.className = 'hud-zoom-btn';
  zoomBtn.setAttribute('data-testid', 'hud-zoom');
  zoomBtn.textContent = '100%';
  zoomBtn.title = 'Click to reset zoom';

  zoomItem.appendChild(zoomLabel);
  zoomItem.appendChild(zoomBtn);
  container.appendChild(zoomItem);

  // ─── Spacer ───────────────────────────────────────────────────────────────
  const spacer = document.createElement('div');
  spacer.className = 'hud-spacer';
  container.appendChild(spacer);

  // ─── Save-status indicator (persistent, right side) ─────────────────────────
  const saveStatusItem = document.createElement('div');
  saveStatusItem.className = 'hud-item hud-save-status';
  saveStatusItem.setAttribute('data-hud-density-item', 'default');

  const saveStatusLabel = document.createElement('span');
  saveStatusLabel.className = 'hud-label';
  saveStatusLabel.textContent = 'Save:';

  const saveStatusValue = document.createElement('span');
  saveStatusValue.className = 'hud-value';
  saveStatusValue.setAttribute('data-testid', 'hud-save-status');
  saveStatusValue.textContent = 'Saved';

  saveStatusItem.appendChild(saveStatusLabel);
  saveStatusItem.appendChild(saveStatusValue);
  container.appendChild(saveStatusItem);

  // ─── Frame stats (hidden by default, shown via setFrameStats) ─────────────────
  const fpsItem = document.createElement('div');
  fpsItem.className = 'hud-item hud-fps';
  fpsItem.setAttribute('data-hud-density-item', 'contextual');
  fpsItem.setAttribute('data-testid', 'hud-fps');
  fpsItem.style.display = 'none';

  const fpsValue = document.createElement('span');
  fpsValue.className = 'hud-value';
  fpsValue.textContent = '';

  fpsItem.appendChild(fpsValue);
  container.appendChild(fpsItem);

  // ─── Memory stats (hidden by default, shown via setMemoryStats) ──────────────
  const memoryItem = document.createElement('div');
  memoryItem.className = 'hud-item hud-memory';
  memoryItem.setAttribute('data-hud-density-item', 'contextual');
  memoryItem.setAttribute('data-testid', 'hud-memory');
  memoryItem.style.display = 'none';

  const memoryValue = document.createElement('span');
  memoryValue.className = 'hud-value';
  memoryValue.textContent = '';

  memoryItem.appendChild(memoryValue);
  container.appendChild(memoryItem);

  let zoomClickHandler: (() => void) | null = null;

  zoomBtn.addEventListener('click', () => {
    zoomClickHandler?.();
  });

  return {
    container,
    setSelection: (label: string) => {
      selValue.textContent = label;
      // Dim the whole selection item when nothing is selected
      if (label === 'Nothing selected') {
        selItem.classList.add('hud-item--empty');
      } else {
        selItem.classList.remove('hud-item--empty');
      }
    },
    setZoom: (percent: number) => {
      zoomBtn.textContent = `${Math.round(percent)}%`;
    },
    setMode: (_mode: 'Edit' | 'Read Only' | 'Present') => {
      // R2c: mode indicator moved to contextual toolbar (navbar.ts).
      // Kept as no-op here for backward compatibility with existing callers.
    },
    onZoomClick: (handler: () => void) => {
      zoomClickHandler = handler;
    },
    setSnap: (enabled: boolean) => {
      snapValue.textContent = enabled ? 'On' : 'Off';
    },
    setGrid: (visible: boolean) => {
      gridValue.textContent = visible ? 'On' : 'Off';
    },
    setCursor: (x: number, y: number) => {
      cursorXValue.textContent = `${Math.round(x)},${Math.round(y)}`;
    },
    setSelectionCount: (_n: number) => {
      // Selection count is now reflected in the Selection label
      // ("Rect: 0:0 (3 selected)"); the HUD has no separate counter.
    },
    setSaveStatus: (status: SaveStatus) => {
      saveStatusItem.dataset['status'] = status;
      switch (status) {
        case 'saved':
          saveStatusValue.textContent = 'Saved';
          break;
        case 'unsaved':
          saveStatusValue.textContent = 'Unsaved changes';
          break;
        case 'saving':
          saveStatusValue.textContent = 'Saving...';
          break;
        case 'auto-saved':
          saveStatusValue.textContent = 'Auto-saved';
          break;
      }
    },
    setLoading: (state: LoadingState) => {
      const isLoading = state.wasm || state.stencil;
      loadingItem.style.display = isLoading ? '' : 'none';
      if (state.wasm) {
        loadingValue.textContent = 'Engine...';
      } else if (state.stencil) {
        loadingValue.textContent = 'Stencils...';
      } else {
        loadingValue.textContent = '';
      }
    },
    setGeometry: (w: number, h: number) => {
      if (w <= 0 || h <= 0) {
        geometryValue.textContent = '—';
      } else {
        geometryValue.textContent = `${Math.round(w)}×${Math.round(h)}`;
      }
    },
    setFrameStats: (stats: FrameStats) => {
      fpsValue.textContent = `${stats.fps.toFixed(0)} fps · ${stats.frameMs.toFixed(1)} ms`;
    },
    hideFrameStats: () => {
      fpsItem.style.display = 'none';
    },
    showFrameStats: () => {
      fpsItem.style.display = 'flex';
    },
    setMemoryStats: (stats: MemoryStats) => {
      const wasmMb = stats.wasmBytes / (1024 * 1024);
      const wasmLabel = wasmMb >= 1 ? `${wasmMb.toFixed(1)} MB` : `${(stats.wasmBytes / 1024).toFixed(0)} KB`;

      // Format scene bytes if available
      let sceneLabel = '—';
      if (stats.sceneBytes != null && stats.sceneBytes > 0) {
        const sceneKb = stats.sceneBytes / 1024;
        sceneLabel = sceneKb >= 1 ? `${sceneKb.toFixed(0)} KB` : `${stats.sceneBytes} B`;
      }

      // Format SVG bytes if available
      let svgLabel = '—';
      if (stats.svgBytes != null && stats.svgBytes > 0) {
        const svgKb = stats.svgBytes / 1024;
        svgLabel = svgKb >= 1 ? `${svgKb.toFixed(0)} KB` : `${stats.svgBytes} B`;
      }

      memoryValue.textContent = `WASM ${wasmLabel} · scene ${sceneLabel} · svg ${svgLabel}`;
      memoryItem.style.display = memoryItem.style.display === 'none' ? 'flex' : memoryItem.style.display;
    },
  };
}
