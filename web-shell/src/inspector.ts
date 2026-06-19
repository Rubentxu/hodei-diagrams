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
  noSelectionMsg.textContent = 'No selection';
  stylePane.appendChild(noSelectionMsg);

  const styleFields = document.createElement('div');
  styleFields.className = 'inspector-fields';
  styleFields.hidden = true;

  // Fill color
  const fillGroup = createFieldGroup('Fill', 'color');
  const fillInput = document.createElement('input');
  fillInput.type = 'color';
  fillInput.value = '#ffffff';
  fillInput.setAttribute('data-testid', 'inspector-fill');
  fillGroup.field.appendChild(fillInput);
  styleFields.appendChild(fillGroup.container);

  // Stroke color
  const strokeGroup = createFieldGroup('Stroke', 'color');
  const strokeInput = document.createElement('input');
  strokeInput.type = 'color';
  strokeInput.value = '#000000';
  strokeInput.setAttribute('data-testid', 'inspector-stroke');
  strokeGroup.field.appendChild(strokeInput);
  styleFields.appendChild(strokeGroup.container);

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
  styleFields.appendChild(widthGroup.container);

  // Dashed toggle
  const dashedGroup = createFieldGroup('Dashed', 'toggle');
  const dashedInput = document.createElement('input');
  dashedInput.type = 'checkbox';
  dashedInput.setAttribute('data-testid', 'inspector-dashed');
  dashedGroup.field.appendChild(dashedInput);
  styleFields.appendChild(dashedGroup.container);

  // Rounded toggle
  const roundedGroup = createFieldGroup('Rounded', 'toggle');
  const roundedInput = document.createElement('input');
  roundedInput.type = 'checkbox';
  roundedInput.setAttribute('data-testid', 'inspector-rounded');
  roundedGroup.field.appendChild(roundedInput);
  styleFields.appendChild(roundedGroup.container);

  stylePane.appendChild(styleFields);
  container.appendChild(stylePane);

  // Text pane
  const textPane = document.createElement('div');
  textPane.className = 'inspector-pane';
  textPane.setAttribute('data-testid', 'inspector-pane-text');
  const textNoSelMsg = document.createElement('div');
  textNoSelMsg.className = 'no-selection-msg';
  textNoSelMsg.textContent = 'No selection';
  textPane.appendChild(textNoSelMsg);

  const textFields = document.createElement('div');
  textFields.className = 'inspector-fields';
  textFields.hidden = true;

  // Font family
  const fontGroup = createFieldGroup('Font', 'select');
  const fontSelect = document.createElement('select');
  fontSelect.setAttribute('data-testid', 'inspector-font-family');
  for (const font of ['Inter', 'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'JetBrains Mono']) {
    const opt = document.createElement('option');
    opt.value = font;
    opt.textContent = font;
    fontSelect.appendChild(opt);
  }
  fontGroup.field.appendChild(fontSelect);
  textFields.appendChild(fontGroup.container);

  // Font size
  const sizeGroup = createFieldGroup('Size', 'number');
  const sizeInput = document.createElement('input');
  sizeInput.type = 'number';
  sizeInput.min = '8';
  sizeInput.max = '72';
  sizeInput.value = '14';
  sizeInput.setAttribute('data-testid', 'inspector-font-size');
  sizeGroup.field.appendChild(sizeInput);
  textFields.appendChild(sizeGroup.container);

  // Font color
  const fontColorGroup = createFieldGroup('Color', 'color');
  const fontColorInput = document.createElement('input');
  fontColorInput.type = 'color';
  fontColorInput.value = '#000000';
  fontColorInput.setAttribute('data-testid', 'inspector-font-color');
  fontColorGroup.field.appendChild(fontColorInput);
  textFields.appendChild(fontColorGroup.container);

  // Bold toggle
  const boldGroup = createFieldGroup('Bold', 'toggle');
  const boldInput = document.createElement('input');
  boldInput.type = 'checkbox';
  boldInput.setAttribute('data-testid', 'inspector-bold');
  boldGroup.field.appendChild(boldInput);
  textFields.appendChild(boldGroup.container);

  // Italic toggle
  const italicGroup = createFieldGroup('Italic', 'toggle');
  const italicInput = document.createElement('input');
  italicInput.type = 'checkbox';
  italicInput.setAttribute('data-testid', 'inspector-italic');
  italicGroup.field.appendChild(italicInput);
  textFields.appendChild(italicGroup.container);

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
