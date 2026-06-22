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
  };
}
