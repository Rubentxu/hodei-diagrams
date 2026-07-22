/**
 * hud.ts — Zone 3.5: Status Strip / HUD (R2)
 *
 * 28px strip between canvas and bottom bar showing:
 * - Selection info (shape type + dimensions) — DEFAULT tier
 * - Zoom level (clickable to reset) — DEFAULT tier
 * - Save status — DEFAULT tier
 * - Cursor, snap, grid, geometry — CONTEXTUAL tier (shown when density=full)
 *
 * R2 changes: hud-page removed (redundant with page-tabs cluster),
 * hud-mode relocated to contextual toolbar, hud-geometry added as contextual.
 */

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'auto-saved';
export type LoadingState = { wasm: boolean; stencil: boolean };

export interface HudControls {
  container: HTMLElement;
  setSelection: (_label: string) => void;
  setPage: (_current: number, _total: number) => void; // no-op: page info now in page-tabs cluster
  setZoom: (_percent: number) => void;
  setMode: (_mode: 'Edit' | 'Read Only' | 'Present') => void; // no-op: mode now in contextual toolbar
  onZoomClick: (_handler: () => void) => void;
  setSnap: (_enabled: boolean) => void;
  setGrid: (_visible: boolean) => void;
  setCursor: (_x: number, _y: number) => void;
  setGeometry: (_label: string) => void; // R2: replaces setSelectionCount
  setSaveStatus: (_status: SaveStatus) => void;
  setLoading: (_state: LoadingState) => void;
}

export function buildHud(): HudControls {
  const container = document.createElement('div');
  container.className = 'hud hud-weighted';
  container.setAttribute('data-testid', 'hud');

  // ─── Selection info — DEFAULT tier ─────────────────────────────────────────
  const selItem = document.createElement('div');
  selItem.className = 'hud-item hud-primary';
  selItem.setAttribute('data-hud-tier', 'default');

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

  // ─── Loading indicator (ephemeral) — DEFAULT tier ─────────────────────────
  const loadingItem = document.createElement('div');
  loadingItem.className = 'hud-item hud-loading';
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

  // ─── Separator ────────────────────────────────────────────────────────────
  const sep1 = document.createElement('div');
  sep1.className = 'hud-sep';
  container.appendChild(sep1);

  // ─── Snap indicator — CONTEXTUAL tier ────────────────────────────────────
  const snapItem = document.createElement('div');
  snapItem.className = 'hud-item hud-snap';
  snapItem.setAttribute('data-hud-tier', 'contextual');

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

  // ─── Grid indicator — CONTEXTUAL tier ─────────────────────────────────────
  const gridItem = document.createElement('div');
  gridItem.className = 'hud-item hud-grid';
  gridItem.setAttribute('data-hud-tier', 'contextual');

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

  // ─── Cursor position — CONTEXTUAL tier ────────────────────────────────────
  const cursorItem = document.createElement('div');
  cursorItem.className = 'hud-item hud-cursor';
  cursorItem.setAttribute('data-hud-tier', 'contextual');

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
  const sep2 = document.createElement('div');
  sep2.className = 'hud-sep';
  container.appendChild(sep2);

  // ─── Zoom — DEFAULT tier ─────────────────────────────────────────────────
  const zoomItem = document.createElement('div');
  zoomItem.className = 'hud-item';
  zoomItem.setAttribute('data-hud-tier', 'default');

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

  // ─── Geometry readout — CONTEXTUAL tier (R2 new) ─────────────────────────
  const geometryItem = document.createElement('div');
  geometryItem.className = 'hud-item hud-geometry';
  geometryItem.setAttribute('data-hud-tier', 'contextual');
  geometryItem.style.display = 'none';

  const geometryLabel = document.createElement('span');
  geometryLabel.className = 'hud-label';
  geometryLabel.textContent = 'Geo:';

  const geometryValue = document.createElement('span');
  geometryValue.className = 'hud-value';
  geometryValue.setAttribute('data-testid', 'hud-geometry');
  geometryValue.textContent = '';

  geometryItem.appendChild(geometryLabel);
  geometryItem.appendChild(geometryValue);
  container.appendChild(geometryItem);

  // ─── Save-status indicator — DEFAULT tier ───────────────────────────────────
  const saveStatusItem = document.createElement('div');
  saveStatusItem.className = 'hud-item hud-save-status';
  saveStatusItem.setAttribute('data-hud-tier', 'default');

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
    setPage: () => {
      // no-op: page info now lives in page-tabs cluster (bottom-left)
    },
    setZoom: (percent: number) => {
      zoomBtn.textContent = `${Math.round(percent)}%`;
    },
    setMode: () => {
      // no-op: mode info now lives in contextual toolbar
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
    setGeometry: (label: string) => {
      geometryValue.textContent = label;
      geometryItem.style.display = label ? '' : 'none';
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
  };
}
