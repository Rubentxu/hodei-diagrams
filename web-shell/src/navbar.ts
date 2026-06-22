/**
 * navbar.ts — Zone 1: Top Navigation Bar
 *
 * Builds the menu bar (File/Edit/View) + quick controls (Undo/Redo/Zoom/Save).
 * All state is in the engine; this is pure UI building and event wiring.
 */

export interface NavbarControls {
  container: HTMLElement;
  fileInput: HTMLInputElement;
  undoBtn: HTMLButtonElement;
  redoBtn: HTMLButtonElement;
  saveBtn: HTMLButtonElement;
  zoomDisplay: HTMLSpanElement;
}

export function buildNavbar(): NavbarControls {
  const container = document.createElement('div');
  container.className = 'navbar';
  container.setAttribute('data-testid', 'navbar');

  // ─── Brand ───────────────────────────────────────────────────────────────
  const brand = document.createElement('span');
  brand.className = 'navbar-brand';
  brand.textContent = 'Hodei';
  brand.setAttribute('data-testid', 'navbar-brand');
  container.appendChild(brand);

  // ─── Menu bar ────────────────────────────────────────────────────────────
  const menuBar = document.createElement('div');
  menuBar.className = 'menu-bar';

  // File menu
  const fileMenu = document.createElement('details');
  fileMenu.className = 'menu-dropdown';
  fileMenu.setAttribute('data-testid', 'menu-file');
  const fileSummary = document.createElement('summary');
  fileSummary.textContent = 'File';
  fileMenu.appendChild(fileSummary);
  const fileList = document.createElement('div');
  fileList.className = 'menu-items';

  const openItem = document.createElement('button');
  openItem.className = 'menu-item';
  openItem.textContent = 'Open .drawio';
  openItem.setAttribute('data-testid', 'menu-open');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.drawio,.xml';
  fileInput.hidden = true;
  fileInput.setAttribute('data-testid', 'file-input');
  openItem.appendChild(fileInput);
  openItem.addEventListener('click', () => fileInput.click());
  fileList.appendChild(openItem);

  const saveItem = document.createElement('button');
  saveItem.className = 'menu-item';
  saveItem.textContent = 'Save .drawio';
  saveItem.setAttribute('data-testid', 'menu-save');
  fileList.appendChild(saveItem);

  // Export submenu
  const exportItem = document.createElement('button');
  exportItem.className = 'menu-item';
  exportItem.setAttribute('data-testid', 'menu-export');
  exportItem.textContent = 'Export';
  fileList.appendChild(exportItem);

  const exportList = document.createElement('div');
  exportList.className = 'menu-items';
  exportList.style.position = 'absolute';
  exportList.style.left = '100%';
  exportList.style.top = '0';

  const svgExportItem = document.createElement('button');
  svgExportItem.className = 'menu-item';
  svgExportItem.textContent = 'SVG';
  svgExportItem.setAttribute('data-testid', 'menu-export-svg');
  exportList.appendChild(svgExportItem);
  exportItem.appendChild(exportList);

  const pngExportItem = document.createElement('button');
  pngExportItem.className = 'menu-item disabled-item';
  pngExportItem.textContent = 'PNG';
  pngExportItem.setAttribute('data-testid', 'menu-export-png');
  pngExportItem.title = 'Requires WebGPU renderer';
  exportList.appendChild(pngExportItem);

  exportItem.addEventListener('mouseenter', () => {
    exportList.style.display = 'block';
  });
  exportItem.addEventListener('mouseleave', () => {
    exportList.style.display = 'none';
  });

  // Properties item
  const propsItem = document.createElement('button');
  propsItem.className = 'menu-item';
  propsItem.textContent = 'Properties';
  propsItem.setAttribute('data-testid', 'menu-properties');
  fileList.appendChild(propsItem);

  fileMenu.appendChild(fileList);
  menuBar.appendChild(fileMenu);

  // Edit menu
  const editMenu = document.createElement('details');
  editMenu.className = 'menu-dropdown';
  editMenu.setAttribute('data-testid', 'menu-edit');
  const editSummary = document.createElement('summary');
  editSummary.textContent = 'Edit';
  editMenu.appendChild(editSummary);
  const editList = document.createElement('div');
  editList.className = 'menu-items';

  const undoItem = document.createElement('button');
  undoItem.className = 'menu-item';
  undoItem.textContent = 'Undo';
  undoItem.setAttribute('data-testid', 'menu-undo');
  editList.appendChild(undoItem);

  const redoItem = document.createElement('button');
  redoItem.className = 'menu-item';
  redoItem.textContent = 'Redo';
  redoItem.setAttribute('data-testid', 'menu-redo');
  editList.appendChild(redoItem);

  const deleteItem = document.createElement('button');
  deleteItem.className = 'menu-item';
  deleteItem.textContent = 'Delete';
  deleteItem.setAttribute('data-testid', 'menu-delete');
  editList.appendChild(deleteItem);

  editMenu.appendChild(editList);
  menuBar.appendChild(editMenu);

  // View menu
  const viewMenu = document.createElement('details');
  viewMenu.className = 'menu-dropdown';
  viewMenu.setAttribute('data-testid', 'menu-view');
  const viewSummary = document.createElement('summary');
  viewSummary.textContent = 'View';
  viewMenu.appendChild(viewSummary);
  const viewList = document.createElement('div');
  viewList.className = 'menu-items';

  const gridItem = document.createElement('button');
  gridItem.className = 'menu-item has-checkmark';
  gridItem.setAttribute('data-testid', 'menu-grid');
  gridItem.textContent = 'Grid';
  gridItem.id = 'menu-item-grid';
  viewList.appendChild(gridItem);

  const snapItem = document.createElement('button');
  snapItem.className = 'menu-item has-checkmark';
  snapItem.setAttribute('data-testid', 'menu-snap');
  snapItem.textContent = 'Snap';
  snapItem.id = 'menu-item-snap';
  viewList.appendChild(snapItem);

  const presentItem = document.createElement('button');
  presentItem.className = 'menu-item';
  presentItem.textContent = 'Present';
  presentItem.setAttribute('data-testid', 'menu-present');
  viewList.appendChild(presentItem);

  const zoomInItem = document.createElement('button');
  zoomInItem.className = 'menu-item';
  zoomInItem.textContent = 'Zoom In';
  viewList.appendChild(zoomInItem);

  const zoomOutItem = document.createElement('button');
  zoomOutItem.className = 'menu-item';
  zoomOutItem.textContent = 'Zoom Out';
  viewList.appendChild(zoomOutItem);

  const zoomResetItem = document.createElement('button');
  zoomResetItem.className = 'menu-item';
  zoomResetItem.textContent = 'Zoom Reset';
  viewList.appendChild(zoomResetItem);

  viewMenu.appendChild(viewList);
  menuBar.appendChild(viewMenu);

  container.appendChild(menuBar);

  // ─── Quick controls ───────────────────────────────────────────────────────
  const quickControls = document.createElement('div');
  quickControls.className = 'quick-controls';

  // Open button (triggers the hidden file input)
  const openBtn = document.createElement('button');
  openBtn.className = 'quick-btn';
  openBtn.textContent = 'Open';
  openBtn.title = 'Open .drawio file';
  openBtn.setAttribute('data-testid', 'open-btn');
  openBtn.addEventListener('click', () => fileInput.click());
  quickControls.appendChild(openBtn);

  // Undo button
  const undoBtn = document.createElement('button');
  undoBtn.className = 'quick-btn';
  undoBtn.textContent = '↩';
  undoBtn.title = 'Undo (Ctrl+Z)';
  undoBtn.disabled = true;
  undoBtn.setAttribute('data-testid', 'undo-btn');
  quickControls.appendChild(undoBtn);

  // Redo button
  const redoBtn = document.createElement('button');
  redoBtn.className = 'quick-btn';
  redoBtn.textContent = '↪';
  redoBtn.title = 'Redo (Ctrl+Y)';
  redoBtn.disabled = true;
  redoBtn.setAttribute('data-testid', 'redo-btn');
  quickControls.appendChild(redoBtn);

  // Separator
  const sep1 = document.createElement('span');
  sep1.className = 'quick-sep';
  quickControls.appendChild(sep1);

  // Zoom display
  const zoomDisplay = document.createElement('span');
  zoomDisplay.className = 'zoom-display';
  zoomDisplay.textContent = '100%';
  zoomDisplay.setAttribute('data-testid', 'zoom-display');
  quickControls.appendChild(zoomDisplay);

  // Separator
  const sep2 = document.createElement('span');
  sep2.className = 'quick-sep';
  quickControls.appendChild(sep2);

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'quick-btn save-btn';
  saveBtn.textContent = 'Save';
  saveBtn.title = 'Save .drawio';
  saveBtn.disabled = true;
  saveBtn.setAttribute('data-testid', 'save-btn');
  quickControls.appendChild(saveBtn);

  container.appendChild(quickControls);

  return {
    container,
    fileInput,
    undoBtn,
    redoBtn,
    saveBtn,
    zoomDisplay,
  };
}
