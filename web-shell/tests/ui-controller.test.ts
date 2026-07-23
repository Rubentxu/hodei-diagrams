import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkbenchController, isWorkbenchState, assertControllerBoundary, type WorkbenchState } from '../src/workbench-controller.js';

describe('WorkbenchController', () => {
  let controller: WorkbenchController;
  beforeEach(() => { controller = new WorkbenchController(); });

  // task 1.1.1: 5-field boundary
  describe('WorkbenchState boundary', () => {
    it('has all 5 required fields', () => {
      const s = controller.getState();
      expect(s).toHaveProperty('dockMode');
      expect(s).toHaveProperty('panelVisibility');
      expect(s).toHaveProperty('breakpoint');
      expect(s).toHaveProperty('hudDensity');
      expect(s).toHaveProperty('overlayActive');
    });
    it('isWorkbenchState returns true for valid state', () => {
      expect(isWorkbenchState({ dockMode: 'shapes', panelVisibility: { sidebar: true, inspector: false }, breakpoint: 'desktop', hudDensity: 'compact', overlayActive: null })).toBe(true);
    });
    it('isWorkbenchState returns false for extra fields', () => {
      expect(isWorkbenchState({ dockMode: 'shapes', panelVisibility: { sidebar: true, inspector: false }, breakpoint: 'desktop', hudDensity: 'compact', overlayActive: null, extra: true } as unknown as WorkbenchState)).toBe(false);
    });
    it('assertControllerBoundary throws on extra fields', () => {
      expect(() => assertControllerBoundary({ dockMode: 'shapes', panelVisibility: { sidebar: true, inspector: false }, breakpoint: 'desktop', hudDensity: 'compact', overlayActive: null, extra: true } as unknown as WorkbenchState)).toThrow('Boundary violation');
    });
  });

  // task 1.1.2: subscribe/unsubscribe
  it('subscribe returns unsubscribe and stops notifications', () => {
    const fn = vi.fn();
    const unsub = controller.subscribe(fn);
    expect(typeof unsub).toBe('function');
    unsub();
    controller.setState({ dockMode: 'layers' });
    expect(fn).not.toHaveBeenCalled();
  });

  // task 1.1.3: setState merges and notifies
  it('setState notifies with merged state', () => {
    controller.subscribe(vi.fn());
    controller.setState({ dockMode: 'layers' });
    expect(controller.getState().dockMode).toBe('layers');
  });
  it('setState preserves unrelated fields', () => {
    controller.subscribe(vi.fn());
    controller.setState({ dockMode: 'layers' });
    expect(controller.getState().panelVisibility).toEqual({ sidebar: true, inspector: false });
  });

  // task 1.1.6: updateHudDensity (R2b Approach 1: compact/full)
  describe('updateHudDensity', () => {
    it('compact when idle', () => {
      controller.updateHudDensity({ hasSelection: false, isDragging: false, snapEnabled: false, gridVisible: false, isEditing: false });
      expect(controller.getState().hudDensity).toBe('compact');
    });
    it('full when dragging', () => {
      controller.updateHudDensity({ hasSelection: false, isDragging: true, snapEnabled: false, gridVisible: false, isEditing: false });
      expect(controller.getState().hudDensity).toBe('full');
    });
    it('full when snapEnabled', () => {
      controller.updateHudDensity({ hasSelection: false, isDragging: false, snapEnabled: true, gridVisible: false, isEditing: false });
      expect(controller.getState().hudDensity).toBe('full');
    });
    it('full when gridVisible', () => {
      controller.updateHudDensity({ hasSelection: false, isDragging: false, snapEnabled: false, gridVisible: true, isEditing: false });
      expect(controller.getState().hudDensity).toBe('full');
    });
    it('full when isEditing', () => {
      controller.updateHudDensity({ hasSelection: false, isDragging: false, snapEnabled: false, gridVisible: false, isEditing: true });
      expect(controller.getState().hudDensity).toBe('full');
    });
  });

  // task 1.1.7: updateContextualToolbar
  describe('updateContextualToolbar', () => {
    it('inactive when no selection', () => {
      const root = document.createElement('div'); root.id = 'app';
      document.body.appendChild(root);
      controller.updateContextualToolbar({ hasSelection: false, isDragging: false, snapEnabled: false, gridVisible: false, isEditing: false });
      expect(root.getAttribute('data-context-toolbar')).toBe('inactive');
      document.body.removeChild(root);
    });
    it('active when hasSelection', () => {
      const root = document.createElement('div'); root.id = 'app';
      document.body.appendChild(root);
      controller.updateContextualToolbar({ hasSelection: true, isDragging: false, snapEnabled: false, gridVisible: false, isEditing: false });
      expect(root.getAttribute('data-context-toolbar')).toBe('active');
      document.body.removeChild(root);
    });
  });

  // task 1.1.5: detectBreakpoint
  it('detectBreakpoint is callable', () => { expect(typeof controller.detectBreakpoint).toBe('function'); });

  // Overlay mutual exclusion (spec §Scenario: Overlay conflict)
  it('opening sidebar closes inspector', () => {
    controller.setState({ overlayActive: 'inspector' });
    controller.setState({ overlayActive: 'sidebar' });
    expect(controller.getState().overlayActive).toBe('sidebar');
  });
  it('opening inspector closes sidebar', () => {
    controller.setState({ overlayActive: 'sidebar' });
    controller.setState({ overlayActive: 'inspector' });
    expect(controller.getState().overlayActive).toBe('inspector');
  });
});
