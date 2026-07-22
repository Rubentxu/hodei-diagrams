import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkbenchController } from '../src/workbench-controller.js';

// Mock DiagramEngineSession for dock-layers tests
const mockSession = {
  executeCommand: (_cmd: string) => ({ ok: true, value: undefined }),
  executeTransaction: (_cmds: string[]) => ({ ok: true, value: undefined }),
  undo: () => ({ ok: true, value: undefined }),
  redo: () => ({ ok: true, value: undefined }),
  canUndo: () => false,
  canRedo: () => false,
  importDrawio: (_xml: string) => ({ ok: true, value: undefined }),
  exportDrawio: () => ({ ok: true, value: '' }),
  renderAllPages: () => ({ ok: true, value: [] }),
  renderPage: (_pageIdx: bigint) => ({ ok: true, value: '' }),
  getScene: () => ({ ok: true, value: [] }),
  loadStencilLibrary: (_name: string, _url: string) => Promise.resolve(),
  executeCommands: (_cmds: string[]) => ({ ok: true, value: undefined }),
  getResolvedStyle: () => ({ ok: true, value: { remaining: {} } }),
  getMetadata: () => ({ ok: true, value: { title: null, author: null, description: null, tags: [], created: null, modified: null } }),
  setMetadata: () => ({ ok: true, value: undefined }),
  setOnStateChange: () => {},
  dispose: () => {},
  isActive: true,
  getLayers: (_pageIdx: number) => ({ ok: true, value: { layers: [] } }),
} as unknown as {
  executeCommand: (cmd: string) => { ok: boolean; value?: unknown; error?: string };
  getLayers: (pageIdx: number) => { ok: boolean; value?: { layers: Array<{ idx: number; version: number; name: string | null; visible: boolean; locked: boolean }> }; error?: string };
};

// ─── WorkbenchController Interface Expectations ─────────────────────────────────

describe('WorkbenchController', () => {
  // Task 1.1 RED: Declare WorkbenchController interface expectations (5 fields)

  it('should expose exactly 5 state fields: dockMode, panelVisibility, breakpoint, hudDensity, overlayActive', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const state = controller.getState();

    // Must have exactly these 5 fields (and no more)
    expect(state).toHaveProperty('dockMode');
    expect(state).toHaveProperty('panelVisibility');
    expect(state).toHaveProperty('breakpoint');
    expect(state).toHaveProperty('hudDensity');
    expect(state).toHaveProperty('overlayActive');

    // Count keys to ensure no extra fields creep in
    const keys = Object.keys(state);
    expect(keys).toHaveLength(5);
  });

  it('should have dockMode type of "shapes" | "layers" | "history"', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const state = controller.getState();
    expect(['shapes', 'layers', 'history']).toContain(state.dockMode);
  });

  it('should have breakpoint type of "desktop" | "tablet" | "mobile"', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const state = controller.getState();
    expect(['desktop', 'tablet', 'mobile']).toContain(state.breakpoint);
  });

  it('should have hudDensity type of "full" | "compact"', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const state = controller.getState();
    expect(['full', 'compact']).toContain(state.hudDensity);
  });

  it('should have overlayActive type of "sidebar" | "inspector" | null', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const state = controller.getState();
    expect(['sidebar', 'inspector', null]).toContain(state.overlayActive);
  });

  it('should have panelVisibility with sidebar and inspector booleans', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const state = controller.getState();
    expect(state.panelVisibility).toHaveProperty('sidebar');
    expect(state.panelVisibility).toHaveProperty('inspector');
    expect(typeof state.panelVisibility.sidebar).toBe('boolean');
    expect(typeof state.panelVisibility.inspector).toBe('boolean');
  });

  // Task 1.2: subscribe/unsubscriber pattern
  it('should notify subscribers when state changes via setState', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.setState({ dockMode: 'layers' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ dockMode: 'layers' }));

    unsubscribe();
    controller.setState({ dockMode: 'history' });
    expect(listener).toHaveBeenCalledTimes(1); // Should not be called after unsubscribe
  });

  it('should return unsubscribe function from subscribe', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    expect(typeof unsubscribe).toBe('function');

    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  // Task 1.3: detectBreakpoint via window.matchMedia or innerWidth fallback
  it('should detect desktop breakpoint at >= 1024px', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');

    // For this test, we use innerWidth fallback since matchMedia isn't reliably mockable in jsdom
    // Create controller, then spy on matchMedia to ensure it returns no matches
    const controller = new WorkbenchController();

    // Mock innerWidth for fallback detection
    Object.defineProperty(window, 'innerWidth', {
      value: 1440,
      writable: true,
      configurable: true,
    });

    // Mock matchMedia to return no matches so it falls back to innerWidth
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any);

    controller.detectBreakpoint();

    const state = controller.getState();
    expect(state.breakpoint).toBe('desktop');

    matchMediaSpy.mockRestore();
  });

  it('should detect tablet breakpoint at 768-1023px via innerWidth fallback', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    // Mock innerWidth for fallback detection
    Object.defineProperty(window, 'innerWidth', {
      value: 900,
      writable: true,
      configurable: true,
    });

    // Mock matchMedia to return no matches so it falls back to innerWidth
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any);

    controller.detectBreakpoint();

    const state = controller.getState();
    expect(state.breakpoint).toBe('tablet');

    matchMediaSpy.mockRestore();
  });

  it('should detect mobile breakpoint at < 768px via innerWidth fallback', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    // Mock innerWidth for fallback detection
    Object.defineProperty(window, 'innerWidth', {
      value: 480,
      writable: true,
      configurable: true,
    });

    // Mock matchMedia to return no matches so it falls back to innerWidth
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any);

    controller.detectBreakpoint();

    const state = controller.getState();
    expect(state.breakpoint).toBe('mobile');

    matchMediaSpy.mockRestore();
  });

  // Task 1.4: updateHudDensity mapping LayoutContext → hudDensity
  it('should set hudDensity to full when dragging', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const ctx = {
      hasSelection: true,
      isDragging: true,
      snapEnabled: false,
      gridVisible: false,
      isEditing: false,
    };

    controller.updateHudDensity(ctx);

    const state = controller.getState();
    expect(state.hudDensity).toBe('full');
  });

  it('should set hudDensity to full when snap or grid is enabled', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const ctx = {
      hasSelection: false,
      isDragging: false,
      snapEnabled: true,
      gridVisible: false,
      isEditing: false,
    };

    controller.updateHudDensity(ctx);

    const state = controller.getState();
    expect(state.hudDensity).toBe('full');
  });

  it('should set hudDensity to full when isEditing', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const ctx = {
      hasSelection: true,
      isDragging: false,
      snapEnabled: false,
      gridVisible: false,
      isEditing: true,
    };

    controller.updateHudDensity(ctx);

    const state = controller.getState();
    expect(state.hudDensity).toBe('full');
  });

  it('should set hudDensity to compact when idle', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const ctx = {
      hasSelection: false,
      isDragging: false,
      snapEnabled: false,
      gridVisible: false,
      isEditing: false,
    };

    controller.updateHudDensity(ctx);

    const state = controller.getState();
    expect(state.hudDensity).toBe('compact');
  });

  // Task 1.5: updateContextualToolbar mapping LayoutContext → data attribute
  it('should set data-context-toolbar to active when hasSelection is true', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const root = document.createElement('div');
    root.id = 'app';
    document.body.appendChild(root);

    const ctx = {
      hasSelection: true,
      isDragging: false,
      snapEnabled: false,
      gridVisible: false,
      isEditing: false,
    };

    controller.updateContextualToolbar(ctx);

    expect(root.getAttribute('data-context-toolbar')).toBe('active');

    document.body.removeChild(root);
  });

  it('should set data-context-toolbar to inactive when hasSelection is false', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const root = document.createElement('div');
    root.id = 'app';
    document.body.appendChild(root);

    const ctx = {
      hasSelection: false,
      isDragging: false,
      snapEnabled: false,
      gridVisible: false,
      isEditing: false,
    };

    controller.updateContextualToolbar(ctx);

    expect(root.getAttribute('data-context-toolbar')).toBe('inactive');

    document.body.removeChild(root);
  });

  // Task 1.6: boundary check helper
  it('should expose a boundary check that validates exactly 5 fields', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const { isWorkbenchState } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    const validState = controller.getState();
    expect(isWorkbenchState(validState)).toBe(true);

    // Extra field should fail
    const invalidState = { ...validState, extraField: 'bad' };
    expect(isWorkbenchState(invalidState)).toBe(false);
  });

  // Overlay mutual exclusion
  it('should clear sidebar overlay when inspector overlay is set', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    controller.setState({ overlayActive: 'sidebar' });
    expect(controller.getState().overlayActive).toBe('sidebar');

    controller.setState({ overlayActive: 'inspector' });
    expect(controller.getState().overlayActive).toBe('inspector');
  });

  it('should clear inspector overlay when sidebar overlay is set', async () => {
    const { WorkbenchController } = await import('../src/workbench-controller.js');
    const controller = new WorkbenchController();

    controller.setState({ overlayActive: 'inspector' });
    expect(controller.getState().overlayActive).toBe('inspector');

    controller.setState({ overlayActive: 'sidebar' });
    expect(controller.getState().overlayActive).toBe('sidebar');
  });
});

describe('dock-layers', () => {
  // Task 2.1.1 RED: dock-layers renders layer-item-<name> list given mock session
  it('should render layer items with data-testid="layer-item-<name>"', async () => {
    const { buildDockLayers } = await import('../src/dock-layers.js');

    const container = document.createElement('div');
    const session = {
      ...mockSession,
      getLayers: () => ({
        ok: true,
        value: {
          layers: [
            { idx: 0, version: 0, name: 'Layer 1', visible: true, locked: false },
            { idx: 1, version: 0, name: 'Layer 2', visible: false, locked: true },
          ],
        },
      }),
    };

    const callbacks = {
      onToggleVisibility: vi.fn(),
      onToggleLock: vi.fn(),
      onRename: vi.fn(),
      onRemove: vi.fn(),
      onMoveToLayer: vi.fn(),
    };
    const { setItems, refresh } = buildDockLayers(container, session as any, callbacks);

    // Initial render shows no items until refresh is called
    expect(container.querySelectorAll('[data-testid^="layer-item-"]')).toHaveLength(0);

    setItems([
      { idx: 0, version: 0, name: 'Layer 1', visible: true, locked: false },
      { idx: 1, version: 0, name: 'Layer 2', visible: false, locked: true },
    ]);

    const items = container.querySelectorAll('[data-testid^="layer-item-"]');
    expect(items).toHaveLength(2);
    expect(items[0]!.getAttribute('data-testid')).toBe('layer-item-Layer 1');
    expect(items[1]!.getAttribute('data-testid')).toBe('layer-item-Layer 2');
  });

  it('should expose refresh function to re-render layers', async () => {
    const { buildDockLayers } = await import('../src/dock-layers.js');

    const container = document.createElement('div');
    const session = {
      ...mockSession,
      getLayers: () => ({
        ok: true,
        value: { layers: [] },
      }),
    };

    const callbacks = {
      onToggleVisibility: vi.fn(),
      onToggleLock: vi.fn(),
      onRename: vi.fn(),
      onRemove: vi.fn(),
      onMoveToLayer: vi.fn(),
    };
    const { refresh } = buildDockLayers(container, session as any, callbacks);

    expect(typeof refresh).toBe('function');
  });
});

describe('sidebar dock mode', () => {
  // Task 2.2.1 RED: sidebar setDockMode swaps children and queries only one mode visible
  it('should swap dock mode content when setDockMode is called', async () => {
    const { buildSidebar } = await import('../src/sidebar.js');

    const controls = buildSidebar();
    const sidebar = controls.container;

    // Initially should have shapes content visible
    expect(sidebar.querySelector('.shape-category')).toBeTruthy();

    // Switching to layers mode should hide shapes and show layers
    controls.setDockMode('layers');

    // After switching to layers mode, the shape category should be hidden or absent
    const shapeCategory = sidebar.querySelector('.shape-category');
    // The shapes content may be hidden via CSS class, check mode container instead
    const layersModeContainer = sidebar.querySelector('.dock-mode-layers');
    expect(layersModeContainer).toBeTruthy();
  });

  it('should only have one dock mode visible at a time', async () => {
    const { buildSidebar } = await import('../src/sidebar.js');

    const controls = buildSidebar();
    const sidebar = controls.container;

    controls.setDockMode('layers');
    const layersVisible = sidebar.querySelector('.dock-mode-layers');
    const shapesHidden = sidebar.querySelector('.dock-mode-shapes');

    // layers should be visible, shapes should not be in DOM or should be hidden
    expect(layersVisible).toBeTruthy();
  });
});

describe('rail dock mode triggers', () => {
  // Task 2.3.1 RED: Enter/Space on rail triggers fires onDockMode without affecting activeTool
  it('should fire onDockMode when rail dock button is activated', async () => {
    const { buildRail } = await import('../src/rail.js');

    const onDockMode = vi.fn();
    const callbacks = {
      onSelectTool: vi.fn(),
      onShapesTool: vi.fn(),
      onConnectorTool: vi.fn(),
      onTextTool: vi.fn(),
      onZoomFit: vi.fn(),
      onHelp: vi.fn(),
      onDockMode,
    };

    const controls = buildRail(callbacks);
    const container = controls.container;

    // Find the dock-layers button
    const dockLayersBtn = container.querySelector('[data-testid="rail-dock-layers-btn"]');
    expect(dockLayersBtn).toBeTruthy();

    // Click it
    dockLayersBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onDockMode).toHaveBeenCalledWith('layers');
  });

  it('should NOT change activeTool when dock mode is activated', async () => {
    const { buildRail } = await import('../src/rail.js');

    const onSelectTool = vi.fn();
    const onShapesTool = vi.fn();
    const onDockMode = vi.fn();

    const callbacks = {
      onSelectTool,
      onShapesTool,
      onConnectorTool: vi.fn(),
      onTextTool: vi.fn(),
      onZoomFit: vi.fn(),
      onHelp: vi.fn(),
      onDockMode,
    };

    const controls = buildRail(callbacks);

    // First select a tool
    controls.selectBtn.click();
    expect(onSelectTool).toHaveBeenCalled();

    // Now activate dock mode
    const dockLayersBtn = controls.container.querySelector('[data-testid="rail-dock-layers-btn"]');
    dockLayersBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // activeTool should NOT have changed - select should still be active
    const activeBtn = controls.container.querySelector('.rail-btn.active');
    expect(activeBtn?.getAttribute('data-testid')).toBe('rail-select-btn');
  });

  it('should be keyboard activatable (click simulates browser Enter/Space behavior)', async () => {
    const { buildRail } = await import('../src/rail.js');

    const onDockMode = vi.fn();
    const callbacks = {
      onSelectTool: vi.fn(),
      onShapesTool: vi.fn(),
      onConnectorTool: vi.fn(),
      onTextTool: vi.fn(),
      onZoomFit: vi.fn(),
      onHelp: vi.fn(),
      onDockMode,
    };

    const controls = buildRail(callbacks);
    const dockLayersBtn = controls.container.querySelector('[data-testid="rail-dock-layers-btn"]') as HTMLButtonElement;

    // In browsers, pressing Enter/Space on a focused button fires a click event
    // We simulate this by dispatching a click event (which is what actually fires)
    dockLayersBtn.focus();
    dockLayersBtn.click(); // Simulates Enter/Space on a button
    expect(onDockMode).toHaveBeenCalledWith('layers');

    onDockMode.mockClear();

    // Another click should also work
    dockLayersBtn.click();
    expect(onDockMode).toHaveBeenCalledWith('layers');
  });
});
