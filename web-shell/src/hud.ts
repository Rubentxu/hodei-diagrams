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

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'auto-saved';
export type LoadingState = { wasm: boolean; stencil: boolean };

export interface HudControls {
  container: HTMLElement;
  setSelection: (_label: string) => void;
  setPage: (_current: number, _total: number) => void;
  setZoom: (_percent: number) => void;
  setMode: (_mode: 'Edit' | 'Read Only' | 'Present') => void;
  onZoomClick: (_handler: () => void) => void;
  setSnap: (_enabled: boolean) => void;
  setGrid: (_visible: boolean) => void;
  setCursor: (_x: number, _y: number) => void;
  setSelectionCount: (_n: number) => void;
  setSaveStatus: (_status: SaveStatus) => void;
  setLoading: (_state: LoadingState) => void;
  /** R2b: Set HUD density tier. 'compact' hides tertiary items; 'full' shows all. */
  setDensity: (_density: 'full' | 'compact') => void;
}

export function buildHud(): HudControls {
  const container = document.createElement('div');
  container.className = 'hud hud-weighted';
  container.setAttribute('data-testid', 'hud');

  // ─── Selection info ────────────────────────────────────────────────────────
  const selItem = document.createElement('div');
  selItem.className = 'hud-item hud-primary';

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

  // ─── Cursor position + selection count ──────────────────────────────────────
  // Single compact "cursor" item showing X / Y, plus selection count.
  // Kept narrow so all HUD items fit in a 28px row at 1280px viewport.
  const cursorItem = document.createElement('div');
  cursorItem.className = 'hud-item hud-cursor';

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

  // ─── Page info ─────────────────────────────────────────────────────────────
  const pageItem = document.createElement('div');
  pageItem.className = 'hud-item hud-page';

  const pageLabel = document.createElement('span');
  pageLabel.className = 'hud-label';
  pageLabel.textContent = 'Page:';

  const pageValue = document.createElement('span');
  pageValue.className = 'hud-value';
  pageValue.setAttribute('data-testid', 'hud-page');
  pageValue.textContent = '1/1';

  pageItem.appendChild(pageLabel);
  pageItem.appendChild(pageValue);
  container.appendChild(pageItem);

  // ─── Separator ────────────────────────────────────────────────────────────
  const sep2 = document.createElement('div');
  sep2.className = 'hud-sep';
  container.appendChild(sep2);

  // ─── Zoom ─────────────────────────────────────────────────────────────────
  const zoomItem = document.createElement('div');
  zoomItem.className = 'hud-item';

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

  // ─── Mode ─────────────────────────────────────────────────────────────────
  const modeItem = document.createElement('div');
  modeItem.className = 'hud-item';

  const modeLabel = document.createElement('span');
  modeLabel.className = 'hud-label';
  modeLabel.textContent = 'Mode:';

  const modeValue = document.createElement('span');
  modeValue.className = 'hud-value';
  modeValue.setAttribute('data-testid', 'hud-mode');
  modeValue.textContent = 'Edit';

  modeItem.appendChild(modeLabel);
  modeItem.appendChild(modeValue);
  container.appendChild(modeItem);

  // ─── Save-status indicator (persistent, right side) ─────────────────────────
  const saveStatusItem = document.createElement('div');
  saveStatusItem.className = 'hud-item hud-save-status';

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
    setPage: (current: number, total: number) => {
      pageValue.textContent = `${current}/${total}`;
    },
    setZoom: (percent: number) => {
      zoomBtn.textContent = `${Math.round(percent)}%`;
    },
    setMode: (mode: 'Edit' | 'Read Only' | 'Present') => {
      modeValue.textContent = mode;
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
    setDensity: (density: 'full' | 'compact') => {
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
