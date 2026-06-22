/**
 * inspector.ts — Zone 4: Right Inspector Panel
 *
 * Tabbed panel (Style | Text | Arrange) for editing selected vertex properties.
 * Dispatches ChangeStyle commands via session.executeCommand().
 */

import type { DiagramEngineSession } from './session.js';
import type { Editor } from './editor.js';
import type { SlotmapId, ScenePage } from './types.js';
import { slotmapIdToField } from './types.js';

export interface InspectorControls {
  container: HTMLElement;
  setEditor(editor: Editor): void;
  setSelectionSize(count: number): void;
  update(
    selection: readonly SlotmapId[],
    sceneCache: ScenePage[],
    activePageIdx: number,
  ): void;
}

/** Style change payload sent to the engine. */
interface StyleChanges {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: string;
  dashed?: string;
  rounded?: string;
  fontFamily?: string;
  fontSize?: string;
  fontColor?: string;
  bold?: string;
  italic?: string;
}

export function buildInspector(session: DiagramEngineSession): InspectorControls {
  const container = document.createElement('div');
  container.className = 'inspector';
  container.setAttribute('data-testid', 'inspector');

  // ─── Tab bar ──────────────────────────────────────────────────────────────
  const tabBar = document.createElement('div');
  tabBar.className = 'inspector-tabs';

  const styleTab = document.createElement('button');
  styleTab.className = 'inspector-tab active';
  styleTab.textContent = 'Style';
  styleTab.setAttribute('data-testid', 'inspector-tab-style');

  const textTab = document.createElement('button');
  textTab.className = 'inspector-tab';
  textTab.textContent = 'Text';
  textTab.setAttribute('data-testid', 'inspector-tab-text');

  const arrangeTab = document.createElement('button');
  arrangeTab.className = 'inspector-tab';
  arrangeTab.textContent = 'Align & Distribute';
  arrangeTab.setAttribute('data-testid', 'inspector-tab-arrange');

  tabBar.appendChild(styleTab);
  tabBar.appendChild(textTab);
  tabBar.appendChild(arrangeTab);
  container.appendChild(tabBar);

  // ─── Tab content panes ────────────────────────────────────────────────────
  // Style pane
  const stylePane = document.createElement('div');
  stylePane.className = 'inspector-pane active';
  stylePane.setAttribute('data-testid', 'inspector-pane-style');

  const noSelectionMsg = document.createElement('div');
  noSelectionMsg.className = 'no-selection-msg';
  noSelectionMsg.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="6" y="6" width="20" height="20" rx="2"/>
      <path d="M12 16h8M12 12h8M12 20h4"/>
    </svg>
    <p>Select a shape to edit its properties</p>
  `;
  stylePane.appendChild(noSelectionMsg);

  const styleFields = document.createElement('div');
  styleFields.className = 'inspector-fields';
  styleFields.hidden = true;

  // Section: Appearance
  const appearanceSection = document.createElement('div');
  appearanceSection.className = 'inspector-section';
  const appearanceTitle = document.createElement('div');
  appearanceTitle.className = 'inspector-section-title';
  appearanceTitle.textContent = 'Appearance';
  appearanceSection.appendChild(appearanceTitle);

  // Fill color
  const fillGroup = createFieldGroup('Fill', 'color');
  const fillInput = document.createElement('input');
  fillInput.type = 'color';
  fillInput.value = '#ffffff';
  fillInput.setAttribute('data-testid', 'inspector-fill');
  fillGroup.field.appendChild(fillInput);
  // Hex text input for fill color
  const fillHex = document.createElement('input');
  fillHex.type = 'text';
  fillHex.value = '#ffffff';
  fillHex.className = 'hex-input';
  fillHex.title = 'Hex color';
  fillHex.setAttribute('data-testid', 'inspector-fill-hex');
  fillGroup.field.appendChild(fillHex);
  fillInput.addEventListener('input', () => {
    fillHex.value = fillInput.value;
  });
  fillHex.addEventListener('input', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(fillHex.value)) {
      fillInput.value = fillHex.value;
    }
  });
  appearanceSection.appendChild(fillGroup.container);
  styleFields.appendChild(appearanceSection);

  // Stroke color
  const strokeGroup = createFieldGroup('Stroke', 'color');
  const strokeInput = document.createElement('input');
  strokeInput.type = 'color';
  strokeInput.value = '#000000';
  strokeInput.setAttribute('data-testid', 'inspector-stroke');
  strokeGroup.field.appendChild(strokeInput);
  // Hex text input for stroke color
  const strokeHex = document.createElement('input');
  strokeHex.type = 'text';
  strokeHex.value = '#000000';
  strokeHex.className = 'hex-input';
  strokeHex.title = 'Hex color';
  strokeHex.setAttribute('data-testid', 'inspector-stroke-hex');
  strokeGroup.field.appendChild(strokeHex);
  strokeInput.addEventListener('input', () => {
    strokeHex.value = strokeInput.value;
  });
  strokeHex.addEventListener('input', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(strokeHex.value)) {
      strokeInput.value = strokeHex.value;
    }
  });
  appearanceSection.appendChild(strokeGroup.container);

  // Stroke width
  const widthGroup = createFieldGroup('Width', 'slider');
  const widthInput = document.createElement('input');
  widthInput.type = 'range';
  widthInput.min = '1';
  widthInput.max = '10';
  widthInput.value = '2';
  widthInput.className = 'range-input';
  widthInput.setAttribute('data-testid', 'inspector-stroke-width');
  const widthValue = document.createElement('span');
  widthValue.className = 'range-value';
  widthValue.textContent = '2';
  widthInput.addEventListener('input', () => {
    widthValue.textContent = widthInput.value;
  });
  widthGroup.field.appendChild(widthInput);
  widthGroup.field.appendChild(widthValue);
  appearanceSection.appendChild(widthGroup.container);

  // Options section
  const optionsSection = document.createElement('div');
  optionsSection.className = 'inspector-section';
  const optionsTitle = document.createElement('div');
  optionsTitle.className = 'inspector-section-title';
  optionsTitle.textContent = 'Options';
  optionsSection.appendChild(optionsTitle);

  // Dashed toggle
  const dashedGroup = createFieldGroup('Dashed', 'toggle');
  const dashedInput = document.createElement('input');
  dashedInput.type = 'checkbox';
  dashedInput.setAttribute('data-testid', 'inspector-dashed');
  dashedGroup.field.appendChild(dashedInput);
  optionsSection.appendChild(dashedGroup.container);

  // Rounded toggle
  const roundedGroup = createFieldGroup('Rounded', 'toggle');
  const roundedInput = document.createElement('input');
  roundedInput.type = 'checkbox';
  roundedInput.setAttribute('data-testid', 'inspector-rounded');
  roundedGroup.field.appendChild(roundedInput);
  optionsSection.appendChild(roundedGroup.container);

  styleFields.appendChild(optionsSection);

  stylePane.appendChild(styleFields);
  container.appendChild(stylePane);

  // Text pane
  const textPane = document.createElement('div');
  textPane.className = 'inspector-pane';
  textPane.setAttribute('data-testid', 'inspector-pane-text');
  const textNoSelMsg = document.createElement('div');
  textNoSelMsg.className = 'no-selection-msg';
  textNoSelMsg.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 8h20M6 14h14M6 20h17"/>
    </svg>
    <p>Select a shape to edit text properties</p>
  `;
  textPane.appendChild(textNoSelMsg);

  const textFields = document.createElement('div');
  textFields.className = 'inspector-fields';
  textFields.hidden = true;

  // Font section
  const fontSection = document.createElement('div');
  fontSection.className = 'inspector-section';
  const fontSectionTitle = document.createElement('div');
  fontSectionTitle.className = 'inspector-section-title';
  fontSectionTitle.textContent = 'Font';
  fontSection.appendChild(fontSectionTitle);

  // Font family
  const fontGroup = createFieldGroup('Family', 'select');
  const fontSelect = document.createElement('select');
  fontSelect.setAttribute('data-testid', 'inspector-font-family');
  for (const font of ['Inter', 'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'JetBrains Mono']) {
    const opt = document.createElement('option');
    opt.value = font;
    opt.textContent = font;
    fontSelect.appendChild(opt);
  }
  fontGroup.field.appendChild(fontSelect);
  fontSection.appendChild(fontGroup.container);

  // Font size
  const sizeGroup = createFieldGroup('Size', 'number');
  const sizeInput = document.createElement('input');
  sizeInput.type = 'number';
  sizeInput.min = '8';
  sizeInput.max = '72';
  sizeInput.value = '14';
  sizeInput.setAttribute('data-testid', 'inspector-font-size');
  sizeGroup.field.appendChild(sizeInput);
  fontSection.appendChild(sizeGroup.container);

  textFields.appendChild(fontSection);

  // Style section
  const styleSection = document.createElement('div');
  styleSection.className = 'inspector-section';
  const styleSectionTitle = document.createElement('div');
  styleSectionTitle.className = 'inspector-section-title';
  styleSectionTitle.textContent = 'Style';
  styleSection.appendChild(styleSectionTitle);

  // Font color
  const fontColorGroup = createFieldGroup('Color', 'color');
  const fontColorInput = document.createElement('input');
  fontColorInput.type = 'color';
  fontColorInput.value = '#000000';
  fontColorInput.setAttribute('data-testid', 'inspector-font-color');
  fontColorGroup.field.appendChild(fontColorInput);
  // Hex text input for font color
  const fontColorHex = document.createElement('input');
  fontColorHex.type = 'text';
  fontColorHex.value = '#000000';
  fontColorHex.className = 'hex-input';
  fontColorHex.title = 'Hex color';
  fontColorHex.setAttribute('data-testid', 'inspector-font-color-hex');
  fontColorGroup.field.appendChild(fontColorHex);
  // Sync color picker with hex input
  fontColorInput.addEventListener('input', () => {
    fontColorHex.value = fontColorInput.value;
  });
  fontColorHex.addEventListener('input', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(fontColorHex.value)) {
      fontColorInput.value = fontColorHex.value;
    }
  });
  styleSection.appendChild(fontColorGroup.container);

  // Bold toggle as button
  const boldGroup = createFieldGroup('Bold', 'toggle');
  const boldBtn = document.createElement('button');
  boldBtn.className = 'style-toggle';
  boldBtn.textContent = 'B';
  boldBtn.title = 'Bold';
  boldBtn.setAttribute('data-testid', 'inspector-bold');
  boldBtn.type = 'button';
  boldGroup.field.appendChild(boldBtn);

  // Italic toggle as button
  const italicBtn = document.createElement('button');
  italicBtn.className = 'style-toggle';
  italicBtn.textContent = 'I';
  italicBtn.title = 'Italic';
  italicBtn.setAttribute('data-testid', 'inspector-italic');
  italicBtn.type = 'button';
  boldGroup.field.appendChild(italicBtn);

  styleSection.appendChild(boldGroup.container);

  // Hidden inputs for state (for command dispatch)
  const boldInput = document.createElement('input');
  boldInput.type = 'hidden';
  boldInput.value = 'false';
  const italicInput = document.createElement('input');
  italicInput.type = 'hidden';
  italicInput.value = 'false';

  // Bold/Italic button click handlers
  boldBtn.addEventListener('click', () => {
    const isActive = boldBtn.classList.toggle('active');
    boldInput.value = String(isActive);
    boldInput.dispatchEvent(new Event('input', { bubbles: true }));
  });

  italicBtn.addEventListener('click', () => {
    const isActive = italicBtn.classList.toggle('active');
    italicInput.value = String(isActive);
    italicInput.dispatchEvent(new Event('input', { bubbles: true }));
  });

  textFields.appendChild(styleSection);

  textPane.appendChild(textFields);
  container.appendChild(textPane);

  // Arrange button references for disabled state management
  const alignButtons: HTMLButtonElement[] = [];
  const distributeButtons: HTMLButtonElement[] = [];
  const sameSizeButtons: HTMLButtonElement[] = [];

  // Arrange pane
  const arrangePane = document.createElement('div');
  arrangePane.className = 'inspector-pane';
  arrangePane.setAttribute('data-testid', 'inspector-pane-arrange');

  // Helper to create arrange button
  function makeArrangeButton(testId: string, label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'arrange-btn disabled-btn';
    btn.setAttribute('data-testid', testId);
    btn.textContent = label;
    btn.disabled = true;
    btn.addEventListener('click', () => {
      if (!btn.disabled && activeEditor) {
        onClick();
      }
    });
    return btn;
  }

  // Align section
  const alignSection = document.createElement('div');
  alignSection.className = 'inspector-section';
  const alignTitle = document.createElement('div');
  alignTitle.className = 'inspector-section-title';
  alignTitle.textContent = 'Align';
  alignSection.appendChild(alignTitle);

  const alignRow1 = document.createElement('div');
  alignRow1.className = 'arrange-row';
  const alignLeftBtn = makeArrangeButton('arrange-btn-align-left', '⇤', () => activeEditor?.alignSelection('left'));
  const alignCenterHBtn = makeArrangeButton('arrange-btn-align-center-h', '⇔', () => activeEditor?.alignSelection('center-h'));
  const alignRightBtn = makeArrangeButton('arrange-btn-align-right', '⇥', () => activeEditor?.alignSelection('right'));
  alignRow1.appendChild(alignLeftBtn);
  alignRow1.appendChild(alignCenterHBtn);
  alignRow1.appendChild(alignRightBtn);
  alignSection.appendChild(alignRow1);
  alignButtons.push(alignLeftBtn, alignCenterHBtn, alignRightBtn);

  const alignRow2 = document.createElement('div');
  alignRow2.className = 'arrange-row';
  const alignTopBtn = makeArrangeButton('arrange-btn-align-top', '⇑', () => activeEditor?.alignSelection('top'));
  const alignCenterVBtn = makeArrangeButton('arrange-btn-align-center-v', '⇕', () => activeEditor?.alignSelection('center-v'));
  const alignBottomBtn = makeArrangeButton('arrange-btn-align-bottom', '⇓', () => activeEditor?.alignSelection('bottom'));
  alignRow2.appendChild(alignTopBtn);
  alignRow2.appendChild(alignCenterVBtn);
  alignRow2.appendChild(alignBottomBtn);
  alignSection.appendChild(alignRow2);
  alignButtons.push(alignTopBtn, alignCenterVBtn, alignBottomBtn);

  arrangePane.appendChild(alignSection);

  // Distribute section
  const distributeSection = document.createElement('div');
  distributeSection.className = 'inspector-section';
  const distributeTitle = document.createElement('div');
  distributeTitle.className = 'inspector-section-title';
  distributeTitle.textContent = 'Distribute';
  distributeSection.appendChild(distributeTitle);

  const distributeRow = document.createElement('div');
  distributeRow.className = 'arrange-row';
  const distributeHBtn = makeArrangeButton('arrange-btn-distribute-h', '→═←', () => activeEditor?.distributeSelection('horizontal'));
  const distributeVBtn = makeArrangeButton('arrange-btn-distribute-v', '↑═↓', () => activeEditor?.distributeSelection('vertical'));
  distributeRow.appendChild(distributeHBtn);
  distributeRow.appendChild(distributeVBtn);
  distributeSection.appendChild(distributeRow);
  distributeButtons.push(distributeHBtn, distributeVBtn);

  arrangePane.appendChild(distributeSection);

  // Same Size section
  const sameSizeSection = document.createElement('div');
  sameSizeSection.className = 'inspector-section';
  const sameSizeTitle = document.createElement('div');
  sameSizeTitle.className = 'inspector-section-title';
  sameSizeTitle.textContent = 'Same Size';
  sameSizeSection.appendChild(sameSizeTitle);

  const sameSizeRow = document.createElement('div');
  sameSizeRow.className = 'arrange-row';
  const sameWidthBtn = makeArrangeButton('arrange-btn-same-width', '↔', () => activeEditor?.sameSizeSelection('width'));
  const sameHeightBtn = makeArrangeButton('arrange-btn-same-height', '↕', () => activeEditor?.sameSizeSelection('height'));
  const sameBothBtn = makeArrangeButton('arrange-btn-same-both', '⬜', () => activeEditor?.sameSizeSelection('both'));
  sameSizeRow.appendChild(sameWidthBtn);
  sameSizeRow.appendChild(sameHeightBtn);
  sameSizeRow.appendChild(sameBothBtn);
  sameSizeSection.appendChild(sameSizeRow);
  sameSizeButtons.push(sameWidthBtn, sameHeightBtn, sameBothBtn);

  arrangePane.appendChild(sameSizeSection);

  container.appendChild(arrangePane);

  // ─── Tab switching ────────────────────────────────────────────────────────
  const panes = [stylePane, textPane, arrangePane];
  const tabs = [styleTab, textTab, arrangeTab];

  function activateTab(index: number): void {
    for (let i = 0; i < tabs.length; i++) {
      tabs[i]!.classList.toggle('active', i === index);
      panes[i]!.classList.toggle('active', i === index);
    }
  }

  styleTab.addEventListener('click', () => activateTab(0));
  textTab.addEventListener('click', () => activateTab(1));
  arrangeTab.addEventListener('click', () => activateTab(2));

  // ─── Debounce helper and command dispatch ─────────────────────────────────
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let currentSelection: readonly SlotmapId[] = [];

  function getChanges(): StyleChanges {
    const changes: StyleChanges = {};
    changes.fillColor = fillInput.value;
    changes.strokeColor = strokeInput.value;
    changes.strokeWidth = widthInput.value; // string, engine parses
    changes.dashed = dashedInput.checked ? "1" : "0"; // engine parses as bool
    changes.rounded = roundedInput.checked ? "1" : "0"; // engine parses as bool
    changes.fontFamily = fontSelect.value;
    changes.fontSize = sizeInput.value; // string, engine parses
    changes.fontColor = fontColorInput.value;
    changes.bold = boldInput.checked ? "1" : "0"; // engine parses as bool
    changes.italic = italicInput.checked ? "1" : "0"; // engine parses as bool
    return changes;
  }

  function dispatchChange(): void {
    if (currentSelection.length === 0) {
      return;
    }
    const changes = getChanges();
    // For now, dispatch to the first selected vertex (multi-select broadcast comes in PR-SP2)
    const id = currentSelection[0]!;
    const cmd = JSON.stringify({
      ChangeStyle: {
        id: slotmapIdToField(id),
        style: changes,
      },
    });
    const r = session.executeCommand(cmd);
    if (!r.ok) {
      console.warn('[inspector] ChangeStyle failed:', r.error);
    }
  }

  function debouncedDispatch(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      dispatchChange();
      debounceTimer = null;
    }, 300);
  }

  // Wire all controls to dispatch
  const allControls = [
    fillInput, strokeInput, widthInput,
    dashedInput, roundedInput,
    fontSelect, sizeInput, fontColorInput,
    boldInput, italicInput,
  ];
  for (const ctrl of allControls) {
    ctrl.addEventListener('change', debouncedDispatch);
    ctrl.addEventListener('input', debouncedDispatch);
  }

  // ─── Arrange buttons state ────────────────────────────────────────────────
  let activeEditor: Editor | null = null;
  let selectionSize = 0;

  function updateArrangeButtonStates(): void {
    for (const btn of alignButtons) {
      btn.disabled = selectionSize < 2;
      btn.classList.toggle('disabled-btn', selectionSize < 2);
    }
    for (const btn of distributeButtons) {
      btn.disabled = selectionSize < 3;
      btn.classList.toggle('disabled-btn', selectionSize < 3);
    }
    for (const btn of sameSizeButtons) {
      btn.disabled = selectionSize < 2;
      btn.classList.toggle('disabled-btn', selectionSize < 2);
    }
  }

  function setEditor(editor: Editor): void {
    activeEditor = editor;
  }

  function setSelectionSize(count: number): void {
    selectionSize = count;
    updateArrangeButtonStates();
  }

  // ─── Update function (called on selection change) ─────────────────────────
  function update(
    selection: readonly SlotmapId[],
    _sceneCache: ScenePage[],
    _activePageIdx: number,
  ): void {
    currentSelection = selection;

    const hasSelection = selection.length > 0;
    noSelectionMsg.hidden = hasSelection;
    styleFields.hidden = !hasSelection;
    textNoSelMsg.hidden = hasSelection;
    textFields.hidden = !hasSelection;

    // When no selection, clear previous debounce
    if (!hasSelection && debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  // Initial state: no selection
  update([], [], 0);

  return { container, setEditor, setSelectionSize, update };
}

// ─── Field group helper ───────────────────────────────────────────────────────

interface FieldGroup {
  container: HTMLElement;
  field: HTMLElement;
}

function createFieldGroup(label: string, _kind: string): FieldGroup {
  const container = document.createElement('div');
  container.className = 'field-group';

  const labelEl = document.createElement('label');
  labelEl.className = 'field-label';
  labelEl.textContent = label;
  container.appendChild(labelEl);

  const field = document.createElement('div');
  field.className = 'field-control';
  container.appendChild(field);

  return { container, field };
}
