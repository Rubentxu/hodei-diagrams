/**
 * rail.ts — Zone 0: Left Tool Rail
 *
 * Vertical icon bar with Select, Shapes, Connector tools.
 * Active tool highlighted with accent color.
 */

export interface RailControls {
  container: HTMLElement;
  selectBtn: HTMLButtonElement;
  shapesBtn: HTMLButtonElement;
  connectorBtn: HTMLButtonElement;
}

export interface RailCallbacks {
  onSelectTool: () => void;
  onShapesTool: () => void;
  onConnectorTool: () => void;
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

  // Separator
  const sep = document.createElement('div');
  sep.className = 'rail-sep';
  container.appendChild(sep);

  function setActiveTool(tool: 'select' | 'shapes' | 'connector'): void {
    selectBtn.classList.toggle('active', tool === 'select');
    shapesBtn.classList.toggle('active', tool === 'shapes');
    connectorBtn.classList.toggle('active', tool === 'connector');
  }

  return {
    container,
    selectBtn,
    shapesBtn,
    connectorBtn,
  };
}
