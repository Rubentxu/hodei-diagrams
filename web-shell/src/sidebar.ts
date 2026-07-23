/**
 * sidebar.ts — Zone 2: Left Sidebar (collapsible)
 *
 * Shape palette with categories. "General" has 3 functional shapes.
 * Future categories are grayed out with lock icon + "Soon".
 * Collapse state persisted in localStorage.
 */

import type { StencilLibraryManager } from './stencil-library-manager.js';

import type { DockMode } from './workbench-controller.js';

export interface SidebarControls {
  container: HTMLElement;
  layersPanel: HTMLElement;
  dockHistory: HTMLElement;
  addLayerBtn: HTMLButtonElement;
  setDockMode: (_mode: DockMode) => void;
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

import { categoryIcon } from './icon';

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

export function buildSidebar(stencilManager?: StencilLibraryManager): SidebarControls {
  const container = document.createElement('div');
  container.className = 'sidebar';
  container.setAttribute('data-testid', 'sidebar');
  // R3: drawer-specific identifier (separate from legacy 'sidebar' testid)
  container.setAttribute('data-drawer-testid', 'drawer-sidebar');
  // R1c: Observable dock mode state marker for E2E testing
  container.setAttribute('data-dock-mode', 'shapes');

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
  // R3: drawer close button identifier
  collapseBtn.setAttribute('data-drawer-testid', 'drawer-close-sidebar');
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

  // ─── Dock Mode Containers (R1b) ─────────────────────────────────────────
  // .dock-mode-shapes: shapes/search/stencils content (default visible)
  const dockShapes = document.createElement('div');
  dockShapes.className = 'dock-mode-shapes dock-mode';

  // .dock-mode-layers: layers panel content
  const dockLayers = document.createElement('div');
  dockLayers.className = 'dock-mode-layers dock-mode';
  dockLayers.setAttribute('data-testid', 'dock-layers');

  // .dock-mode-history: history panel (R1c)
  const dockHistory = document.createElement('div');
  dockHistory.className = 'dock-mode-history dock-mode';
  dockHistory.setAttribute('data-testid', 'dock-history');

  // Layers Panel (IP-F PR5) — lives inside dock-mode-layers
  const layersPanel = document.createElement('div');
  layersPanel.className = 'layers-panel';
  layersPanel.setAttribute('data-testid', 'layers-panel');

  // Add Layer button
  const addLayerBtn = document.createElement('button');
  addLayerBtn.className = 'sidebar-btn';
  addLayerBtn.textContent = '+ Add Layer';
  addLayerBtn.setAttribute('data-testid', 'layers-add-layer');
  layersPanel.appendChild(addLayerBtn);

  // Layers list container (populated dynamically via buildDockLayers)
  const layersList = document.createElement('div');
  layersList.className = 'layers-list';
  layersPanel.appendChild(layersList);

  dockLayers.appendChild(layersPanel);
  container.appendChild(dockShapes);
  container.appendChild(dockLayers);
  container.appendChild(dockHistory);

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
  dockShapes.appendChild(searchWrap);

  // ─── Search filter logic ────────────────────────────────────────────────
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();

    // Show/hide all category headers
    const categoryHeaders = container.querySelectorAll<HTMLElement>('.category-header');
    categoryHeaders.forEach((el) => {
      el.style.display = query ? 'none' : '';
    });

    // Show/hide "Coming Soon" messages
    const comingSoonMsgs = container.querySelectorAll<HTMLElement>('.category-coming-soon');
    comingSoonMsgs.forEach((el) => {
      el.style.display = query ? 'none' : '';
    });

    // Open "More Shapes" accordion if query matches future category names
    const futureTitles = container.querySelectorAll<HTMLElement>('.more-shapes-content .category-title');
    let hasFutureMatch = false;
    futureTitles.forEach((el) => {
      const match = el.textContent?.toLowerCase().includes(query);
      if (match) hasFutureMatch = true;
    });

    const moreShapesDetails = container.querySelector('.more-shapes-accordion') as HTMLDetailsElement | null;
    if (query && hasFutureMatch) {
      if (moreShapesDetails) moreShapesDetails.open = true;
    } else if (!query) {
      // Restore to localStorage preference
      if (moreShapesDetails) {
        try {
          moreShapesDetails.open = localStorage.getItem('hodei:more-shapes-open') === 'true';
        } catch {
          moreShapesDetails.open = false;
        }
      }
    }

    // Filter shape buttons
    const allShapeBtns = container.querySelectorAll<HTMLElement>('.shape-btn');
    allShapeBtns.forEach((btn) => {
      const label = btn.querySelector('.shape-label');
      const text = label?.textContent?.toLowerCase() || '';
      const shapeAttr = btn.getAttribute('data-stencil-name')?.toLowerCase() || '';
      const match = text.includes(query) || shapeAttr.includes(query);
      btn.style.display = match ? '' : 'none';
    });
  });

  // ─── General category ────────────────────────────────────────────────────
  const generalCat = document.createElement('div');
  generalCat.className = 'shape-category';

  const generalHeader = document.createElement('div');
  generalHeader.className = 'category-header';

  const generalIcon = document.createElement('span');
  generalIcon.className = 'category-icon';
  generalIcon.innerHTML = categoryIcon('General');
  generalHeader.appendChild(generalIcon);

  const generalTitle = document.createElement('span');
  generalTitle.className = 'category-title';
  generalTitle.textContent = 'General';
  generalHeader.appendChild(generalTitle);

  const generalCount = document.createElement('span');
  generalCount.className = 'category-count';
  generalCount.setAttribute('data-testid', 'category-count-general');
  generalCount.textContent = '11';
  generalHeader.appendChild(generalCount);

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
  dockShapes.appendChild(generalCat);

  // ─── Dynamic stencil categories ─────────────────────────────────────────
  // Container for dynamically rendered library categories (replaced on manager changes)
  const dynamicStencilContainer = document.createElement('div');
  dynamicStencilContainer.setAttribute('data-testid', 'dynamic-stencil-categories');
  dockShapes.appendChild(dynamicStencilContainer);

  // Hidden file input for loading additional stencil libraries
  const hiddenFileInput = document.createElement('input');
  hiddenFileInput.type = 'file';
  hiddenFileInput.accept = '.xml';
  hiddenFileInput.style.display = 'none';
  hiddenFileInput.setAttribute('data-testid', 'stencil-file-input');
  container.appendChild(hiddenFileInput);

  /**
   * Render all stencil library categories from the manager's current state.
   * Replaces all content in dynamicStencilContainer.
   */
  function renderDynamicStencilCategories(): void {
    dynamicStencilContainer.innerHTML = '';

    if (!stencilManager) return;

    const libraries = stencilManager.getLibraries();

    // Render each library as a collapsible category
    for (const [libName, shapes] of libraries) {
      const cat = document.createElement('div');
      cat.className = 'shape-category';

      // Category header
      const catHeader = document.createElement('div');
      catHeader.className = 'category-header';

      const catIcon = document.createElement('span');
      catIcon.className = 'category-icon';
      catIcon.innerHTML = categoryIcon(libName);
      catHeader.appendChild(catIcon);

      const catTitle = document.createElement('span');
      catTitle.className = 'category-title';
      catTitle.textContent = libName.charAt(0).toUpperCase() + libName.slice(1);
      catHeader.appendChild(catTitle);

      const catCount = document.createElement('span');
      catCount.className = 'category-count';
      catCount.setAttribute('data-testid', `category-count-${libName}`);
      catCount.textContent = String(shapes.length);
      catHeader.appendChild(catCount);

      cat.appendChild(catHeader);

      // Shape grid
      const grid = document.createElement('div');
      grid.className = 'shape-grid';

      if (shapes.length === 0) {
        const emptyMsg = document.createElement('span');
        emptyMsg.className = 'category-coming-soon';
        emptyMsg.textContent = 'No shapes in this library';
        grid.appendChild(emptyMsg);
      } else {
        for (const shape of shapes) {
          const btn = document.createElement('button');
          btn.className = 'shape-btn';
          btn.title = shape.name;
          btn.setAttribute('data-testid', `shape-${libName}-${shape.name}`);
          // Placeholder icon: square with shape initial inside
          const initial = shape.name.charAt(0).toUpperCase();
          btn.innerHTML = `<svg width="32" height="24" viewBox="0 0 32 24">
            <rect x="2" y="2" width="28" height="20" rx="2"
              fill="none" stroke="#F8FAFC" stroke-width="1.5"/>
            <text x="16" y="16" text-anchor="middle" dominant-baseline="middle"
              font-size="10" fill="#F8FAFC" font-family="monospace">${initial}</text>
          </svg>`;
          const label = document.createElement('span');
          label.className = 'shape-label';
          label.textContent = shape.name;
          btn.appendChild(label);

          // Click to add shape at canvas center (future: drag-and-drop)
          btn.addEventListener('click', (e) => {
            // IP-C: Pass modifier state to the stencil-shape-activate handler
            // so main.ts can branch on Shift/Alt for ignore-default, bottom-left,
            // replace-selected, insert-and-connect.
            const me = e as MouseEvent;
            const event = new CustomEvent('stencil-shape-activate', {
              bubbles: true,
              detail: {
                library: libName,
                name: shape.name,
                shiftKey: me.shiftKey,
                altKey: me.altKey,
              },
            });
            container.dispatchEvent(event);
          });

          grid.appendChild(btn);
        }
      }

      cat.appendChild(grid);
      dynamicStencilContainer.appendChild(cat);
    }
  }

  // Initial render and subscribe to manager changes
  if (stencilManager) {
    renderDynamicStencilCategories();
    const _unsubscribe = stencilManager.subscribe(renderDynamicStencilCategories);
    // Note: unsubscribe is intentionally not called — manager lives for the session lifetime
  }

  // ─── Future categories → collapsible "More Shapes" accordion ─────────────
  // Warn once if duplicate keys exist (Databases and Database map to same icon)
  const seenCats = new Set<string>();
  for (const cat of FUTURE_CATEGORIES) {
    if (seenCats.has(cat)) {
      console.warn(`[sidebar] Duplicate category key: "${cat}" — both map to the same SVG icon`);
    }
    seenCats.add(cat);
  }

  // Accordion wrapper (closed by default)
  const moreShapesDetails = document.createElement('details');
  moreShapesDetails.className = 'more-shapes-accordion';

  // Accordion header
  const moreShapesSummary = document.createElement('summary');
  moreShapesSummary.className = 'more-shapes-btn';

  const moreShapesLabel = document.createElement('span');
  moreShapesLabel.textContent = '+ More Shapes';
  moreShapesSummary.appendChild(moreShapesLabel);

  const moreShapesChevron = document.createElement('span');
  moreShapesChevron.className = 'more-shapes-chevron';
  moreShapesChevron.textContent = '▼';
  moreShapesSummary.appendChild(moreShapesChevron);

  moreShapesDetails.appendChild(moreShapesSummary);

  // Accordion content: all future categories in a scrollable list
  const moreShapesContent = document.createElement('div');
  moreShapesContent.className = 'more-shapes-content';

  for (const cat of FUTURE_CATEGORIES) {
    const catEl = document.createElement('div');
    catEl.className = 'shape-category disabled';

    const catHeader = document.createElement('div');
    catHeader.className = 'category-header';
    const slug = cat.toLowerCase().replace(/\s+/g, '-');
    catHeader.setAttribute('data-testid', `category-header-${slug}`);

    const catIcon = document.createElement('span');
    catIcon.className = 'category-icon';
    catIcon.innerHTML = categoryIcon(cat);
    catHeader.appendChild(catIcon);

    const catTitle = document.createElement('span');
    catTitle.className = 'category-title';
    catTitle.textContent = cat;
    catHeader.appendChild(catTitle);

    const catCount = document.createElement('span');
    catCount.className = 'category-count category-coming-soon';
    catCount.setAttribute('data-testid', `category-count-${slug}`);
    catCount.textContent = '0';
    catHeader.appendChild(catCount);

    const lockIcon = document.createElement('span');
    lockIcon.innerHTML = LOCK_ICON;
    catHeader.appendChild(lockIcon);

    catEl.appendChild(catHeader);

    const msg = document.createElement('div');
    msg.className = 'category-coming-soon';
    msg.textContent = 'Available soon';
    catEl.appendChild(msg);

    moreShapesContent.appendChild(catEl);
  }

  moreShapesDetails.appendChild(moreShapesContent);
  dockShapes.appendChild(moreShapesDetails);

  // Wire accordion open/close + chevron rotation + localStorage
  function updateMoreShapesState(open: boolean) {
    moreShapesDetails.open = open;
    moreShapesChevron.textContent = open ? '▲' : '▼';
    try {
      localStorage.setItem('hodei:more-shapes-open', String(open));
    } catch {
      // localStorage unavailable
    }
  }

  moreShapesSummary.addEventListener('click', (e) => {
    e.preventDefault();
    updateMoreShapesState(!moreShapesDetails.open);
  });

  // Restore persisted state
  try {
    if (localStorage.getItem('hodei:more-shapes-open') === 'true') {
      updateMoreShapesState(true);
    }
  } catch {
    // localStorage unavailable
  }

  // ─── Load custom stencils link ─────────────────────────────────────────
  const loadStencilsLink = document.createElement('button');
  loadStencilsLink.className = 'load-stencils-btn';
  loadStencilsLink.textContent = 'Load stencils from file…';
  dockShapes.appendChild(loadStencilsLink);

  loadStencilsLink.addEventListener('click', () => {
    hiddenFileInput.value = '';
    hiddenFileInput.click();
  });

  hiddenFileInput.addEventListener('change', async () => {
    if (!stencilManager) return;
    const files = hiddenFileInput.files;
    if (!files || files.length === 0) return;
    const file = files[0]!;
    const name = file.name.replace(/\.xml$/i, '');
    try {
      await stencilManager.loadFromFile(name, file);
    } catch (e) {
      window.alert(`Failed to load stencil library: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  // ─── Dock Mode Switching (R1b/R1c) ───────────────────────────────────────
  function setDockMode(mode: DockMode): void {
    // R1c: Use data-dock-mode attribute as observable state marker
    container.setAttribute('data-dock-mode', mode);
    dockShapes.style.display = mode === 'shapes' ? '' : 'none';
    dockLayers.style.display = mode === 'layers' ? '' : 'none';
    dockHistory.style.display = mode === 'history' ? '' : 'none';
  }

  // Initially show shapes mode
  setDockMode('shapes');

  return {
    container,
    layersPanel,
    dockHistory,
    addLayerBtn,
    setDockMode,
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
