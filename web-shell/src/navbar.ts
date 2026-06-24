/**
 * navbar.ts — Zone 1: Top Navigation Bar
 *
 * Builds the menu bar (File/Edit/View) + quick controls (Undo/Redo/Zoom/Save).
 * All state is in the engine; this is pure UI building and event wiring.
 */

import { ICONS } from './icon.js';
import type { DiagramEngineSession } from './session.js';
import type { Editor } from './editor.js';
import type { SlotmapId } from './types.js';

export interface NavbarControls {
  container: HTMLElement;
  fileInput: HTMLInputElement;
  undoBtn: HTMLButtonElement;
  redoBtn: HTMLButtonElement;
  saveBtn: HTMLButtonElement;
  zoomDisplay: HTMLSpanElement;
  toolbar: ToolbarControls;
}

/** Toolbar controls exposed for wiring in main.ts */
export interface ToolbarControls {
  container: HTMLElement;
  setEditor(editor: Editor): void;
  update(selection: readonly SlotmapId[]): void;
}

export function buildNavbar(session: DiagramEngineSession): NavbarControls {
  const container = document.createElement('div');
  container.className = 'navbar';
  container.setAttribute('data-testid', 'navbar');

  // ─── Brand ───────────────────────────────────────────────────────────────
  const brand = document.createElement('span');
  brand.className = 'navbar-brand';
  brand.innerHTML = ICONS.BRAND;
  brand.setAttribute('data-testid', 'navbar-brand');
  brand.setAttribute('aria-label', 'Hodei Diagrams');
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
  pngExportItem.className = 'menu-item';
  pngExportItem.textContent = 'PNG';
  pngExportItem.setAttribute('data-testid', 'menu-export-png');
  pngExportItem.title = 'Export diagram as PNG';
  exportList.appendChild(pngExportItem);

  const pdfExportItem = document.createElement('button');
  pdfExportItem.className = 'menu-item';
  pdfExportItem.textContent = 'PDF';
  pdfExportItem.setAttribute('data-testid', 'menu-export-pdf');
  pdfExportItem.title = 'Export diagram as PDF via browser print';
  exportList.appendChild(pdfExportItem);

  const htmlExportItem = document.createElement('button');
  htmlExportItem.className = 'menu-item';
  htmlExportItem.textContent = 'HTML';
  htmlExportItem.setAttribute('data-testid', 'menu-export-html');
  htmlExportItem.title = 'Export diagram as standalone HTML file';
  exportList.appendChild(htmlExportItem);

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

  // ─── Arrange menu ──────────────────────────────────────────────────────────
  const arrangeMenu = document.createElement('details');
  arrangeMenu.className = 'menu-dropdown';
  arrangeMenu.setAttribute('data-testid', 'menu-arrange');
  const arrangeSummary = document.createElement('summary');
  arrangeSummary.textContent = 'Arrange';
  arrangeMenu.appendChild(arrangeSummary);
  const arrangeList = document.createElement('div');
  arrangeList.className = 'menu-items';

  // Z-order items
  const toFrontItem = document.createElement('button');
  toFrontItem.className = 'menu-item';
  toFrontItem.textContent = 'To Front';
  toFrontItem.setAttribute('data-testid', 'menu-bring-front');
  arrangeList.appendChild(toFrontItem);

  const toBackItem = document.createElement('button');
  toBackItem.className = 'menu-item';
  toBackItem.textContent = 'To Back';
  toBackItem.setAttribute('data-testid', 'menu-send-back');
  arrangeList.appendChild(toBackItem);

  const forwardItem = document.createElement('button');
  forwardItem.className = 'menu-item';
  forwardItem.textContent = 'Forward';
  forwardItem.setAttribute('data-testid', 'menu-bring-forward');
  arrangeList.appendChild(forwardItem);

  const backwardItem = document.createElement('button');
  backwardItem.className = 'menu-item';
  backwardItem.textContent = 'Backward';
  backwardItem.setAttribute('data-testid', 'menu-send-backward');
  arrangeList.appendChild(backwardItem);

  // Align submenu
  const alignItem = document.createElement('button');
  alignItem.className = 'menu-item';
  alignItem.setAttribute('data-testid', 'menu-arrange-align');
  alignItem.textContent = 'Align';
  arrangeList.appendChild(alignItem);

  const alignList = document.createElement('div');
  alignList.className = 'menu-items';
  alignList.style.position = 'absolute';
  alignList.style.left = '100%';
  alignList.style.top = '0';

  const alignLeftItem = document.createElement('button');
  alignLeftItem.className = 'menu-item';
  alignLeftItem.textContent = 'Left';
  alignLeftItem.setAttribute('data-testid', 'menu-align-left');
  alignList.appendChild(alignLeftItem);

  const alignCenterHItem = document.createElement('button');
  alignCenterHItem.className = 'menu-item';
  alignCenterHItem.textContent = 'Center';
  alignCenterHItem.setAttribute('data-testid', 'menu-align-center');
  alignList.appendChild(alignCenterHItem);

  const alignRightItem = document.createElement('button');
  alignRightItem.className = 'menu-item';
  alignRightItem.textContent = 'Right';
  alignRightItem.setAttribute('data-testid', 'menu-align-right');
  alignList.appendChild(alignRightItem);

  const alignTopItem = document.createElement('button');
  alignTopItem.className = 'menu-item';
  alignTopItem.textContent = 'Top';
  alignTopItem.setAttribute('data-testid', 'menu-align-top');
  alignList.appendChild(alignTopItem);

  const alignMiddleItem = document.createElement('button');
  alignMiddleItem.className = 'menu-item';
  alignMiddleItem.textContent = 'Middle';
  alignMiddleItem.setAttribute('data-testid', 'menu-align-middle');
  alignList.appendChild(alignMiddleItem);

  const alignBottomItem = document.createElement('button');
  alignBottomItem.className = 'menu-item';
  alignBottomItem.textContent = 'Bottom';
  alignBottomItem.setAttribute('data-testid', 'menu-align-bottom');
  alignList.appendChild(alignBottomItem);

  alignItem.appendChild(alignList);
  alignItem.addEventListener('mouseenter', () => {
    alignList.style.display = 'block';
  });
  alignItem.addEventListener('mouseleave', () => {
    alignList.style.display = 'none';
  });

  // Distribute submenu
  const distributeItem = document.createElement('button');
  distributeItem.className = 'menu-item';
  distributeItem.setAttribute('data-testid', 'menu-arrange-distribute');
  distributeItem.textContent = 'Distribute';
  arrangeList.appendChild(distributeItem);

  const distributeList = document.createElement('div');
  distributeList.className = 'menu-items';
  distributeList.style.position = 'absolute';
  distributeList.style.left = '100%';
  distributeList.style.top = '0';

  const distributeHItem = document.createElement('button');
  distributeHItem.className = 'menu-item';
  distributeHItem.textContent = 'Horizontal';
  distributeHItem.setAttribute('data-testid', 'menu-distribute-h');
  distributeList.appendChild(distributeHItem);

  const distributeVItem = document.createElement('button');
  distributeVItem.className = 'menu-item';
  distributeVItem.textContent = 'Vertical';
  distributeVItem.setAttribute('data-testid', 'menu-distribute-v');
  distributeList.appendChild(distributeVItem);

  distributeItem.appendChild(distributeList);
  distributeItem.addEventListener('mouseenter', () => {
    distributeList.style.display = 'block';
  });
  distributeItem.addEventListener('mouseleave', () => {
    distributeList.style.display = 'none';
  });

  // Rotate submenu
  const rotateItem = document.createElement('button');
  rotateItem.className = 'menu-item';
  rotateItem.setAttribute('data-testid', 'menu-arrange-rotate');
  rotateItem.textContent = 'Rotate';
  arrangeList.appendChild(rotateItem);

  const rotateList = document.createElement('div');
  rotateList.className = 'menu-items';
  rotateList.style.position = 'absolute';
  rotateList.style.left = '100%';
  rotateList.style.top = '0';

  const rotateCwItem = document.createElement('button');
  rotateCwItem.className = 'menu-item';
  rotateCwItem.textContent = '90° CW';
  rotateCwItem.setAttribute('data-testid', 'menu-rotate-cw');
  rotateList.appendChild(rotateCwItem);

  const rotateCcwItem = document.createElement('button');
  rotateCcwItem.className = 'menu-item';
  rotateCcwItem.textContent = '90° CCW';
  rotateCcwItem.setAttribute('data-testid', 'menu-rotate-ccw');
  rotateList.appendChild(rotateCcwItem);

  rotateItem.appendChild(rotateList);
  rotateItem.addEventListener('mouseenter', () => {
    rotateList.style.display = 'block';
  });
  rotateItem.addEventListener('mouseleave', () => {
    rotateList.style.display = 'none';
  });

  // Flip submenu
  const flipItem = document.createElement('button');
  flipItem.className = 'menu-item';
  flipItem.setAttribute('data-testid', 'menu-arrange-flip');
  flipItem.textContent = 'Flip';
  arrangeList.appendChild(flipItem);

  const flipList = document.createElement('div');
  flipList.className = 'menu-items';
  flipList.style.position = 'absolute';
  flipList.style.left = '100%';
  flipList.style.top = '0';

  const flipHItem = document.createElement('button');
  flipHItem.className = 'menu-item';
  flipHItem.textContent = 'Horizontal';
  flipHItem.setAttribute('data-testid', 'menu-flip-h');
  flipList.appendChild(flipHItem);

  const flipVItem = document.createElement('button');
  flipVItem.className = 'menu-item';
  flipVItem.textContent = 'Vertical';
  flipVItem.setAttribute('data-testid', 'menu-flip-v');
  flipList.appendChild(flipVItem);

  flipItem.appendChild(flipList);
  flipItem.addEventListener('mouseenter', () => {
    flipList.style.display = 'block';
  });
  flipItem.addEventListener('mouseleave', () => {
    flipList.style.display = 'none';
  });

  // Separator
  const separator = document.createElement('hr');
  separator.setAttribute('data-testid', 'menu-arrange-separator');
  separator.style.border = 'none';
  separator.style.borderTop = '1px solid var(--border)';
  separator.style.margin = '4px 0';
  arrangeList.appendChild(separator);

  // Layout submenu
  const layoutItem = document.createElement('button');
  layoutItem.className = 'menu-item';
  layoutItem.setAttribute('data-testid', 'menu-arrange-layout');
  layoutItem.textContent = 'Layout';
  arrangeList.appendChild(layoutItem);

  const layoutList = document.createElement('div');
  layoutList.className = 'menu-items';
  layoutList.style.position = 'absolute';
  layoutList.style.left = '100%';
  layoutList.style.top = '0';

  const layoutTreeItem = document.createElement('button');
  layoutTreeItem.className = 'menu-item';
  layoutTreeItem.textContent = 'Tree';
  layoutTreeItem.setAttribute('data-testid', 'menu-layout-tree');
  layoutList.appendChild(layoutTreeItem);

  const layoutHierarchicalItem = document.createElement('button');
  layoutHierarchicalItem.className = 'menu-item';
  layoutHierarchicalItem.textContent = 'Hierarchical';
  layoutHierarchicalItem.setAttribute('data-testid', 'menu-layout-hierarchical');
  layoutList.appendChild(layoutHierarchicalItem);

  const layoutOrganicItem = document.createElement('button');
  layoutOrganicItem.className = 'menu-item';
  layoutOrganicItem.textContent = 'Organic';
  layoutOrganicItem.setAttribute('data-testid', 'menu-layout-organic');
  layoutList.appendChild(layoutOrganicItem);

  const layoutCircularItem = document.createElement('button');
  layoutCircularItem.className = 'menu-item';
  layoutCircularItem.textContent = 'Circular';
  layoutCircularItem.setAttribute('data-testid', 'menu-layout-circular');
  layoutList.appendChild(layoutCircularItem);

  const layoutGridItem = document.createElement('button');
  layoutGridItem.className = 'menu-item';
  layoutGridItem.textContent = 'Grid';
  layoutGridItem.setAttribute('data-testid', 'menu-layout-grid');
  layoutList.appendChild(layoutGridItem);

  layoutItem.appendChild(layoutList);
  layoutItem.addEventListener('mouseenter', () => {
    layoutList.style.display = 'block';
  });
  layoutItem.addEventListener('mouseleave', () => {
    layoutList.style.display = 'none';
  });

  // Re-route Edges item
  const rerouteEdgesItem = document.createElement('button');
  rerouteEdgesItem.className = 'menu-item';
  rerouteEdgesItem.textContent = 'Re-route Edges';
  rerouteEdgesItem.setAttribute('data-testid', 'menu-reroute-edges');
  arrangeList.appendChild(rerouteEdgesItem);

  // Disabled items: Group, Ungroup
  const groupItem = document.createElement('button');
  groupItem.className = 'menu-item';
  groupItem.textContent = 'Group';
  groupItem.setAttribute('data-testid', 'menu-group');
  groupItem.disabled = true;
  groupItem.title = 'Grouping requires a group to be selected';
  arrangeList.appendChild(groupItem);

  const ungroupItem = document.createElement('button');
  ungroupItem.className = 'menu-item';
  ungroupItem.textContent = 'Ungroup';
  ungroupItem.setAttribute('data-testid', 'menu-ungroup');
  ungroupItem.disabled = true;
  ungroupItem.title = 'Ungrouping requires a group to be selected';
  arrangeList.appendChild(ungroupItem);

  arrangeMenu.appendChild(arrangeList);
  menuBar.appendChild(arrangeMenu);

  // ─── Extras menu ──────────────────────────────────────────────────────────
  const extrasMenu = document.createElement('details');
  extrasMenu.className = 'menu-dropdown';
  extrasMenu.setAttribute('data-testid', 'menu-extras');
  const extrasSummary = document.createElement('summary');
  extrasSummary.textContent = 'Extras';
  extrasMenu.appendChild(extrasSummary);
  const extrasList = document.createElement('div');
  extrasList.className = 'menu-items';

  const editXmlItem = document.createElement('button');
  editXmlItem.className = 'menu-item';
  editXmlItem.textContent = 'Edit XML';
  editXmlItem.setAttribute('data-testid', 'menu-edit-xml');
  editXmlItem.disabled = true;
  editXmlItem.title = 'XML editor not yet available';
  extrasList.appendChild(editXmlItem);

  const copySvgItem = document.createElement('button');
  copySvgItem.className = 'menu-item';
  copySvgItem.textContent = 'Copy as SVG';
  copySvgItem.setAttribute('data-testid', 'menu-copy-svg');
  copySvgItem.disabled = true;
  copySvgItem.title = 'Copy as SVG not yet available';
  extrasList.appendChild(copySvgItem);

  const preferencesItem = document.createElement('button');
  preferencesItem.className = 'menu-item';
  preferencesItem.textContent = 'Preferences';
  preferencesItem.setAttribute('data-testid', 'menu-preferences');
  preferencesItem.disabled = true;
  preferencesItem.title = 'Preferences not yet available';
  extrasList.appendChild(preferencesItem);

  extrasMenu.appendChild(extrasList);
  menuBar.appendChild(extrasMenu);

  // ─── Help menu ────────────────────────────────────────────────────────────
  const helpMenu = document.createElement('details');
  helpMenu.className = 'menu-dropdown';
  helpMenu.setAttribute('data-testid', 'menu-help');
  const helpSummary = document.createElement('summary');
  helpSummary.textContent = 'Help';
  helpMenu.appendChild(helpSummary);
  const helpList = document.createElement('div');
  helpList.className = 'menu-items';

  const shortcutsItem = document.createElement('button');
  shortcutsItem.className = 'menu-item';
  shortcutsItem.textContent = 'Keyboard Shortcuts';
  shortcutsItem.setAttribute('data-testid', 'menu-shortcuts');
  helpList.appendChild(shortcutsItem);

  const aboutItem = document.createElement('button');
  aboutItem.className = 'menu-item';
  aboutItem.textContent = 'About';
  aboutItem.setAttribute('data-testid', 'menu-about');
  helpList.appendChild(aboutItem);

  helpMenu.appendChild(helpList);
  menuBar.appendChild(helpMenu);

  // Wrap menu bar and quick controls in the top row
  const navbarTopRow = document.createElement('div');
  navbarTopRow.className = 'navbar-top-row';

  navbarTopRow.appendChild(menuBar);
  container.appendChild(navbarTopRow);

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
  undoBtn.innerHTML = ICONS.UNDO;
  undoBtn.title = 'Undo (Ctrl+Z)';
  undoBtn.disabled = true;
  undoBtn.setAttribute('data-testid', 'undo-btn');
  quickControls.appendChild(undoBtn);

  // Redo button
  const redoBtn = document.createElement('button');
  redoBtn.className = 'quick-btn';
  redoBtn.innerHTML = ICONS.REDO;
  redoBtn.title = 'Redo (Ctrl+Y)';
  redoBtn.disabled = true;
  redoBtn.setAttribute('data-testid', 'redo-btn');
  quickControls.appendChild(redoBtn);

  // Visual separator between Undo/Redo and Zoom/Save
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

  navbarTopRow.appendChild(quickControls);

  // ─── Toolbar (Zone 1.5) ───────────────────────────────────────────────────
  const toolbarContainer = document.createElement('div');
  toolbarContainer.className = 'toolbar';
  toolbarContainer.setAttribute('data-testid', 'toolbar');

  let activeEditor: Editor | null = null;

  // Helper: create a toolbar button
  function makeToolbarBtn(testId: string, label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'toolbar-btn';
    btn.setAttribute('data-testid', testId);
    btn.title = label;
    btn.disabled = true;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      if (!btn.disabled && activeEditor) {
        onClick();
      }
    });
    return btn;
  }

  // Helper: create a toolbar separator
  function makeToolbarSep(): HTMLElement {
    const sep = document.createElement('div');
    sep.className = 'toolbar-sep';
    return sep;
  }

  // Fill color button (input type=color styled as swatch)
  const fillInput = document.createElement('input');
  fillInput.type = 'color';
  fillInput.value = '#ffffff';
  fillInput.className = 'toolbar-btn toolbar-btn--color-swatch';
  fillInput.setAttribute('data-testid', 'toolbar-fill');
  fillInput.title = 'Fill color';
  fillInput.disabled = true;
  fillInput.addEventListener('input', () => {
    if (activeEditor && activeEditor.selection.length > 0) {
      const id = activeEditor.selection[0]!;
      const cmd = JSON.stringify({
        ChangeStyle: {
          id: { idx: id.idx, version: id.version },
          style: { fillColor: fillInput.value },
        },
      });
      const r = session.executeCommand(cmd);
      if (!r.ok) console.warn('[toolbar] Fill color failed:', r.error);
    }
  });

  // Stroke color button (input type=color styled as swatch)
  const strokeInput = document.createElement('input');
  strokeInput.type = 'color';
  strokeInput.value = '#000000';
  strokeInput.className = 'toolbar-btn toolbar-btn--color-swatch';
  strokeInput.setAttribute('data-testid', 'toolbar-stroke');
  strokeInput.title = 'Stroke color';
  strokeInput.disabled = true;
  strokeInput.addEventListener('input', () => {
    if (activeEditor && activeEditor.selection.length > 0) {
      const id = activeEditor.selection[0]!;
      const cmd = JSON.stringify({
        ChangeStyle: {
          id: { idx: id.idx, version: id.version },
          style: { strokeColor: strokeInput.value },
        },
      });
      const r = session.executeCommand(cmd);
      if (!r.ok) console.warn('[toolbar] Stroke color failed:', r.error);
    }
  });

  // Bold button
  const boldBtn = makeToolbarBtn('toolbar-bold', 'Bold', () => {
    if (!activeEditor || activeEditor.selection.length === 0) return;
    const id = activeEditor.selection[0]!;
    const style = activeEditor.getResolvedStyle(id);
    const currentBold = style?.remaining['bold'] === '1';
    const newBold = !currentBold;
    const cmd = JSON.stringify({
      ChangeStyle: {
        id: { idx: id.idx, version: id.version },
        style: { bold: newBold ? '1' : '0' },
      },
    });
    const r = session.executeCommand(cmd);
    if (!r.ok) console.warn('[toolbar] Bold toggle failed:', r.error);
    // Update active class immediately since we know the new state
    boldBtn.classList.toggle('--active', newBold);
  });

  // Italic button
  const italicBtn = makeToolbarBtn('toolbar-italic', 'Italic', () => {
    if (!activeEditor || activeEditor.selection.length === 0) return;
    const id = activeEditor.selection[0]!;
    const style = activeEditor.getResolvedStyle(id);
    const currentItalic = style?.remaining['italic'] === '1';
    const newItalic = !currentItalic;
    const cmd = JSON.stringify({
      ChangeStyle: {
        id: { idx: id.idx, version: id.version },
        style: { italic: newItalic ? '1' : '0' },
      },
    });
    const r = session.executeCommand(cmd);
    if (!r.ok) console.warn('[toolbar] Italic toggle failed:', r.error);
    // Update active class immediately since we know the new state
    italicBtn.classList.toggle('--active', newItalic);
  });

  // Delete button
  const deleteBtn = makeToolbarBtn('toolbar-delete', 'Delete', () => {
    if (!activeEditor) return;
    const ids = activeEditor.selection;
    if (ids.length === 0) return;
    const commands: string[] = [];
    for (const id of ids) {
      commands.push(
        JSON.stringify({
          RemoveVertex: { id: { idx: id.idx, version: id.version } },
        }),
      );
    }
    if (commands.length > 0) {
      const r = session.executeCommands(commands);
      if (!r.ok) console.warn('[toolbar] Delete failed:', r.error);
    }
  });

  // To Front button
  const frontBtn = makeToolbarBtn('toolbar-front', 'To Front', () => {
    if (!activeEditor) return;
    activeEditor.bringToFront();
  });

  // To Back button
  const backBtn = makeToolbarBtn('toolbar-back', 'To Back', () => {
    if (!activeEditor) return;
    activeEditor.sendToBack();
  });

  // Assemble toolbar in order: fill, stroke, sep, bold, italic, sep, delete, front, back
  toolbarContainer.appendChild(fillInput);
  toolbarContainer.appendChild(strokeInput);
  toolbarContainer.appendChild(makeToolbarSep());
  toolbarContainer.appendChild(boldBtn);
  toolbarContainer.appendChild(italicBtn);
  toolbarContainer.appendChild(makeToolbarSep());
  toolbarContainer.appendChild(deleteBtn);
  toolbarContainer.appendChild(frontBtn);
  toolbarContainer.appendChild(backBtn);

  container.appendChild(toolbarContainer);

  // Toolbar controls object
  const toolbarControls: ToolbarControls = {
    container: toolbarContainer,
    setEditor(editor: Editor): void {
      activeEditor = editor;
      // Enable all buttons now that we have an editor
      fillInput.disabled = false;
      strokeInput.disabled = false;
      boldBtn.disabled = false;
      italicBtn.disabled = false;
      deleteBtn.disabled = false;
      frontBtn.disabled = false;
      backBtn.disabled = false;
    },
    update(selection: readonly SlotmapId[]): void {
      const hasSelection = selection.length > 0;
      const hasMultiSelection = selection.length > 1;

      // Delete, front, back require at least one selection
      deleteBtn.disabled = !hasSelection || !activeEditor;
      frontBtn.disabled = !hasSelection || !activeEditor;
      backBtn.disabled = !hasSelection || !activeEditor;

      // Color and style buttons require exactly one selection
      const singleSelect = selection.length === 1;
      fillInput.disabled = !singleSelect || !activeEditor;
      strokeInput.disabled = !singleSelect || !activeEditor;
      boldBtn.disabled = !singleSelect || !activeEditor;
      italicBtn.disabled = !singleSelect || !activeEditor;

      // Update Bold/Italic active state from resolved style
      if (singleSelect && activeEditor) {
        const id = selection[0]!;
        const style = activeEditor.getResolvedStyle(id);
        boldBtn.classList.toggle('--active', style?.remaining['bold'] === '1');
        italicBtn.classList.toggle('--active', style?.remaining['italic'] === '1');
      } else {
        boldBtn.classList.remove('--active');
        italicBtn.classList.remove('--active');
      }
    },
  };

  return {
    container,
    fileInput,
    undoBtn,
    redoBtn,
    saveBtn,
    zoomDisplay,
    toolbar: toolbarControls,
  };
}
