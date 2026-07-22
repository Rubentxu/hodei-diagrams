/**
 * ui-dock-layers.test.ts — buildDockLayers unit tests (R1a task 1.2)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildDockLayers, type LayerItem } from '../src/dock-layers.js';
import type { DiagramEngineSession } from '../src/session.js';
import type { Result } from '../src/types.js';

const mockSession = {
  executeCommand: () => ({ ok: true, value: undefined }) as Result<void, string>,
  getLayers: () => ({ ok: true, value: { page_idx: 0, layers: [] } }),
  dispose: () => {}, isActive: true,
} as unknown as DiagramEngineSession;

function layer(name: string, extra: Partial<LayerItem> = {}): LayerItem {
  return { idx: 0, version: 1, name: name === '(default)' ? null : name, visible: true, locked: false, ...extra };
}

describe('buildDockLayers', () => {
  let container: HTMLElement;
  let cb: { onToggleVisibility: ReturnType<typeof vi.fn>; onToggleLock: ReturnType<typeof vi.fn>; onRename: ReturnType<typeof vi.fn>; onRemove: ReturnType<typeof vi.fn>; onMoveToLayer: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    container = document.createElement('div');
    cb = { onToggleVisibility: vi.fn(), onToggleLock: vi.fn(), onRename: vi.fn(), onRemove: vi.fn(), onMoveToLayer: vi.fn() };
  });

  // task 1.2.1: renders layer-item testids
  it('renders layer-item testids for named and default layers', () => {
    buildDockLayers(container, mockSession, cb).setItems([layer('L1'), layer('(default)')]);
    expect(container.querySelector('[data-testid="layer-item-L1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="layer-item-(default)"]')).not.toBeNull();
  });

  it('visibility button reflects layer state', () => {
    buildDockLayers(container, mockSession, cb).setItems([layer('L1', { visible: false })]);
    expect(container.querySelector('[data-testid="layer-visibility-L1"]')!.getAttribute('data-state')).toBe('hidden');
  });

  it('lock button reflects layer state', () => {
    buildDockLayers(container, mockSession, cb).setItems([layer('L1', { locked: true })]);
    expect(container.querySelector('[data-testid="layer-lock-L1"]')!.getAttribute('data-state')).toBe('locked');
  });

  it('rename button renders per layer', () => {
    buildDockLayers(container, mockSession, cb).setItems([layer('L1')]);
    expect(container.querySelector('[data-testid="layer-rename-L1"]')).not.toBeNull();
  });

  it('remove button only for named (non-default) layers', () => {
    buildDockLayers(container, mockSession, cb).setItems([layer('L1'), layer('(default)')]);
    expect(container.querySelector('[data-testid="layer-remove-L1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="layer-remove-(default)"]')).toBeNull();
  });

  // task 1.2.2: callbacks fire correctly
  it('visibility button calls onToggleVisibility(idx, version, currentVisible)', () => {
    const dock = buildDockLayers(container, mockSession, cb);
    dock.setItems([layer('L1', { idx: 5, version: 3, visible: true })]);
    (container.querySelector('[data-testid="layer-visibility-L1"]') as HTMLButtonElement).click();
    expect(cb.onToggleVisibility).toHaveBeenCalledWith(5, 3, true);
  });

  it('lock button calls onToggleLock(idx, version, currentLocked)', () => {
    const dock = buildDockLayers(container, mockSession, cb);
    dock.setItems([layer('L1', { idx: 7, version: 2, locked: false })]);
    (container.querySelector('[data-testid="layer-lock-L1"]') as HTMLButtonElement).click();
    expect(cb.onToggleLock).toHaveBeenCalledWith(7, 2, false);
  });

  it('rename button calls onRename(idx, version, currentName)', () => {
    const dock = buildDockLayers(container, mockSession, cb);
    dock.setItems([layer('MyLayer', { idx: 9, version: 4 })]);
    (container.querySelector('[data-testid="layer-rename-MyLayer"]') as HTMLButtonElement).click();
    expect(cb.onRename).toHaveBeenCalledWith(9, 4, 'MyLayer');
  });

  it('remove button calls onRemove(idx, version)', () => {
    const dock = buildDockLayers(container, mockSession, cb);
    dock.setItems([layer('Removable', { idx: 3, version: 7 })]);
    (container.querySelector('[data-testid="layer-remove-Removable"]') as HTMLButtonElement).click();
    expect(cb.onRemove).toHaveBeenCalledWith(3, 7);
  });

  it('row click calls onMoveToLayer; button click does not', () => {
    const dock = buildDockLayers(container, mockSession, cb);
    dock.setItems([layer('Target', { idx: 2, version: 1 })]);
    (container.querySelector('[data-testid="layer-item-Target"]') as HTMLDivElement).click();
    expect(cb.onMoveToLayer).toHaveBeenCalledWith(2, 1);
    cb.onMoveToLayer.mockClear();
    (container.querySelector('[data-testid="layer-visibility-Target"]') as HTMLButtonElement).click();
    expect(cb.onMoveToLayer).not.toHaveBeenCalled();
  });

  // task 1.2.4: { setItems, refresh }
  it('setItems replaces rendered layers', () => {
    const dock = buildDockLayers(container, mockSession, cb);
    dock.setItems([layer('First')]);
    dock.setItems([layer('Second')]);
    expect(container.querySelector('[data-testid="layer-item-First"]')).toBeNull();
    expect(container.querySelector('[data-testid="layer-item-Second"]')).not.toBeNull();
  });

  it('refresh reads from session', () => {
    const session = { ...mockSession, getLayers: () => ({ ok: true, value: { page_idx: 0, layers: [layer('Refreshed')] } }) } as unknown as DiagramEngineSession;
    buildDockLayers(container, session, cb).refresh();
    expect(container.querySelector('[data-testid="layer-item-Refreshed"]')).not.toBeNull();
  });
});
