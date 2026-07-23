/**
 * hud.ts — Zone 3.5: Status Strip / HUD
 *
 * 28px strip between canvas and bottom bar showing:
 * - Selection info (shape type + geometry)
 * - Zoom level (clickable to reset)
 * - Mode indicator relocated to contextual toolbar (alias)
 *
 * Density tiers (R2b Approach 1):
 * - 'compact': only essential items visible (selection, zoom, save-status)
 * - 'full': all contextual items visible (snap, grid, cursor, geometry)
 *
 * Individual items tagged via data-hud-density-item="default"|"contextual"
 */
export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'auto-saved';
export type LoadingState = { wasm: boolean; stencil: boolean };

export interface HudControls {
  container: HTMLElement;
  setSelection: (_label: string) => void;
  /** R2b: No-op — hud-page removed, page count not shown in HUD */
  setPage: (_current: number, _total: number) => void;
  setGeometry: (_x: number, _y: number, _w: number, _h: number) => void;
  setZoom: (_percent: number) => void;
  /** Alias for toolbar — mode display moved to contextual toolbar per R2b */
  setModeAlias: (_mode: 'Edit' | 'Read Only' | 'Present') => void;
  onZoomClick: (_handler: () => void) => void;
  setSnap: (_enabled: boolean) => void;
  setGrid: (_visible: boolean) => void;
  setCursor: (_x: number, _y: number) => void;
  setSelectionCount: (_n: number) => void;
  setSaveStatus: (_status: SaveStatus) => void;
  setLoading: (_state: LoadingState) => void;
  /** R2b: Set HUD density tier. 'compact' hides contextual items; 'full' shows all. */
  setDensity: (_density: 'compact' | 'full') => void;
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
  snapItem.setAttribute('data-hud-density-item', 'contextual');

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
  gridItem.setAttribute('data-hud-density-item', 'contextual');

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

  // ─── Cursor position ─────────────────────────────────────────────────────
  // Only visible during drag (contextual tier)
  const cursorItem = document.createElement('div');
  cursorItem.className = 'hud-item hud-cursor';
  cursorItem.setAttribute('data-hud-density-item', 'contextual');

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

  // ─── Geometry info ────────────────────────────────────────────────────────
  // Shows x, y, w, h of selected shape (contextual)
  const geomItem = document.createElement('div');
  geomItem.className = 'hud-item hud-geometry';
  geomItem.setAttribute('data-hud-density-item', 'contextual');
  geomItem.setAttribute('data-testid', 'hud-geometry');
  geomItem.style.display = 'none';

  const geomLabel = document.createElement('span');
  geomLabel.className = 'hud-label';
  geomLabel.textContent = 'Geo:';

  const geomValue = document.createElement('span');
  geomValue.className = 'hud-value';
  geomValue.setAttribute('data-testid', 'hud-geometry-value');
  geomValue.textContent = '—';

  geomItem.appendChild(geomLabel);
  geomItem.appendChild(geomValue);
  container.appendChild(geomItem);

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

  let zoomClickHandler: (() => void) | null = null;

  zoomBtn.addEventListener('click', () => {
    zoomClickHandler?.();
  });

  return {
    container,
    setSelection: (label: string) => {
      selValue.textContent = label;
      if (label === 'Nothing selected') {
        selItem.classList.add('hud-item--empty');
      } else {
        selItem.classList.remove('hud-item--empty');
      }
    },
    setPage: (_current: number, _total: number) => {
      // No-op: hud-page removed per R2b spec
    },
    setGeometry: (x: number, y: number, w: number, h: number) => {
      if (w <= 0 || h <= 0) {
        geomItem.style.display = 'none';
      } else {
        geomItem.style.display = '';
        geomValue.textContent = `${Math.round(x)},${Math.round(y)} ${Math.round(w)}×${Math.round(h)}`;
      }
    },
    setZoom: (percent: number) => {
      zoomBtn.textContent = `${Math.round(percent)}%`;
    },
    setModeAlias: (_mode: 'Edit' | 'Read Only' | 'Present') => {
      // Mode display relocated to contextual toolbar per R2b — this is a no-op in HUD
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
      // Selection count is reflected in the Selection label
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
    setDensity: (density: 'compact' | 'full') => {
      container.dataset['hudDensity'] = density;
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
