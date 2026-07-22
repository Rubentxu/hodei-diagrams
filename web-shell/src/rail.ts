/**
 * rail.ts — Zone 0: Left Tool Rail
 *
 * Vertical icon bar with Select, Shapes, Connector, Text, Zoom-to-fit tools,
 * and a Help button at the bottom. Active tool highlighted with accent color.
 */

import { ICONS } from './icon.js';

export type RailToolId = 'select' | 'shapes' | 'connector' | 'text' | 'zoom-fit' | 'help';

export interface RailTool {
  id: RailToolId;
  label: string;
  icon: string;
  shortcut: string;
}

export interface RailControls {
  container: HTMLElement;
  selectBtn: HTMLButtonElement;
  shapesBtn: HTMLButtonElement;
  connectorBtn: HTMLButtonElement;
  textBtn: HTMLButtonElement;
  zoomFitBtn: HTMLButtonElement;
  helpBtn: HTMLButtonElement;
  dockLayersBtn: HTMLButtonElement;
  dockHistoryBtn: HTMLButtonElement;
}

export interface RailCallbacks {
  onSelectTool: () => void;
  onShapesTool: () => void;
  onConnectorTool: () => void;
  onTextTool: () => void;
  onZoomFit: () => void;
  onHelp: () => void;
  onDockMode: (_mode: 'shapes' | 'layers' | 'history') => void;
}

const RAIL_ICONS = {
  select: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 2L3 14L7 10L10 14L12 13L9 9L13 9L3 2Z"/>
  </svg>`,
  shapes: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="2" width="12" height="12" rx="1.5"/>
  </svg>`,
  connector: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="3" cy="8" r="1.5"/>
    <circle cx="13" cy="8" r="1.5"/>
    <line x1="4.5" y1="8" x2="11.5" y2="8"/>
    <line x1="8" y1="6" x2="8" y2="10"/>
  </svg>`,
};

export function buildRail(callbacks: RailCallbacks): RailControls {
  const container = document.createElement('div');
  container.className = 'rail';
  container.setAttribute('data-testid', 'rail');

  // Select tool
  const selectBtn = document.createElement('button');
  selectBtn.className = 'rail-btn active';
  selectBtn.title = 'Select (V)';
  selectBtn.setAttribute('data-testid', 'rail-select-btn');
  selectBtn.innerHTML = RAIL_ICONS.select;
  selectBtn.addEventListener('click', () => {
    setActiveTool('select');
    callbacks.onSelectTool();
  });
  container.appendChild(selectBtn);

  // Shapes tool
  const shapesBtn = document.createElement('button');
  shapesBtn.className = 'rail-btn';
  shapesBtn.title = 'Shapes (R)';
  shapesBtn.setAttribute('data-testid', 'rail-shapes-btn');
  shapesBtn.innerHTML = RAIL_ICONS.shapes;
  shapesBtn.addEventListener('click', () => {
    setActiveTool('shapes');
    callbacks.onShapesTool();
    callbacks.onDockMode('shapes');
  });
  container.appendChild(shapesBtn);

  // Connector tool
  const connectorBtn = document.createElement('button');
  connectorBtn.className = 'rail-btn';
  connectorBtn.title = 'Connector (C)';
  connectorBtn.setAttribute('data-testid', 'rail-connector-btn');
  connectorBtn.innerHTML = RAIL_ICONS.connector;
  connectorBtn.addEventListener('click', () => {
    setActiveTool('connector');
    callbacks.onConnectorTool();
  });
  container.appendChild(connectorBtn);

  // Separator between main tools and text/zoom tools
  const sep1 = document.createElement('div');
  sep1.className = 'rail-sep';
  container.appendChild(sep1);

  // Text tool
  const textBtn = document.createElement('button');
  textBtn.className = 'rail-btn';
  textBtn.title = 'Text (T)';
  textBtn.setAttribute('data-testid', 'rail-text-btn');
  textBtn.innerHTML = ICONS.TEXT;
  textBtn.addEventListener('click', () => {
    setActiveTool('text');
    callbacks.onTextTool();
  });
  container.appendChild(textBtn);

  // Zoom-to-fit tool
  const zoomFitBtn = document.createElement('button');
  zoomFitBtn.className = 'rail-btn';
  zoomFitBtn.title = 'Zoom to Fit (F)';
  zoomFitBtn.setAttribute('data-testid', 'rail-zoom-fit-btn');
  zoomFitBtn.innerHTML = ICONS.ZOOM_FIT;
  zoomFitBtn.addEventListener('click', () => {
    setActiveTool('zoom-fit');
    callbacks.onZoomFit();
  });
  container.appendChild(zoomFitBtn);

  // Separator between tools and Help section
  const sep2 = document.createElement('div');
  sep2.className = 'rail-sep';
  sep2.setAttribute('data-testid', 'rail-separator');
  container.appendChild(sep2);

  // Dock mode: Layers
  const dockLayersBtn = document.createElement('button');
  dockLayersBtn.className = 'rail-btn';
  dockLayersBtn.title = 'Layers (L)';
  dockLayersBtn.setAttribute('data-testid', 'rail-dock-layers-btn');
  dockLayersBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="3" width="12" height="3" rx="0.5"/>
    <rect x="2" y="7" width="12" height="3" rx="0.5"/>
    <rect x="2" y="11" width="12" height="2" rx="0.5"/>
  </svg>`;
  dockLayersBtn.addEventListener('click', () => {
    // Note: dock activation does NOT change activeTool (rail retains existing tools)
    callbacks.onDockMode('layers');
  });
  // Keyboard activatable (Enter/Space) - native button behavior
  container.appendChild(dockLayersBtn);

  // Dock mode: History
  const dockHistoryBtn = document.createElement('button');
  dockHistoryBtn.className = 'rail-btn';
  dockHistoryBtn.title = 'History (H)';
  dockHistoryBtn.setAttribute('data-testid', 'rail-dock-history-btn');
  dockHistoryBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="8" cy="8" r="6"/>
    <polyline points="8,4 8,8 11,10"/>
  </svg>`;
  dockHistoryBtn.addEventListener('click', () => {
    // Note: dock activation does NOT change activeTool (rail retains existing tools)
    callbacks.onDockMode('history');
  });
  // Keyboard activatable (Enter/Space) - native button behavior
  container.appendChild(dockHistoryBtn);

  // Spacer to push Help to bottom
  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  container.appendChild(spacer);

  // Help tool (at bottom)
  const helpBtn = document.createElement('button');
  helpBtn.className = 'rail-btn';
  helpBtn.title = 'Help (?)';
  helpBtn.setAttribute('data-testid', 'rail-help-btn');
  helpBtn.innerHTML = ICONS.HELP;
  helpBtn.addEventListener('click', () => {
    setActiveTool('help');
    callbacks.onHelp();
  });
  container.appendChild(helpBtn);

  function setActiveTool(tool: RailToolId): void {
    selectBtn.classList.toggle('active', tool === 'select');
    shapesBtn.classList.toggle('active', tool === 'shapes');
    connectorBtn.classList.toggle('active', tool === 'connector');
    textBtn.classList.toggle('active', tool === 'text');
    zoomFitBtn.classList.toggle('active', tool === 'zoom-fit');
    helpBtn.classList.toggle('active', tool === 'help');
  }

  return {
    container,
    selectBtn,
    shapesBtn,
    connectorBtn,
    textBtn,
    zoomFitBtn,
    helpBtn,
    dockLayersBtn,
    dockHistoryBtn,
  };
}
