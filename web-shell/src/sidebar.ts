/**
 * sidebar.ts — Zone 2: Left Sidebar (collapsible)
 *
 * Shape palette with categories. "General" has 3 functional shapes.
 * Future categories are grayed out with v1.1 tooltip.
 * Collapse state persisted in localStorage.
 */

export interface SidebarControls {
  container: HTMLElement;
  rectToolBtn: HTMLButtonElement;
  ellipseToolBtn: HTMLButtonElement;
  collapseBtn: HTMLButtonElement;
}

const LS_KEY = 'hodei:sidebar-collapsed';

/** Shape definition for the General category. */
interface ShapeEntry {
  id: string;
  label: string;
  tooltip: string;
  icon: string; // inline SVG
  dataTestId: string;
}

const GENERAL_SHAPES: ShapeEntry[] = [
  {
    id: 'rectangle',
    label: 'Rect',
    tooltip: 'Rectangle shape',
    icon: '<svg width="32" height="24" viewBox="0 0 32 24"><rect x="2" y="2" width="28" height="20" rx="2" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
    dataTestId: 'rect-tool-btn',
  },
  {
    id: 'rounded-rect',
    label: 'RoundedRect',
    tooltip: 'Rounded rectangle shape',
    icon: '<svg width="32" height="24" viewBox="0 0 32 24"><rect x="2" y="2" width="28" height="20" rx="6" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
    dataTestId: 'rounded-rect-tool-btn',
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    tooltip: 'Ellipse shape',
    icon: '<svg width="32" height="24" viewBox="0 0 32 24"><ellipse cx="16" cy="12" rx="14" ry="10" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
    dataTestId: 'ellipse-tool-btn',
  },
];

const FUTURE_CATEGORIES = [
  'Arrows',
  'Flowchart',
  'UML',
  'BPMN',
  'AWS',
  'Network',
  'Database',
  'Mockups',
];

export function buildSidebar(): SidebarControls {
  const container = document.createElement('div');
  container.className = 'sidebar';
  container.setAttribute('data-testid', 'sidebar');

  // ─── Header + collapse toggle ─────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'sidebar-header';

  const title = document.createElement('span');
  title.className = 'sidebar-title';
  title.textContent = 'Shapes';
  header.appendChild(title);

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'collapse-btn';
  collapseBtn.textContent = '◀';
  collapseBtn.title = 'Collapse sidebar';
  collapseBtn.setAttribute('data-testid', 'sidebar-collapse-btn');
  header.appendChild(collapseBtn);

  container.appendChild(header);

  // Restore collapsed state (with localStorage guard for test environments)
  try {
    if (localStorage.getItem(LS_KEY) === 'true') {
      container.classList.add('collapsed');
      collapseBtn.textContent = '▶';
      collapseBtn.title = 'Expand sidebar';
    }
  } catch {
    // localStorage unavailable (test environments)
  }

  // ─── Search bar ──────────────────────────────────────────────────────────
  const searchInput = document.createElement('input');
  searchInput.className = 'sidebar-search';
  searchInput.type = 'search';
  searchInput.placeholder = 'Search shapes…';
  searchInput.setAttribute('data-testid', 'sidebar-search');
  container.appendChild(searchInput);

  // ─── General category ────────────────────────────────────────────────────
  const generalCat = document.createElement('div');
  generalCat.className = 'shape-category';

  const generalTitle = document.createElement('div');
  generalTitle.className = 'category-title';
  generalTitle.textContent = 'General';
  generalCat.appendChild(generalTitle);

  const shapeGrid = document.createElement('div');
  shapeGrid.className = 'shape-grid';

  const controls: Pick<SidebarControls, 'rectToolBtn' | 'ellipseToolBtn'> = {
    rectToolBtn: document.createElement('button'),
    ellipseToolBtn: document.createElement('button'),
  };

  for (const shape of GENERAL_SHAPES) {
    const btn = document.createElement('button');
    btn.className = 'shape-btn';
    btn.title = shape.tooltip;
    btn.setAttribute('data-testid', shape.dataTestId);
    btn.innerHTML = shape.icon;
    const label = document.createElement('span');
    label.className = 'shape-label';
    label.textContent = shape.label;
    btn.appendChild(label);

    if (shape.id === 'rectangle') {
      controls.rectToolBtn = btn;
    } else if (shape.id === 'ellipse') {
      controls.ellipseToolBtn = btn;
    }

    shapeGrid.appendChild(btn);
  }

  generalCat.appendChild(shapeGrid);
  container.appendChild(generalCat);

  // ─── Future categories (grayed out) ──────────────────────────────────────
  for (const cat of FUTURE_CATEGORIES) {
    const catEl = document.createElement('div');
    catEl.className = 'shape-category disabled';

    const catTitle = document.createElement('div');
    catTitle.className = 'category-title';
    catTitle.textContent = cat;
    catEl.appendChild(catTitle);

    const msg = document.createElement('div');
    msg.className = 'category-coming-soon';
    msg.textContent = 'Disponible en v1.1';
    catEl.appendChild(msg);

    container.appendChild(catEl);
  }

  // ─── More Shapes button ──────────────────────────────────────────────────
  const moreBtn = document.createElement('button');
  moreBtn.className = 'more-shapes-btn';
  moreBtn.textContent = '+ More Shapes';
  moreBtn.disabled = true;
  moreBtn.title = 'Disponible en v1.1';
  container.appendChild(moreBtn);

  return {
    container,
    rectToolBtn: controls.rectToolBtn,
    ellipseToolBtn: controls.ellipseToolBtn,
    collapseBtn,
  };
}
