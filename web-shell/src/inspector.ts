/**
 * inspector.ts — Zone 4: Right Inspector Panel
 *
 * Tabbed panel (Style | Text | Arrange) for editing selected vertex properties.
 * Dispatches ChangeStyle commands via session.executeCommand().
 */

import type { DiagramEngineSession } from './session.js';
import type { SlotmapId, ScenePage } from './types.js';
import { slotmapIdToField } from './types.js';

export interface InspectorControls {
  container: HTMLElement;
  update(
    selection: SlotmapId | null,
    sceneCache: ScenePage[],
    activePageIdx: number,
  ): void;
}

/** Style change payload sent to the engine. */
interface StyleChanges {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  dashed?: boolean;
  rounded?: boolean;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
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
  arrangeTab.className = 'inspector-tab disabled-tab';
  arrangeTab.textContent = 'Arrange';
  arrangeTab.title = 'Disponible en v1.1';
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

  // Arrange pane (grayed out)
  const arrangePane = document.createElement('div');
  arrangePane.className = 'inspector-pane disabled-pane';
  arrangePane.setAttribute('data-testid', 'inspector-pane-arrange');
  const comingSoon = document.createElement('div');
  comingSoon.className = 'coming-soon';
  comingSoon.textContent = 'Disponible en v1.1';
  arrangePane.appendChild(comingSoon);
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
  let currentSelection: SlotmapId | null = null;

  function getChanges(): StyleChanges {
    const changes: StyleChanges = {};
    changes.fillColor = fillInput.value;
    changes.strokeColor = strokeInput.value;
    changes.strokeWidth = parseInt(widthInput.value, 10);
    changes.dashed = dashedInput.checked;
    changes.rounded = roundedInput.checked;
    changes.fontFamily = fontSelect.value;
    changes.fontSize = parseInt(sizeInput.value, 10);
    changes.fontColor = fontColorInput.value;
    changes.bold = boldInput.checked;
    changes.italic = italicInput.checked;
    return changes;
  }

  function dispatchChange(): void {
    if (!currentSelection) return;
    const changes = getChanges();
    const cmd = JSON.stringify({
      ChangeStyle: {
        id: slotmapIdToField(currentSelection),
        changes,
      },
    });
    const r = session.executeCommand(cmd);
    if (!r.ok) {
      console.warn('ChangeStyle command failed:', r.error);
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

  // ─── Update function (called on selection change) ─────────────────────────
  function update(
    selection: SlotmapId | null,
    _sceneCache: ScenePage[],
    _activePageIdx: number,
  ): void {
    currentSelection = selection;

    const hasSelection = selection !== null;
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
  update(null, [], 0);

  return { container, update };
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
