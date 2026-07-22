/**
 * ui-rail.test.ts — R1b: rail dock-mode triggers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRail } from '../src/rail.js';

describe('rail dock-mode triggers', () => {
  const makeCallbacks = (overrides = {}) => ({
    onSelectTool: vi.fn(), onShapesTool: vi.fn(), onConnectorTool: vi.fn(),
    onTextTool: vi.fn(), onZoomFit: vi.fn(), onHelp: vi.fn(), onDockMode: vi.fn(), ...overrides,
  });

  let rail: ReturnType<typeof buildRail>;
  beforeEach(() => {
    rail = buildRail(makeCallbacks());
    document.body.appendChild(rail.container);
  });

  // 2.2.1: onDockMode fires correctly
  it('shapesBtn calls onDockMode(shapes)', () => {
    const cb = makeCallbacks();
    rail = buildRail(cb); document.body.appendChild(rail.container);
    rail.shapesBtn.click();
    expect(cb.onDockMode).toHaveBeenCalledWith('shapes');
  });

  it('dockLayersBtn calls onDockMode(layers)', () => {
    const cb = makeCallbacks();
    rail = buildRail(cb); document.body.appendChild(rail.container);
    rail.dockLayersBtn.click();
    expect(cb.onDockMode).toHaveBeenCalledWith('layers');
  });

  it('dockHistoryBtn calls onDockMode(history)', () => {
    const cb = makeCallbacks();
    rail = buildRail(cb); document.body.appendChild(rail.container);
    rail.dockHistoryBtn.click();
    expect(cb.onDockMode).toHaveBeenCalledWith('history');
  });

  it('does not throw when onDockMode is absent', () => {
    rail = buildRail({ onSelectTool: () => {}, onShapesTool: () => {}, onConnectorTool: () => {}, onTextTool: () => {}, onZoomFit: () => {}, onHelp: () => {} });
    document.body.appendChild(rail.container);
    expect(() => rail.dockLayersBtn.click()).not.toThrow();
  });

  // 2.2.1: keyboard activation
  it('dockLayersBtn responds to Enter', () => {
    const cb = makeCallbacks();
    rail = buildRail(cb); document.body.appendChild(rail.container);
    rail.dockLayersBtn.focus();
    rail.dockLayersBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(cb.onDockMode).toHaveBeenCalledWith('layers');
  });

  it('dockLayersBtn responds to Space', () => {
    const cb = makeCallbacks();
    rail = buildRail(cb); document.body.appendChild(rail.container);
    rail.dockLayersBtn.focus();
    rail.dockLayersBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(cb.onDockMode).toHaveBeenCalledWith('layers');
  });

  it('dockHistoryBtn responds to Enter', () => {
    const cb = makeCallbacks();
    rail = buildRail(cb); document.body.appendChild(rail.container);
    rail.dockHistoryBtn.focus();
    rail.dockHistoryBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(cb.onDockMode).toHaveBeenCalledWith('history');
  });

  // 2.2.2: existing tool callbacks still work
  it('shapesBtn still calls onShapesTool', () => {
    const cb = makeCallbacks();
    rail = buildRail(cb); document.body.appendChild(rail.container);
    rail.shapesBtn.click();
    expect(cb.onShapesTool).toHaveBeenCalled();
  });

  it('connectorBtn calls onConnectorTool', () => {
    const cb = makeCallbacks();
    rail = buildRail(cb); document.body.appendChild(rail.container);
    rail.connectorBtn.click();
    expect(cb.onConnectorTool).toHaveBeenCalled();
  });

  // 2.2.2: dock triggers do not affect active tool
  it('dockLayersBtn does not set active tool class', () => {
    rail.dockLayersBtn.click();
    expect(rail.shapesBtn.classList.contains('active')).toBe(false);
    expect(rail.connectorBtn.classList.contains('active')).toBe(false);
  });

  // 2.2.2: testid preservation
  it('has correct dock button testids', () => {
    expect(rail.dockLayersBtn.getAttribute('data-testid')).toBe('rail-dock-layers-btn');
    expect(rail.dockHistoryBtn.getAttribute('data-testid')).toBe('rail-dock-history-btn');
  });
});
