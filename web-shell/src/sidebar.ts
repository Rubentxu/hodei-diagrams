/**
 * sidebar.ts — Zone 2: Left Sidebar (collapsible)
 *
 * Shape palette with categories. "General" has 3 functional shapes.
 * Future categories are grayed out with lock icon + "Soon".
 * Collapse state persisted in localStorage.
 */

export interface SidebarControls {
  container: HTMLElement;
  rectToolBtn: HTMLButtonElement;
  roundedRectToolBtn: HTMLButtonElement;
  ellipseToolBtn: HTMLButtonElement;
  diamondToolBtn: HTMLButtonElement;
  triangleToolBtn: HTMLButtonElement;
  hexagonToolBtn: HTMLButtonElement;
  cylinderToolBtn: HTMLButtonElement;
  cloudToolBtn: HTMLButtonElement;
  parallelogramToolBtn: HTMLButtonElement;
  trapezoidToolBtn: HTMLButtonElement;
  polygonToolBtn: HTMLButtonElement;
  rectangleStencilBtn: HTMLButtonElement;
  ellipseStencilBtn: HTMLButtonElement;
  diamondStencilBtn: HTMLButtonElement;
  triangleStencilBtn: HTMLButtonElement;
  hexagonStencilBtn: HTMLButtonElement;
  cylinderStencilBtn: HTMLButtonElement;
  cloudStencilBtn: HTMLButtonElement;
  parallelogramStencilBtn: HTMLButtonElement;
  trapezoidStencilBtn: HTMLButtonElement;
  blockArrowStencilBtn: HTMLButtonElement;
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
  {
    id: 'diamond',
    label: 'Diamond',
    tooltip: 'Diamond (rhombus) shape',
    icon: '<svg width="32" height="24" viewBox="0 0 32 24"><polygon points="16,2 30,12 16,22 2,12" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
    dataTestId: 'diamond-tool-btn',
  },
  {
    id: 'triangle',
    label: 'Triangle',
    tooltip: 'Triangle shape',
    icon: '<svg width="32" height="24" viewBox="0 0 32 24"><polygon points="16,2 30,22 2,22" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
    dataTestId: 'triangle-tool-btn',
  },
  {
    id: 'hexagon',
    label: 'Hexagon',
    tooltip: 'Hexagon shape',
    icon: '<svg width="32" height="24" viewBox="0 0 32 24"><polygon points="16,2 28,7 28,17 16,22 4,17 4,7" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
    dataTestId: 'hexagon-tool-btn',
  },
  {
    id: 'cylinder',
    label: 'Cylinder',
    tooltip: 'Cylinder shape',
    icon: '<svg width="32" height="24" viewBox="0 0 32 24"><path d="M6,6 C6,3 10,2 16,2 C22,2 26,3 26,6 L26,18 C26,21 22,22 16,22 C10,22 6,21 6,18 Z" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
    dataTestId: 'cylinder-tool-btn',
  },
  {
    id: 'cloud',
    label: 'Cloud',
    tooltip: 'Cloud shape',
    icon: '<svg width="32" height="24" viewBox="0 0 32 24"><path d="M8,18 C4,18 2,14 4,10 C4,6 8,4 12,6 C14,4 18,4 20,6 C24,6 28,10 26,14 C30,14 30,18 26,18 Z" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
    dataTestId: 'cloud-tool-btn',
  },
  {
    id: 'parallelogram',
    label: 'Parallelogram',
    tooltip: 'Parallelogram shape',
    icon: '<svg width="32" height="24" viewBox="0 0 32 24"><polygon points="8,2 30,2 24,22 2,22" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
    dataTestId: 'parallelogram-tool-btn',
  },
  {
    id: 'trapezoid',
    label: 'Trapezoid',
    tooltip: 'Trapezoid shape',
    icon: '<svg width="32" height="24" viewBox="0 0 32 24"><polygon points="6,2 26,2 30,22 2,22" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
    dataTestId: 'trapezoid-tool-btn',
  },
  {
    id: 'polygon',
    label: 'Polygon',
    tooltip: 'Free-form polygon shape',
    icon: '<svg width="32" height="24" viewBox="0 0 32 24"><polygon points="6,18 10,6 22,4 28,14 20,22 8,22" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
    dataTestId: 'polygon-tool-btn',
  },
];

/** Category icons mapping for future categories */
const CATEGORY_ICONS: Record<string, string> = {
  'General': '⬜',
  'Stencils': '📋',
  'Arrows': '➡️',
  'Flowchart': '🔄',
  'UML': '📐',
  'BPMN': '🏭',
  'AWS': '☁️',
  'Azure': '🔷',
  'GCP': '🌐',
  'Kubernetes': '⚙️',
  'Terraform': '🏗️',
  'Jenkins': '🔧',
  'Databases': '🗄️',
  'C4': '🏛️',
  'Network': '🌐',
  'Database': '🗄️',
  'Mockups': '📱',
};

const FUTURE_CATEGORIES = [
  'Arrows',
  'Flowchart',
  'UML',
  'BPMN',
  'AWS',
  'Azure',
  'GCP',
  'Kubernetes',
  'Terraform',
  'Jenkins',
  'Databases',
  'C4',
  'Network',
  'Database',
  'Mockups',
];

const LOCK_ICON = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
  <rect x="2" y="4.5" width="6" height="4" rx="0.5"/>
  <path d="M3 4.5V3a2 2 0 0 1 4 0v1.5"/>
</svg>`;

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
  const searchWrap = document.createElement('div');
  searchWrap.className = 'sidebar-search-wrap';

  const searchIcon = document.createElement('span');
  searchIcon.className = 'search-icon';
  searchIcon.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <circle cx="5" cy="5" r="3.5"/>
    <line x1="7.5" y1="7.5" x2="11" y2="11"/>
  </svg>`;
  searchWrap.appendChild(searchIcon);

  const searchInput = document.createElement('input');
  searchInput.className = 'sidebar-search';
  searchInput.type = 'search';
  searchInput.placeholder = 'Search shapes…';
  searchInput.setAttribute('data-testid', 'sidebar-search');
  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);

  // ─── General category ────────────────────────────────────────────────────
  const generalCat = document.createElement('div');
  generalCat.className = 'shape-category';

  const generalHeader = document.createElement('div');
  generalHeader.className = 'category-header';

  const generalIcon = document.createElement('span');
  generalIcon.className = 'category-icon';
  generalIcon.textContent = '⬜';
  generalHeader.appendChild(generalIcon);

  const generalTitle = document.createElement('span');
  generalTitle.className = 'category-title';
  generalTitle.textContent = 'General';
  generalHeader.appendChild(generalTitle);

  const generalChevron = document.createElement('span');
  generalChevron.className = 'category-chevron';
  generalChevron.textContent = '▼';
  generalHeader.appendChild(generalChevron);

  generalCat.appendChild(generalHeader);

  const shapeGrid = document.createElement('div');
  shapeGrid.className = 'shape-grid';

  const controls: Pick<SidebarControls, 'rectToolBtn' | 'roundedRectToolBtn' | 'ellipseToolBtn' | 'diamondToolBtn' | 'triangleToolBtn' | 'hexagonToolBtn' | 'cylinderToolBtn' | 'cloudToolBtn' | 'parallelogramToolBtn' | 'trapezoidToolBtn' | 'polygonToolBtn' | 'rectangleStencilBtn' | 'ellipseStencilBtn' | 'diamondStencilBtn' | 'triangleStencilBtn' | 'hexagonStencilBtn' | 'cylinderStencilBtn' | 'cloudStencilBtn' | 'parallelogramStencilBtn' | 'trapezoidStencilBtn' | 'blockArrowStencilBtn'> = {
    rectToolBtn: document.createElement('button'),
    roundedRectToolBtn: document.createElement('button'),
    ellipseToolBtn: document.createElement('button'),
    diamondToolBtn: document.createElement('button'),
    triangleToolBtn: document.createElement('button'),
    hexagonToolBtn: document.createElement('button'),
    cylinderToolBtn: document.createElement('button'),
    cloudToolBtn: document.createElement('button'),
    parallelogramToolBtn: document.createElement('button'),
    trapezoidToolBtn: document.createElement('button'),
    polygonToolBtn: document.createElement('button'),
    rectangleStencilBtn: document.createElement('button'),
    ellipseStencilBtn: document.createElement('button'),
    diamondStencilBtn: document.createElement('button'),
    triangleStencilBtn: document.createElement('button'),
    hexagonStencilBtn: document.createElement('button'),
    cylinderStencilBtn: document.createElement('button'),
    cloudStencilBtn: document.createElement('button'),
    parallelogramStencilBtn: document.createElement('button'),
    trapezoidStencilBtn: document.createElement('button'),
    blockArrowStencilBtn: document.createElement('button'),
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
    } else if (shape.id === 'rounded-rect') {
      controls.roundedRectToolBtn = btn;
    } else if (shape.id === 'ellipse') {
      controls.ellipseToolBtn = btn;
    } else if (shape.id === 'diamond') {
      controls.diamondToolBtn = btn;
    } else if (shape.id === 'triangle') {
      controls.triangleToolBtn = btn;
    } else if (shape.id === 'hexagon') {
      controls.hexagonToolBtn = btn;
    } else if (shape.id === 'cylinder') {
      controls.cylinderToolBtn = btn;
    } else if (shape.id === 'cloud') {
      controls.cloudToolBtn = btn;
    } else if (shape.id === 'parallelogram') {
      controls.parallelogramToolBtn = btn;
    } else if (shape.id === 'trapezoid') {
      controls.trapezoidToolBtn = btn;
    } else if (shape.id === 'polygon') {
      controls.polygonToolBtn = btn;
    }

    shapeGrid.appendChild(btn);
  }

  generalCat.appendChild(shapeGrid);

  // ─── Stencils category ──────────────────────────────────────────────────
  const stencilCat = document.createElement('div');
  stencilCat.className = 'shape-category';

  const stencilHeader = document.createElement('div');
  stencilHeader.className = 'category-header';

  const stencilIcon = document.createElement('span');
  stencilIcon.className = 'category-icon';
  stencilIcon.textContent = CATEGORY_ICONS['Stencils'] ?? '📋';
  stencilHeader.appendChild(stencilIcon);

  const stencilTitle = document.createElement('span');
  stencilTitle.className = 'category-title';
  stencilTitle.textContent = 'Stencils';
  stencilHeader.appendChild(stencilTitle);

  stencilCat.appendChild(stencilHeader);

  const stencilGrid = document.createElement('div');
  stencilGrid.className = 'shape-grid';

  const STENCIL_SHAPES: ShapeEntry[] = [
    {
      id: 'rectangle',
      label: 'Rect',
      tooltip: 'Rectangle stencil',
      icon: '<svg width="32" height="24" viewBox="0 0 32 24"><rect x="2" y="2" width="28" height="20" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
      dataTestId: 'rectangle-stencil-btn',
    },
    {
      id: 'ellipse',
      label: 'Ellipse',
      tooltip: 'Ellipse stencil',
      icon: '<svg width="32" height="24" viewBox="0 0 32 24"><ellipse cx="16" cy="12" rx="14" ry="10" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
      dataTestId: 'ellipse-stencil-btn',
    },
    {
      id: 'diamond',
      label: 'Diamond',
      tooltip: 'Diamond stencil',
      icon: '<svg width="32" height="24" viewBox="0 0 32 24"><polygon points="16,2 30,12 16,22 2,12" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
      dataTestId: 'diamond-stencil-btn',
    },
    {
      id: 'triangle',
      label: 'Triangle',
      tooltip: 'Triangle stencil',
      icon: '<svg width="32" height="24" viewBox="0 0 32 24"><polygon points="16,2 30,22 2,22" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
      dataTestId: 'triangle-stencil-btn',
    },
    {
      id: 'hexagon',
      label: 'Hexagon',
      tooltip: 'Hexagon stencil',
      icon: '<svg width="32" height="24" viewBox="0 0 32 24"><polygon points="16,2 28,7 28,17 16,22 4,17 4,7" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
      dataTestId: 'hexagon-stencil-btn',
    },
    {
      id: 'cylinder',
      label: 'Cylinder',
      tooltip: 'Cylinder stencil',
      icon: '<svg width="32" height="24" viewBox="0 0 32 24"><path d="M6,6 C6,3 10,2 16,2 C22,2 26,3 26,6 L26,18 C26,21 22,22 16,22 C10,22 6,21 6,18 Z" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
      dataTestId: 'cylinder-stencil-btn',
    },
    {
      id: 'cloud',
      label: 'Cloud',
      tooltip: 'Cloud stencil',
      icon: '<svg width="32" height="24" viewBox="0 0 32 24"><path d="M8,18 C4,18 2,14 4,10 C4,6 8,4 12,6 C14,4 18,4 20,6 C24,6 28,10 26,14 C30,14 30,18 26,18 Z" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
      dataTestId: 'cloud-stencil-btn',
    },
    {
      id: 'parallelogram',
      label: 'Parallelogram',
      tooltip: 'Parallelogram stencil',
      icon: '<svg width="32" height="24" viewBox="0 0 32 24"><polygon points="8,2 30,2 24,22 2,22" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
      dataTestId: 'parallelogram-stencil-btn',
    },
    {
      id: 'trapezoid',
      label: 'Trapezoid',
      tooltip: 'Trapezoid stencil',
      icon: '<svg width="32" height="24" viewBox="0 0 32 24"><polygon points="6,2 26,2 30,22 2,22" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
      dataTestId: 'trapezoid-stencil-btn',
    },
    {
      id: 'blockArrow',
      label: 'BlockArrow',
      tooltip: 'Block arrow stencil',
      icon: '<svg width="32" height="24" viewBox="0 0 32 24"><polygon points="4,8 18,8 18,2 28,12 18,22 18,16 4,16" fill="none" stroke="#F8FAFC" stroke-width="1.5"/></svg>',
      dataTestId: 'blockarrow-stencil-btn',
    },
  ];

  for (const shape of STENCIL_SHAPES) {
    const btn = document.createElement('button');
    btn.className = 'shape-btn';
    btn.title = shape.tooltip;
    btn.setAttribute('data-testid', shape.dataTestId);
    btn.setAttribute('draggable', 'true');
    btn.setAttribute('data-stencil-name', shape.id);
    btn.innerHTML = shape.icon;
    const label = document.createElement('span');
    label.className = 'shape-label';
    label.textContent = shape.label;
    btn.appendChild(label);

    if (shape.id === 'rectangle') {
      controls.rectangleStencilBtn = btn;
    } else if (shape.id === 'ellipse') {
      controls.ellipseStencilBtn = btn;
    } else if (shape.id === 'diamond') {
      controls.diamondStencilBtn = btn;
    } else if (shape.id === 'triangle') {
      controls.triangleStencilBtn = btn;
    } else if (shape.id === 'hexagon') {
      controls.hexagonStencilBtn = btn;
    } else if (shape.id === 'cylinder') {
      controls.cylinderStencilBtn = btn;
    } else if (shape.id === 'cloud') {
      controls.cloudStencilBtn = btn;
    } else if (shape.id === 'parallelogram') {
      controls.parallelogramStencilBtn = btn;
    } else if (shape.id === 'trapezoid') {
      controls.trapezoidStencilBtn = btn;
    } else if (shape.id === 'blockArrow') {
      controls.blockArrowStencilBtn = btn;
    }

    stencilGrid.appendChild(btn);
  }

  stencilCat.appendChild(stencilGrid);
  container.appendChild(stencilCat);
  container.appendChild(generalCat);

  // ─── Future categories (grayed out with lock) ───────────────────────────
  for (const cat of FUTURE_CATEGORIES) {
    const catEl = document.createElement('div');
    catEl.className = 'shape-category disabled';

    const catHeader = document.createElement('div');
    catHeader.className = 'category-header';

    const catIcon = document.createElement('span');
    catIcon.className = 'category-icon';
    catIcon.textContent = CATEGORY_ICONS[cat] ?? '📄';
    catHeader.appendChild(catIcon);

    const catTitle = document.createElement('span');
    catTitle.className = 'category-title';
    catTitle.textContent = cat;
    catHeader.appendChild(catTitle);

    const lockIcon = document.createElement('span');
    lockIcon.innerHTML = LOCK_ICON;
    catHeader.appendChild(lockIcon);

    catEl.appendChild(catHeader);

    const msg = document.createElement('div');
    msg.className = 'category-coming-soon';
    msg.textContent = 'Soon';
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
    roundedRectToolBtn: controls.roundedRectToolBtn,
    ellipseToolBtn: controls.ellipseToolBtn,
    diamondToolBtn: controls.diamondToolBtn,
    triangleToolBtn: controls.triangleToolBtn,
    hexagonToolBtn: controls.hexagonToolBtn,
    cylinderToolBtn: controls.cylinderToolBtn,
    cloudToolBtn: controls.cloudToolBtn,
    parallelogramToolBtn: controls.parallelogramToolBtn,
    trapezoidToolBtn: controls.trapezoidToolBtn,
    polygonToolBtn: controls.polygonToolBtn,
    rectangleStencilBtn: controls.rectangleStencilBtn,
    ellipseStencilBtn: controls.ellipseStencilBtn,
    diamondStencilBtn: controls.diamondStencilBtn,
    triangleStencilBtn: controls.triangleStencilBtn,
    hexagonStencilBtn: controls.hexagonStencilBtn,
    cylinderStencilBtn: controls.cylinderStencilBtn,
    cloudStencilBtn: controls.cloudStencilBtn,
    parallelogramStencilBtn: controls.parallelogramStencilBtn,
    trapezoidStencilBtn: controls.trapezoidStencilBtn,
    blockArrowStencilBtn: controls.blockArrowStencilBtn,
    collapseBtn,
  };
}
