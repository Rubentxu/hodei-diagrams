/**
 * inspector.ts — Zone 4: Right Inspector Panel
 *
 * Tabbed panel (Style | Text | Arrange) for editing selected vertex properties.
 * Dispatches ChangeStyle commands via session.executeCommand().
 */

import type { DiagramEngineSession } from './session.js';
import type { Editor } from './editor.js';
import type { SlotmapId, ScenePage, ShadowConfig, GlassConfig, GradientConfig } from './types.js';
import { slotmapIdToField } from './types.js';
import { ARRANGE_ICONS } from './icon.js';

export interface InspectorControls {
  container: HTMLElement;
  closeBtn: HTMLButtonElement; // R3: close button for drawer
  setEditor(_editor: Editor): void;
  setSelectionSize(_count: number): void;
  update(
    _selection: readonly SlotmapId[],
    _sceneCache: ScenePage[],
    _activePageIdx: number,
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

export function buildInspector(
  session: DiagramEngineSession,
  onStyleChange?: (_changes: { fillColor?: string; strokeColor?: string }) => void,
): InspectorControls {
  const container = document.createElement('div');
  container.className = 'inspector';
  container.setAttribute('data-testid', 'inspector');
  // R3: drawer-specific identifier (separate from legacy 'inspector' testid)
  container.setAttribute('data-drawer-testid', 'drawer-inspector');

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

  // R3: Close button for inspector drawer
  const closeBtn = document.createElement('button');
  closeBtn.className = 'drawer-close-inspector';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close inspector';
  closeBtn.setAttribute('data-testid', 'drawer-close-inspector');
  container.appendChild(closeBtn);

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
    <p class="actionable-hint">Click a shape on the canvas, then use the tools below</p>
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
    onStyleChange?.({ fillColor: fillInput.value });
  });
  fillHex.addEventListener('input', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(fillHex.value)) {
      fillInput.value = fillHex.value;
      onStyleChange?.({ fillColor: fillHex.value });
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
    onStyleChange?.({ strokeColor: strokeInput.value });
  });
  strokeHex.addEventListener('input', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(strokeHex.value)) {
      strokeInput.value = strokeHex.value;
      onStyleChange?.({ strokeColor: strokeHex.value });
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

  // Shadow section — PR-SP2
  const shadowSection = document.createElement('div');
  shadowSection.className = 'inspector-section';
  shadowSection.setAttribute('data-testid', 'inspector-shadow-section');

  const shadowHeader = document.createElement('div');
  shadowHeader.className = 'inspector-section-header';
  shadowSection.appendChild(shadowHeader);

  const shadowTitle = document.createElement('span');
  shadowTitle.className = 'inspector-section-title';
  shadowTitle.textContent = 'Shadow';
  shadowHeader.appendChild(shadowTitle);

  const shadowToggleWrap = document.createElement('label');
  shadowToggleWrap.className = 'toggle-switch';
  shadowHeader.appendChild(shadowToggleWrap);

  const shadowToggle = document.createElement('input');
  shadowToggle.type = 'checkbox';
  shadowToggle.setAttribute('data-testid', 'shadow-toggle');
  shadowToggleWrap.appendChild(shadowToggle);

  const shadowSlider = document.createElement('span');
  shadowSlider.className = 'slider';
  shadowToggleWrap.appendChild(shadowSlider);

  const shadowBody = document.createElement('div');
  shadowBody.className = 'inspector-section-body';
  shadowBody.id = 'shadow-controls';
  shadowBody.hidden = true;
  shadowSection.appendChild(shadowBody);

  // dx slider
  const dxGroup = createFieldGroup('dx', 'slider');
  const dxInput = document.createElement('input');
  dxInput.type = 'range';
  dxInput.min = '-20';
  dxInput.max = '20';
  dxInput.value = '3';
  dxInput.className = 'range-input';
  dxInput.setAttribute('data-testid', 'shadow-dx-slider');
  const dxValue = document.createElement('span');
  dxValue.className = 'range-value';
  dxValue.textContent = '3';
  dxGroup.field.appendChild(dxInput);
  dxGroup.field.appendChild(dxValue);
  shadowBody.appendChild(dxGroup.container);

  // dy slider
  const dyGroup = createFieldGroup('dy', 'slider');
  const dyInput = document.createElement('input');
  dyInput.type = 'range';
  dyInput.min = '-20';
  dyInput.max = '20';
  dyInput.value = '3';
  dyInput.className = 'range-input';
  dyInput.setAttribute('data-testid', 'shadow-dy-slider');
  const dyValue = document.createElement('span');
  dyValue.className = 'range-value';
  dyValue.textContent = '3';
  dyGroup.field.appendChild(dyInput);
  dyGroup.field.appendChild(dyValue);
  shadowBody.appendChild(dyGroup.container);

  // blur slider
  const blurGroup = createFieldGroup('blur', 'slider');
  const blurInput = document.createElement('input');
  blurInput.type = 'range';
  blurInput.min = '0';
  blurInput.max = '30';
  blurInput.value = '5';
  blurInput.className = 'range-input';
  blurInput.setAttribute('data-testid', 'shadow-blur-slider');
  const blurValue = document.createElement('span');
  blurValue.className = 'range-value';
  blurValue.textContent = '5';
  blurGroup.field.appendChild(blurInput);
  blurGroup.field.appendChild(blurValue);
  shadowBody.appendChild(blurGroup.container);

  // color picker
  const colorGroup = createFieldGroup('color', 'color');
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = '#000000';
  colorInput.setAttribute('data-testid', 'shadow-color-picker');
  colorGroup.field.appendChild(colorInput);
  shadowBody.appendChild(colorGroup.container);

  styleFields.appendChild(shadowSection);
  styleFields.appendChild(optionsSection);

  // ─── Glass section — PR-SP3 ─────────────────────────────────────────────
  const glassSection = document.createElement('div');
  glassSection.className = 'inspector-section';
  glassSection.setAttribute('data-testid', 'inspector-glass-section');

  const glassHeader = document.createElement('div');
  glassHeader.className = 'inspector-section-header';
  glassSection.appendChild(glassHeader);

  const glassTitle = document.createElement('span');
  glassTitle.className = 'inspector-section-title';
  glassTitle.textContent = 'Glass';
  glassHeader.appendChild(glassTitle);

  const glassToggleWrap = document.createElement('label');
  glassToggleWrap.className = 'toggle-switch';
  glassHeader.appendChild(glassToggleWrap);

  const glassToggle = document.createElement('input');
  glassToggle.type = 'checkbox';
  glassToggle.setAttribute('data-testid', 'glass-toggle');
  glassToggleWrap.appendChild(glassToggle);

  const glassSliderEl = document.createElement('span');
  glassSliderEl.className = 'slider';
  glassToggleWrap.appendChild(glassSliderEl);

  const glassBody = document.createElement('div');
  glassBody.className = 'inspector-section-body';
  glassBody.id = 'glass-controls';
  glassBody.hidden = true;
  glassSection.appendChild(glassBody);

  // Opacity slider
  const glassOpacityGroup = document.createElement('div');
  glassOpacityGroup.className = 'slider-label';
  const glassOpacityLabel = document.createElement('span');
  glassOpacityLabel.textContent = 'Opacity';
  glassOpacityGroup.appendChild(glassOpacityLabel);

  const glassOpacityInput = document.createElement('input');
  glassOpacityInput.type = 'range';
  glassOpacityInput.min = '0';
  glassOpacityInput.max = '1';
  glassOpacityInput.step = '0.05';
  glassOpacityInput.value = '0.5';
  glassOpacityInput.setAttribute('data-testid', 'glass-opacity-slider');
  glassOpacityGroup.appendChild(glassOpacityInput);

  const glassOpacityValue = document.createElement('span');
  glassOpacityValue.className = 'slider-value';
  glassOpacityValue.textContent = '0.5';
  glassOpacityGroup.appendChild(glassOpacityValue);
  glassBody.appendChild(glassOpacityGroup);

  styleFields.appendChild(glassSection);

  // ─── Gradient section — PR-SP3 ────────────────────────────────────────────
  const gradientSection = document.createElement('div');
  gradientSection.className = 'inspector-section';
  gradientSection.setAttribute('data-testid', 'inspector-gradient-section');

  const gradientHeader = document.createElement('div');
  gradientHeader.className = 'inspector-section-header';
  gradientSection.appendChild(gradientHeader);

  const gradientTitle = document.createElement('span');
  gradientTitle.className = 'inspector-section-title';
  gradientTitle.textContent = 'Gradient';
  gradientHeader.appendChild(gradientTitle);

  const gradientToggleWrap = document.createElement('label');
  gradientToggleWrap.className = 'toggle-switch';
  gradientHeader.appendChild(gradientToggleWrap);

  const gradientToggle = document.createElement('input');
  gradientToggle.type = 'checkbox';
  gradientToggle.setAttribute('data-testid', 'gradient-toggle');
  gradientToggleWrap.appendChild(gradientToggle);

  const gradientSliderEl = document.createElement('span');
  gradientSliderEl.className = 'slider';
  gradientToggleWrap.appendChild(gradientSliderEl);

  const gradientBody = document.createElement('div');
  gradientBody.className = 'inspector-section-body';
  gradientBody.id = 'gradient-controls';
  gradientBody.hidden = true;
  gradientSection.appendChild(gradientBody);

  // Type selector
  const gradientTypeLabel = document.createElement('label');
  gradientTypeLabel.className = 'control-label';
  gradientTypeLabel.textContent = 'Type';
  gradientBody.appendChild(gradientTypeLabel);

  const gradientTypeSelect = document.createElement('select');
  gradientTypeSelect.setAttribute('data-testid', 'gradient-type-select');
  const optLinear = document.createElement('option');
  optLinear.value = 'linear';
  optLinear.textContent = 'Linear';
  gradientTypeSelect.appendChild(optLinear);
  const optRadial = document.createElement('option');
  optRadial.value = 'radial';
  optRadial.textContent = 'Radial';
  gradientTypeSelect.appendChild(optRadial);
  gradientBody.appendChild(gradientTypeSelect);

  // Angle slider (only for linear)
  const gradientAngleRow = document.createElement('div');
  gradientAngleRow.className = 'slider-label';
  gradientAngleRow.id = 'gradient-angle-row';

  const gradientAngleLabelEl = document.createElement('span');
  gradientAngleLabelEl.textContent = 'Angle';
  gradientAngleRow.appendChild(gradientAngleLabelEl);

  const gradientAngleInput = document.createElement('input');
  gradientAngleInput.type = 'range';
  gradientAngleInput.min = '0';
  gradientAngleInput.max = '360';
  gradientAngleInput.step = '15';
  gradientAngleInput.value = '0';
  gradientAngleInput.setAttribute('data-testid', 'gradient-angle-slider');
  gradientAngleRow.appendChild(gradientAngleInput);

  const gradientAngleValue = document.createElement('span');
  gradientAngleValue.className = 'slider-value';
  gradientAngleValue.textContent = '0°';
  gradientAngleRow.appendChild(gradientAngleValue);
  gradientBody.appendChild(gradientAngleRow);

  // Color stops
  const gradientStopsLabel = document.createElement('label');
  gradientStopsLabel.className = 'control-label';
  gradientStopsLabel.textContent = 'Colors';
  gradientBody.appendChild(gradientStopsLabel);

  const gradientStops = document.createElement('div');
  gradientStops.className = 'gradient-stops';

  const gradientColor1 = document.createElement('input');
  gradientColor1.type = 'color';
  gradientColor1.value = '#ffffff';
  gradientColor1.setAttribute('data-testid', 'gradient-color-1');
  gradientStops.appendChild(gradientColor1);

  const gradientArrow = document.createElement('span');
  gradientArrow.textContent = '→';
  gradientStops.appendChild(gradientArrow);

  const gradientColor2 = document.createElement('input');
  gradientColor2.type = 'color';
  gradientColor2.value = '#000000';
  gradientColor2.setAttribute('data-testid', 'gradient-color-2');
  gradientStops.appendChild(gradientColor2);

  gradientBody.appendChild(gradientStops);

  styleFields.appendChild(gradientSection);

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
    <p class="actionable-hint">Click a shape on the canvas to edit its text</p>
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

  // Arrange empty state (new for PR #N.6)
  const arrangeNoSelMsg = document.createElement('div');
  arrangeNoSelMsg.className = 'no-selection-msg';
  arrangeNoSelMsg.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="6" y="6" width="20" height="20" rx="2"/>
      <path d="M12 16h8M16 12v8"/>
    </svg>
    <p>Select a shape to arrange it</p>
    <p class="actionable-hint">Click a shape on the canvas, then use the tools below</p>
  `;
  arrangeNoSelMsg.hidden = false;
  arrangePane.appendChild(arrangeNoSelMsg);

  // Arrange fields wrapper (for show/hide based on selection)
  const arrangeFields = document.createElement('div');
  arrangeFields.className = 'inspector-fields';
  arrangeFields.hidden = true;

  // Position section (at top of Arrange pane — design B2 §Data Flow)
  const positionSection = document.createElement('div');
  positionSection.className = 'inspector-section';
  const positionTitle = document.createElement('div');
  positionTitle.className = 'inspector-section-title';
  positionTitle.textContent = 'Position';
  positionSection.appendChild(positionTitle);

  const xInput = document.createElement('input');
  xInput.type = 'number';
  xInput.step = '1';
  xInput.setAttribute('data-testid', 'arrange-field-x-input');
  const yInput = document.createElement('input');
  yInput.type = 'number';
  yInput.step = '1';
  yInput.setAttribute('data-testid', 'arrange-field-y-input');
  const wInput = document.createElement('input');
  wInput.type = 'number';
  wInput.step = '1';
  wInput.min = '1';
  wInput.setAttribute('data-testid', 'arrange-field-w-input');
  const hInput = document.createElement('input');
  hInput.type = 'number';
  hInput.step = '1';
  hInput.min = '1';
  hInput.setAttribute('data-testid', 'arrange-field-h-input');

  const xyRow = document.createElement('div');
  xyRow.className = 'position-row';
  const xGroup = document.createElement('div');
  xGroup.className = 'position-input-group';
  const xLabel = document.createElement('label');
  xLabel.textContent = 'X';
  xGroup.appendChild(xLabel);
  xGroup.appendChild(xInput);
  const yGroup = document.createElement('div');
  yGroup.className = 'position-input-group';
  const yLabel = document.createElement('label');
  yLabel.textContent = 'Y';
  yGroup.appendChild(yLabel);
  yGroup.appendChild(yInput);
  xyRow.appendChild(xGroup);
  xyRow.appendChild(yGroup);
  positionSection.appendChild(xyRow);

  const whRow = document.createElement('div');
  whRow.className = 'position-row';
  const wGroup = document.createElement('div');
  wGroup.className = 'position-input-group';
  const wLabel = document.createElement('label');
  wLabel.textContent = 'W';
  wGroup.appendChild(wLabel);
  wGroup.appendChild(wInput);
  const hGroup = document.createElement('div');
  hGroup.className = 'position-input-group';
  const hLabel = document.createElement('label');
  hLabel.textContent = 'H';
  hGroup.appendChild(hLabel);
  hGroup.appendChild(hInput);
  whRow.appendChild(wGroup);
  whRow.appendChild(hGroup);
  positionSection.appendChild(whRow);

  // Rotate row (write-only — no degree field per Option B)
  const rotateRow = document.createElement('div');
  rotateRow.className = 'position-rotate-row';
  const rotateBtn = makeArrangeButton(
    'arrange-btn-rotate',
    ARRANGE_ICONS['rotate'],
    () => {
      if (currentSelection.length > 0 && activeEditor) {
        activeEditor.rotateSelection(Math.PI / 12); // +15°
      }
    },
  );
  rotateRow.appendChild(rotateBtn);
  positionSection.appendChild(rotateRow);

  arrangeFields.insertBefore(positionSection, arrangeFields.firstChild);

  // Position button tracking for disabled state
  const _positionButtons: HTMLButtonElement[] = [rotateBtn];

  // Commit handler for Position inputs (debounced)
  function commitPositionChange(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (currentSelection.length !== 1 || !activeEditor) return;
      const id = currentSelection[0]!;
      const x = parseFloat(xInput.value);
      const y = parseFloat(yInput.value);
      const w = parseFloat(wInput.value);
      const h = parseFloat(hInput.value);
      // Clamp: ignore non-numeric and non-positive W/H (X/Y may legitimately be negative)
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
        return; // revert visual state on next update() — no dispatch
      }
      const clampedW = Math.max(1, w);
      const clampedH = Math.max(1, h);
      activeEditor.setVertexGeometry(id, { x, y, width: clampedW, height: clampedH });
    }, 300);
  }
  for (const input of [xInput, yInput, wInput, hInput]) {
    input.addEventListener('change', commitPositionChange);
    input.addEventListener('blur', commitPositionChange);
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') commitPositionChange();
    });
  }

  // Helper to create arrange button (SVG icon)
  function makeArrangeButton(testId: string, iconSvg: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'arrange-btn disabled-btn';
    btn.setAttribute('data-testid', testId);
    btn.innerHTML = iconSvg;
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
  const alignLeftBtn = makeArrangeButton('arrange-btn-align-left', ARRANGE_ICONS['align-left'], () => activeEditor?.alignSelection('left'));
  const alignCenterHBtn = makeArrangeButton('arrange-btn-align-center-h', ARRANGE_ICONS['align-center-h'], () => activeEditor?.alignSelection('center-h'));
  const alignRightBtn = makeArrangeButton('arrange-btn-align-right', ARRANGE_ICONS['align-right'], () => activeEditor?.alignSelection('right'));
  alignRow1.appendChild(alignLeftBtn);
  alignRow1.appendChild(alignCenterHBtn);
  alignRow1.appendChild(alignRightBtn);
  alignSection.appendChild(alignRow1);
  alignButtons.push(alignLeftBtn, alignCenterHBtn, alignRightBtn);

  const alignRow2 = document.createElement('div');
  alignRow2.className = 'arrange-row';
  const alignTopBtn = makeArrangeButton('arrange-btn-align-top', ARRANGE_ICONS['align-top'], () => activeEditor?.alignSelection('top'));
  const alignCenterVBtn = makeArrangeButton('arrange-btn-align-center-v', ARRANGE_ICONS['align-center-v'], () => activeEditor?.alignSelection('center-v'));
  const alignBottomBtn = makeArrangeButton('arrange-btn-align-bottom', ARRANGE_ICONS['align-bottom'], () => activeEditor?.alignSelection('bottom'));
  alignRow2.appendChild(alignTopBtn);
  alignRow2.appendChild(alignCenterVBtn);
  alignRow2.appendChild(alignBottomBtn);
  alignSection.appendChild(alignRow2);
  alignButtons.push(alignTopBtn, alignCenterVBtn, alignBottomBtn);

  arrangeFields.appendChild(alignSection);

  // Distribute section
  const distributeSection = document.createElement('div');
  distributeSection.className = 'inspector-section';
  const distributeTitle = document.createElement('div');
  distributeTitle.className = 'inspector-section-title';
  distributeTitle.textContent = 'Distribute';
  distributeSection.appendChild(distributeTitle);

  const distributeRow = document.createElement('div');
  distributeRow.className = 'arrange-row';
  const distributeHBtn = makeArrangeButton('arrange-btn-distribute-h', ARRANGE_ICONS['distribute-h'], () => activeEditor?.distributeSelection('horizontal'));
  const distributeVBtn = makeArrangeButton('arrange-btn-distribute-v', ARRANGE_ICONS['distribute-v'], () => activeEditor?.distributeSelection('vertical'));
  distributeRow.appendChild(distributeHBtn);
  distributeRow.appendChild(distributeVBtn);
  distributeSection.appendChild(distributeRow);
  distributeButtons.push(distributeHBtn, distributeVBtn);

  arrangeFields.appendChild(distributeSection);

  // Same Size section
  const sameSizeSection = document.createElement('div');
  sameSizeSection.className = 'inspector-section';
  const sameSizeTitle = document.createElement('div');
  sameSizeTitle.className = 'inspector-section-title';
  sameSizeTitle.textContent = 'Same Size';
  sameSizeSection.appendChild(sameSizeTitle);

  const sameSizeRow = document.createElement('div');
  sameSizeRow.className = 'arrange-row';
  const sameWidthBtn = makeArrangeButton('arrange-btn-same-width', ARRANGE_ICONS['same-width'], () => activeEditor?.sameSizeSelection('width'));
  const sameHeightBtn = makeArrangeButton('arrange-btn-same-height', ARRANGE_ICONS['same-height'], () => activeEditor?.sameSizeSelection('height'));
  const sameBothBtn = makeArrangeButton('arrange-btn-same-both', ARRANGE_ICONS['same-both'], () => activeEditor?.sameSizeSelection('both'));
  sameSizeRow.appendChild(sameWidthBtn);
  sameSizeRow.appendChild(sameHeightBtn);
  sameSizeRow.appendChild(sameBothBtn);
  sameSizeSection.appendChild(sameSizeRow);
  sameSizeButtons.push(sameWidthBtn, sameHeightBtn, sameBothBtn);

  arrangeFields.appendChild(sameSizeSection);

  arrangePane.appendChild(arrangeFields);

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

  // ─── Shadow section wiring (PR-SP2) ─────────────────────────────────────
  let shadowDraft: ShadowConfig | null = null;
  let shadowCommitted: ShadowConfig | null = null;

  /** Build a full ShadowConfig from the current control values */
  function getShadowConfig(): ShadowConfig {
    return {
      enabled: shadowToggle.checked,
      dx: parseFloat(dxInput.value) || 0,
      dy: parseFloat(dyInput.value) || 0,
      blur: parseFloat(blurInput.value) || 0,
      color: colorInput.value,
    };
  }

  /** Apply shadow config to all selected vertices via a single transaction */
  function applyShadowConfig(config: ShadowConfig): void {
    if (currentSelection.length === 0) return;

    const commands: string[] = [];
    for (const id of currentSelection) {
      const style: Record<string, string> = {
        shadow: config.enabled ? '1' : '0',
      };
      if (config.enabled) {
        style['shadowDx'] = String(config.dx);
        style['shadowDy'] = String(config.dy);
        style['shadowBlur'] = String(config.blur);
        style['shadowColor'] = config.color;
      }
      commands.push(JSON.stringify({
        ChangeStyle: {
          id: slotmapIdToField(id),
          style,
        },
      }));
    }

    if (commands.length === 0) return;
    const result = session.executeTransaction(commands);
    if (!result.ok) {
      console.warn('[inspector] Shadow ChangeStyle failed:', result.error);
    }
  }

  /** Apply shadow preview directly to DOM (no engine mutation, no undo) */
  function applyShadowPreview(config: ShadowConfig): void {
    if (currentSelection.length === 0) return;

    for (const id of currentSelection) {
      const el = container.ownerDocument.querySelector(
        `[data-vertex-id="${id.idx}:${id.version}"]`,
      );
      if (!el) continue;

      if (config.enabled) {
        const filterId = `shadow-preview-${id.idx}`;
        // Apply filter via style attribute for real-time preview
        (el as SVGElement).setAttribute(
          'filter',
          `url(#${filterId})`,
        );
      } else {
        (el as SVGElement).removeAttribute('filter');
      }
    }
  }

  /** Revert preview and restore last committed state */
  function revertShadowPreview(): void {
    if (shadowCommitted !== null) {
      applyShadowPreview(shadowCommitted);
    } else {
      // Remove preview filter entirely
      for (const id of currentSelection) {
        const el = container.ownerDocument.querySelector(
          `[data-vertex-id="${id.idx}:${id.version}"]`,
        );
        if (el) {
          (el as SVGElement).removeAttribute('filter');
        }
      }
    }
  }

  // Shadow toggle handler
  shadowToggle.addEventListener('change', () => {
    const config = getShadowConfig();
    shadowDraft = config;
    if (shadowToggle.checked) {
      // Toggle ON: apply shadow with current defaults
      applyShadowConfig(config);
      shadowCommitted = config;
      shadowBody.hidden = false;
    } else {
      // Toggle OFF: remove shadow
      applyShadowConfig({ ...config, enabled: false });
      shadowCommitted = { ...config, enabled: false };
      shadowBody.hidden = true;
    }
  });

  // Slider input handlers (real-time preview during drag)
  function handleShadowSlider(input: HTMLInputElement, valueEl: HTMLElement, _field: 'dx' | 'dy' | 'blur') {
    input.addEventListener('input', () => {
      valueEl.textContent = input.value;
      if (!shadowToggle.checked) return;

      const draft: ShadowConfig = {
        enabled: true,
        dx: parseFloat(dxInput.value) || 0,
        dy: parseFloat(dyInput.value) || 0,
        blur: parseFloat(blurInput.value) || 0,
        color: colorInput.value,
      };
      shadowDraft = draft;
      applyShadowPreview(draft);
    });

    input.addEventListener('change', () => {
      if (!shadowToggle.checked) return;
      const config = getShadowConfig();
      shadowCommitted = config;
      applyShadowConfig(config);
      shadowDraft = null;
    });

    input.addEventListener('pointerup', () => {
      if (!shadowToggle.checked) return;
      const config = getShadowConfig();
      shadowCommitted = config;
      applyShadowConfig(config);
      shadowDraft = null;
    });
  }

  handleShadowSlider(dxInput, dxValue, 'dx');
  handleShadowSlider(dyInput, dyValue, 'dy');
  handleShadowSlider(blurInput, blurValue, 'blur');

  // Color picker handler
  colorInput.addEventListener('input', () => {
    if (!shadowToggle.checked) return;
    const draft: ShadowConfig = {
      enabled: true,
      dx: parseFloat(dxInput.value) || 0,
      dy: parseFloat(dyInput.value) || 0,
      blur: parseFloat(blurInput.value) || 0,
      color: colorInput.value,
    };
    shadowDraft = draft;
    applyShadowPreview(draft);
  });

  colorInput.addEventListener('change', () => {
    if (!shadowToggle.checked) return;
    const config = getShadowConfig();
    shadowCommitted = config;
    applyShadowConfig(config);
    shadowDraft = null;
  });

  // Escape key reverts shadow preview
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (shadowDraft !== null) {
        shadowDraft = null;
        revertShadowPreview();
      }
      if (glassDraft !== null) {
        glassDraft = null;
        revertGlassPreview();
      }
      if (gradientDraft !== null) {
        gradientDraft = null;
        revertGradientPreview();
      }
    }
  });

  /** Update shadow section UI based on resolved styles from the engine */
  function updateShadowSection(selection: readonly SlotmapId[]): void {
    if (selection.length === 0) {
      // No selection: disable shadow section
      shadowSection.classList.add('disabled');
      shadowToggle.checked = false;
      shadowBody.hidden = true;
      shadowCommitted = null;
      shadowDraft = null;
      return;
    }

    shadowSection.classList.remove('disabled');

    // Get resolved style for all selected vertices
    const resolvedStyles: (ShadowConfig | null)[] = [];
    for (const id of selection) {
      const result = session.getResolvedStyle(id);
      if (result.ok && result.value.shadow) {
        resolvedStyles.push(result.value.shadow);
      } else {
        resolvedStyles.push(null);
      }
    }

    // Check if all selected vertices have the same shadow config
    const nonNull = resolvedStyles.filter((s): s is ShadowConfig => s !== null);

    if (nonNull.length === 0) {
      // No shadow on any vertex: show defaults (all off)
      shadowToggle.checked = false;
      shadowBody.hidden = true;
      dxInput.value = '3';
      dyInput.value = '3';
      blurInput.value = '5';
      colorInput.value = '#000000';
      dxValue.textContent = '3';
      dyValue.textContent = '3';
      blurValue.textContent = '5';
      shadowCommitted = null;
    } else {
      // Aggregate: if all agree, show that value; otherwise show mixed state
      const first = nonNull[0]!;
      const allMatch = nonNull.every(
        (s) =>
          s.enabled === first.enabled &&
          s.dx === first.dx &&
          s.dy === first.dy &&
          s.blur === first.blur &&
          s.color === first.color,
      );

      if (allMatch) {
        shadowToggle.checked = first.enabled;
        shadowBody.hidden = !first.enabled;
        dxInput.value = String(first.dx);
        dyInput.value = String(first.dy);
        blurInput.value = String(first.blur);
        colorInput.value = first.color.startsWith('#') ? first.color : '#000000';
        dxValue.textContent = String(first.dx);
        dyValue.textContent = String(first.dy);
        blurValue.textContent = String(first.blur);
        shadowCommitted = first;
      } else {
        // Mixed state: show "—" for disagreeing fields
        shadowToggle.checked = false;
        shadowBody.hidden = true;
        dxInput.value = '0';
        dyInput.value = '0';
        blurInput.value = '0';
        colorInput.value = '#000000';
        dxValue.textContent = '—';
        dyValue.textContent = '—';
        blurValue.textContent = '—';
        shadowCommitted = null;
      }
    }
  }

  // ─── Glass section handlers (PR-SP3) ──────────────────────────────────────
  let glassDraft: GlassConfig | null = null;
  let glassCommitted: GlassConfig | null = null;

  /** Build a full GlassConfig from the current control values */
  function getGlassConfig(): GlassConfig {
    return {
      enabled: glassToggle.checked,
      opacity: parseFloat(glassOpacityInput.value) || 0.5,
    };
  }

  /** Apply glass config to all selected vertices via a single transaction */
  function applyGlassConfig(config: GlassConfig): void {
    if (currentSelection.length === 0) return;

    const commands: string[] = [];
    for (const id of currentSelection) {
      const style: Record<string, string> = {
        glass: config.enabled ? '1' : '0',
      };
      if (config.enabled) {
        style['glassOpacity'] = String(config.opacity);
      }
      commands.push(JSON.stringify({
        ChangeStyle: {
          id: slotmapIdToField(id),
          style,
        },
      }));
    }

    if (commands.length === 0) return;
    const result = session.executeTransaction(commands);
    if (!result.ok) {
      console.warn('[inspector] Glass ChangeStyle failed:', result.error);
    }
  }

  /** Apply glass preview directly to DOM (fill-opacity, no engine mutation, no undo) */
  function applyGlassPreview(config: GlassConfig): void {
    if (currentSelection.length === 0) return;

    for (const id of currentSelection) {
      const el = container.ownerDocument.querySelector(
        `[data-vertex-id="${id.idx}:${id.version}"]`,
      );
      if (!el) continue;

      if (config.enabled) {
        (el as SVGElement).setAttribute('fill-opacity', String(config.opacity));
      } else {
        (el as SVGElement).removeAttribute('fill-opacity');
      }
    }
  }

  /** Revert preview and restore last committed state */
  function revertGlassPreview(): void {
    if (glassCommitted !== null) {
      applyGlassPreview(glassCommitted);
    } else {
      for (const id of currentSelection) {
        const el = container.ownerDocument.querySelector(
          `[data-vertex-id="${id.idx}:${id.version}"]`,
        );
        if (el) {
          (el as SVGElement).removeAttribute('fill-opacity');
        }
      }
    }
  }

  // Glass toggle handler
  glassToggle.addEventListener('change', () => {
    const config = getGlassConfig();
    glassDraft = config;
    if (glassToggle.checked) {
      applyGlassConfig(config);
      glassCommitted = config;
      glassBody.hidden = false;
    } else {
      applyGlassConfig({ ...config, enabled: false });
      glassCommitted = { ...config, enabled: false };
      glassBody.hidden = true;
    }
  });

  // Glass opacity slider - real-time preview during drag, commit on release
  glassOpacityInput.addEventListener('input', () => {
    glassOpacityValue.textContent = glassOpacityInput.value;
    if (!glassToggle.checked) return;

    const draft: GlassConfig = {
      enabled: true,
      opacity: parseFloat(glassOpacityInput.value) || 0.5,
    };
    glassDraft = draft;
    applyGlassPreview(draft);
  });

  glassOpacityInput.addEventListener('change', () => {
    if (!glassToggle.checked) return;
    const config = getGlassConfig();
    glassCommitted = config;
    applyGlassConfig(config);
    glassDraft = null;
  });

  glassOpacityInput.addEventListener('pointerup', () => {
    if (!glassToggle.checked) return;
    const config = getGlassConfig();
    glassCommitted = config;
    applyGlassConfig(config);
    glassDraft = null;
  });

  /** Update glass section UI based on resolved styles from the engine */
  function updateGlassSection(selection: readonly SlotmapId[]): void {
    if (selection.length === 0) {
      glassSection.classList.add('disabled');
      glassToggle.checked = false;
      glassBody.hidden = true;
      glassCommitted = null;
      glassDraft = null;
      return;
    }

    glassSection.classList.remove('disabled');

    // Get resolved style for all selected vertices
    const resolvedStyles: (GlassConfig | null)[] = [];
    for (const id of selection) {
      const result = session.getResolvedStyle(id);
      if (result.ok && result.value.glass) {
        resolvedStyles.push(result.value.glass);
      } else {
        resolvedStyles.push(null);
      }
    }

    const nonNull = resolvedStyles.filter((s): s is GlassConfig => s !== null);

    if (nonNull.length === 0) {
      glassToggle.checked = false;
      glassBody.hidden = true;
      glassOpacityInput.value = '0.5';
      glassOpacityValue.textContent = '0.5';
      glassCommitted = null;
    } else {
      const first = nonNull[0]!;
      const allMatch = nonNull.every(
        (s) => s.enabled === first.enabled && s.opacity === first.opacity,
      );

      if (allMatch) {
        glassToggle.checked = first.enabled;
        glassBody.hidden = !first.enabled;
        glassOpacityInput.value = String(first.opacity);
        glassOpacityValue.textContent = String(first.opacity);
        glassCommitted = first;
      } else {
        glassToggle.checked = false;
        glassBody.hidden = true;
        glassOpacityInput.value = '0.5';
        glassOpacityValue.textContent = '—';
        glassCommitted = null;
      }
    }
  }

  // ─── Gradient section handlers (PR-SP3) ────────────────────────────────────
  let gradientDraft: GradientConfig | null = null;
  let gradientCommitted: GradientConfig | null = null;

  /** Build a full GradientConfig from the current control values */
  function getGradientConfig(): GradientConfig {
    const kind = gradientTypeSelect.value === 'linear' ? 'Linear' : 'Radial';
    return {
      kind,
      angle: parseInt(gradientAngleInput.value, 10) || 0,
      fx: 0.5,
      fy: 0.5,
      stops: [
        { offset: 0, color: gradientColor1.value },
        { offset: 1, color: gradientColor2.value },
      ],
    };
  }

  /** Apply gradient config to all selected vertices via a single transaction */
  function applyGradientConfig(config: GradientConfig): void {
    if (currentSelection.length === 0) return;

    const commands: string[] = [];
    for (const id of currentSelection) {
      const style: Record<string, string> = {
        gradient: config.kind !== null ? '1' : '0',
        gradientType: config.kind === 'Linear' ? 'linear' : 'radial',
        gradientAngle: String(config.angle),
        gradientColor1: config.stops[0]?.color ?? '#ffffff',
        gradientColor2: config.stops[1]?.color ?? '#000000',
      };
      commands.push(JSON.stringify({
        ChangeStyle: {
          id: slotmapIdToField(id),
          style,
        },
      }));
    }

    if (commands.length === 0) return;
    const result = session.executeTransaction(commands);
    if (!result.ok) {
      console.warn('[inspector] Gradient ChangeStyle failed:', result.error);
    }
  }

  /** Apply gradient preview directly to DOM (no engine mutation, no undo) */
  function applyGradientPreview(config: GradientConfig): void {
    if (currentSelection.length === 0) return;

    for (const id of currentSelection) {
      const el = container.ownerDocument.querySelector(
        `[data-vertex-id="${id.idx}:${id.version}"]`,
      );
      if (!el) continue;

      if (config.kind !== null) {
        // For preview, we use a gradient fill - the actual rendering
        // will use the gradient def from the engine. For real-time preview,
        // we set a temporary fill attribute.
        (el as SVGElement).setAttribute('fill', `url(#grad-preview-${id.idx})`);
      } else {
        (el as SVGElement).removeAttribute('fill');
      }
    }
  }

  /** Revert preview and restore last committed state */
  function revertGradientPreview(): void {
    if (gradientCommitted !== null) {
      applyGradientPreview(gradientCommitted);
    } else {
      for (const id of currentSelection) {
        const el = container.ownerDocument.querySelector(
          `[data-vertex-id="${id.idx}:${id.version}"]`,
        );
        if (el) {
          (el as SVGElement).removeAttribute('fill');
        }
      }
    }
  }

  // Gradient toggle handler
  gradientToggle.addEventListener('change', () => {
    const config = getGradientConfig();
    gradientDraft = config;
    if (gradientToggle.checked) {
      applyGradientConfig(config);
      gradientCommitted = config;
      gradientBody.hidden = false;
      // Show/hide angle row based on type
      gradientAngleRow.style.display = config.kind === 'Linear' ? 'flex' : 'none';
    } else {
      applyGradientConfig({ ...config, kind: null as never });
      gradientCommitted = { ...config, kind: null as never };
      gradientBody.hidden = true;
    }
  });

  // Gradient type selector
  gradientTypeSelect.addEventListener('change', () => {
    const config = getGradientConfig();
    gradientAngleRow.style.display = config.kind === 'Linear' ? 'flex' : 'none';
    if (!gradientToggle.checked) return;
    gradientDraft = config;
    applyGradientPreview(config);
  });

  // Gradient angle slider - real-time preview during drag, commit on release
  gradientAngleInput.addEventListener('input', () => {
    gradientAngleValue.textContent = `${gradientAngleInput.value}°`;
    if (!gradientToggle.checked) return;

    const draft: GradientConfig = {
      kind: gradientTypeSelect.value === 'linear' ? 'Linear' : 'Radial',
      angle: parseInt(gradientAngleInput.value, 10) || 0,
      fx: 0.5,
      fy: 0.5,
      stops: [
        { offset: 0, color: gradientColor1.value },
        { offset: 1, color: gradientColor2.value },
      ],
    };
    gradientDraft = draft;
    applyGradientPreview(draft);
  });

  gradientAngleInput.addEventListener('change', () => {
    if (!gradientToggle.checked) return;
    const config = getGradientConfig();
    gradientCommitted = config;
    applyGradientConfig(config);
    gradientDraft = null;
  });

  gradientAngleInput.addEventListener('pointerup', () => {
    if (!gradientToggle.checked) return;
    const config = getGradientConfig();
    gradientCommitted = config;
    applyGradientConfig(config);
    gradientDraft = null;
  });

  // Gradient color stop handlers
  gradientColor1.addEventListener('input', () => {
    if (!gradientToggle.checked) return;
    const draft: GradientConfig = {
      kind: gradientTypeSelect.value === 'linear' ? 'Linear' : 'Radial',
      angle: parseInt(gradientAngleInput.value, 10) || 0,
      fx: 0.5,
      fy: 0.5,
      stops: [
        { offset: 0, color: gradientColor1.value },
        { offset: 1, color: gradientColor2.value },
      ],
    };
    gradientDraft = draft;
    applyGradientPreview(draft);
  });

  gradientColor1.addEventListener('change', () => {
    if (!gradientToggle.checked) return;
    const config = getGradientConfig();
    gradientCommitted = config;
    applyGradientConfig(config);
    gradientDraft = null;
  });

  gradientColor2.addEventListener('input', () => {
    if (!gradientToggle.checked) return;
    const draft: GradientConfig = {
      kind: gradientTypeSelect.value === 'linear' ? 'Linear' : 'Radial',
      angle: parseInt(gradientAngleInput.value, 10) || 0,
      fx: 0.5,
      fy: 0.5,
      stops: [
        { offset: 0, color: gradientColor1.value },
        { offset: 1, color: gradientColor2.value },
      ],
    };
    gradientDraft = draft;
    applyGradientPreview(draft);
  });

  gradientColor2.addEventListener('change', () => {
    if (!gradientToggle.checked) return;
    const config = getGradientConfig();
    gradientCommitted = config;
    applyGradientConfig(config);
    gradientDraft = null;
  });

  /** Update gradient section UI based on resolved styles from the engine */
  function updateGradientSection(selection: readonly SlotmapId[]): void {
    if (selection.length === 0) {
      gradientSection.classList.add('disabled');
      gradientToggle.checked = false;
      gradientBody.hidden = true;
      gradientCommitted = null;
      gradientDraft = null;
      return;
    }

    gradientSection.classList.remove('disabled');

    // Get resolved style for all selected vertices
    const resolvedStyles: (GradientConfig | null)[] = [];
    for (const id of selection) {
      const result = session.getResolvedStyle(id);
      if (result.ok && result.value.gradient) {
        resolvedStyles.push(result.value.gradient);
      } else {
        resolvedStyles.push(null);
      }
    }

    const nonNull = resolvedStyles.filter((s): s is GradientConfig => s !== null);

    if (nonNull.length === 0) {
      gradientToggle.checked = false;
      gradientBody.hidden = true;
      gradientTypeSelect.value = 'linear';
      gradientAngleInput.value = '0';
      gradientAngleValue.textContent = '0°';
      gradientColor1.value = '#ffffff';
      gradientColor2.value = '#000000';
      gradientAngleRow.style.display = 'flex';
      gradientCommitted = null;
    } else {
      const first = nonNull[0]!;
      const allMatch = nonNull.every(
        (s) =>
          s.kind === first.kind &&
          s.angle === first.angle &&
          s.stops[0]?.color === first.stops[0]?.color &&
          s.stops[1]?.color === first.stops[1]?.color,
      );

      if (allMatch) {
        gradientToggle.checked = true;
        gradientBody.hidden = false;
        gradientTypeSelect.value = first.kind === 'Linear' ? 'linear' : 'radial';
        gradientAngleInput.value = String(first.angle);
        gradientAngleValue.textContent = `${first.angle}°`;
        gradientColor1.value = first.stops[0]?.color ?? '#ffffff';
        gradientColor2.value = first.stops[1]?.color ?? '#000000';
        gradientAngleRow.style.display = first.kind === 'Linear' ? 'flex' : 'none';
        gradientCommitted = first;
      } else {
        gradientToggle.checked = false;
        gradientBody.hidden = true;
        gradientTypeSelect.value = 'linear';
        gradientAngleInput.value = '0';
        gradientAngleValue.textContent = '—';
        gradientColor1.value = '#ffffff';
        gradientColor2.value = '#000000';
        gradientCommitted = null;
      }
    }
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
    sceneCache: ScenePage[],
    _activePageIdx: number,
  ): void {
    currentSelection = selection;

    const hasSelection = selection.length > 0;
    noSelectionMsg.hidden = hasSelection;
    styleFields.hidden = !hasSelection;
    textNoSelMsg.hidden = hasSelection;
    textFields.hidden = !hasSelection;
    arrangeNoSelMsg.hidden = hasSelection;
    arrangeFields.hidden = !hasSelection;

    // Populate Position inputs from scene geometry (single-selection only)
    if (selection.length === 1 && sceneCache.length > 0) {
      const id = selection[0]!;
      let geom: { x: number; y: number; width: number; height: number } | null = null;
      outer: for (const page of sceneCache) {
        for (const elem of page.display_list) {
          const e = elem as Record<string, unknown>;
          for (const key of ['Rect', 'RoundedRect', 'Ellipse'] as const) {
            const variant = e[key] as Record<string, unknown> | undefined;
            if (!variant) continue;
            const idField = variant['id'] as { idx?: number; version?: number } | undefined;
            if (!idField) continue;
            if (idField.idx === id.idx && idField.version === id.version) {
              const bounds = variant['bounds'] as
                | { origin?: { x?: number; y?: number }; size?: { width?: number; height?: number } }
                | undefined;
              if (bounds?.origin && bounds?.size) {
                geom = {
                  x: bounds.origin.x ?? 0,
                  y: bounds.origin.y ?? 0,
                  width: bounds.size.width ?? 0,
                  height: bounds.size.height ?? 0,
                };
              }
              break outer;
            }
          }
        }
      }
      if (geom) {
        xInput.value = String(Math.round(geom.x));
        yInput.value = String(Math.round(geom.y));
        wInput.value = String(Math.round(geom.width));
        hInput.value = String(Math.round(geom.height));
      }
    }

    // Disable Position inputs when not single-selected
    const singleSelection = selection.length === 1;
    xInput.disabled = !singleSelection;
    yInput.disabled = !singleSelection;
    wInput.disabled = !singleSelection;
    hInput.disabled = !singleSelection;
    rotateBtn.disabled = !singleSelection;
    rotateBtn.classList.toggle('disabled-btn', !singleSelection);

    // Update shadow section based on selection
    updateShadowSection(selection);

    // Update glass section based on selection
    updateGlassSection(selection);

    // Update gradient section based on selection
    updateGradientSection(selection);

    // When no selection, clear previous debounce
    if (!hasSelection && debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  // Initial state: no selection
  update([], [], 0);

  return { container, closeBtn, setEditor, setSelectionSize, update };
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
