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

export interface HudControls {
  container: HTMLElement;
  setSelection: (label: string) => void;
  setPage: (current: number, total: number) => void;
  setZoom: (percent: number) => void;
  setMode: (mode: 'Edit' | 'Read Only' | 'Present') => void;
  onZoomClick: (handler: () => void) => void;
  setSnap: (enabled: boolean) => void;
  setGrid: (visible: boolean) => void;
  setCursor: (x: number, y: number) => void;
  setSelectionCount: (n: number) => void;
}

export function buildHud(): HudControls {
  const container = document.createElement('div');
  container.className = 'hud hud-weighted';
  container.setAttribute('data-testid', 'hud');

  // ─── Selection info ────────────────────────────────────────────────────────
  const selItem = document.createElement('div');
  selItem.className = 'hud-item';

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

  // ─── Cursor position ───────────────────────────────────────────────────────
  const cursorItem = document.createElement('div');
  cursorItem.className = 'hud-item hud-cursor';

  const cursorLabel = document.createElement('span');
  cursorLabel.className = 'hud-label';
  cursorLabel.textContent = 'X:';

  const cursorXValue = document.createElement('span');
  cursorXValue.className = 'hud-value';
  cursorXValue.setAttribute('data-testid', 'hud-cursor');
  cursorXValue.textContent = '0';

  const cursorSep = document.createElement('span');
  cursorSep.className = 'hud-value';
  cursorSep.textContent = ' Y:';

  const cursorYValue = document.createElement('span');
  cursorYValue.className = 'hud-value';
  cursorYValue.textContent = '0';

  cursorItem.appendChild(cursorLabel);
  cursorItem.appendChild(cursorXValue);
  cursorItem.appendChild(cursorSep);
  cursorItem.appendChild(cursorYValue);
  container.appendChild(cursorItem);

  // ─── Selection count ──────────────────────────────────────────────────────
  const countItem = document.createElement('div');
  countItem.className = 'hud-item hud-count';

  const countLabel = document.createElement('span');
  countLabel.className = 'hud-label';
  countLabel.textContent = 'Count:';

  const countValue = document.createElement('span');
  countValue.className = 'hud-value';
  countValue.setAttribute('data-testid', 'hud-count');
  countValue.textContent = '0';

  countItem.appendChild(countLabel);
  countItem.appendChild(countValue);
  container.appendChild(countItem);

  // ─── Separator ────────────────────────────────────────────────────────────
  const sep1 = document.createElement('div');
  sep1.className = 'hud-sep';
  container.appendChild(sep1);

  // ─── Page info ─────────────────────────────────────────────────────────────
  const pageItem = document.createElement('div');
  pageItem.className = 'hud-item';

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

  let zoomClickHandler: (() => void) | null = null;

  zoomBtn.addEventListener('click', () => {
    zoomClickHandler?.();
  });

  return {
    container,
    setSelection: (label: string) => {
      selValue.textContent = label;
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
      cursorXValue.textContent = String(Math.round(x));
      cursorYValue.textContent = String(Math.round(y));
    },
    setSelectionCount: (n: number) => {
      countValue.textContent = String(n);
    },
  };
}
