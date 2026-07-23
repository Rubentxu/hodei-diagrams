/**
 * ui-layout-context.test.ts — R2b DensityContext augmentation proof
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkbenchController } from '../src/workbench-controller.js';

describe('DensityContext (4-field) augmentation', () => {
  let controller: WorkbenchController;
  beforeEach(() => { controller = new WorkbenchController(); });

  // 4-field DensityContext: updateHudDensity uses Omit<LayoutContext,'hasSelection'>
  describe('updateHudDensity', () => {
    it('compact when all 4 false', () => {
      controller.updateHudDensity({ isDragging: false, snapEnabled: false, gridVisible: false, isEditing: false });
      expect(controller.getState().hudDensity).toBe('compact');
    });
    it('full when any field true (isDragging)', () => {
      controller.updateHudDensity({ isDragging: true, snapEnabled: false, gridVisible: false, isEditing: false });
      expect(controller.getState().hudDensity).toBe('full');
    });
    it('full when snapEnabled=true', () => {
      controller.updateHudDensity({ isDragging: false, snapEnabled: true, gridVisible: false, isEditing: false });
      expect(controller.getState().hudDensity).toBe('full');
    });
    it('full when gridVisible=true', () => {
      controller.updateHudDensity({ isDragging: false, snapEnabled: false, gridVisible: true, isEditing: false });
      expect(controller.getState().hudDensity).toBe('full');
    });
    it('full when isEditing=true', () => {
      controller.updateHudDensity({ isDragging: false, snapEnabled: false, gridVisible: false, isEditing: true });
      expect(controller.getState().hudDensity).toBe('full');
    });
    it('returns to compact after fields reset', () => {
      controller.updateHudDensity({ isDragging: true, snapEnabled: false, gridVisible: false, isEditing: false });
      controller.updateHudDensity({ isDragging: false, snapEnabled: false, gridVisible: false, isEditing: false });
      expect(controller.getState().hudDensity).toBe('compact');
    });
    it('no notification on same-density call', () => {
      const fn = vi.fn();
      controller.subscribe(fn);
      controller.updateHudDensity({ isDragging: false, snapEnabled: false, gridVisible: false, isEditing: false });
      controller.updateHudDensity({ isDragging: false, snapEnabled: false, gridVisible: false, isEditing: false });
      expect(fn).toHaveBeenCalledTimes(0);
    });
  });

  // 5-field LayoutContext: updateContextualToolbar uses hasSelection
  describe('updateContextualToolbar uses hasSelection', () => {
    it('inactive when hasSelection=false', () => {
      const root = document.createElement('div'); root.id = 'app';
      document.body.appendChild(root);
      controller.updateContextualToolbar({ hasSelection: false, isDragging: false, snapEnabled: false, gridVisible: false, isEditing: false });
      expect(root.getAttribute('data-context-toolbar')).toBe('inactive');
      document.body.removeChild(root);
    });
    it('active when hasSelection=true', () => {
      const root = document.createElement('div'); root.id = 'app';
      document.body.appendChild(root);
      controller.updateContextualToolbar({ hasSelection: true, isDragging: false, snapEnabled: false, gridVisible: false, isEditing: false });
      expect(root.getAttribute('data-context-toolbar')).toBe('active');
      document.body.removeChild(root);
    });
  });

  // grep boundary: gridVisible DOM source vs editor seam
  describe('grep boundary', () => {
    it('gridVisible absent from editor.ts', async () => {
      const { readFileSync } = await import('fs');
      const { resolve } = await import('path');
      expect(readFileSync(resolve('./src/editor.ts'), 'utf8')).not.toMatch(/gridVisible/);
    });
    it('gridVisible read from DOM in main.ts', async () => {
      const { readFileSync } = await import('fs');
      const { resolve } = await import('path');
      const src = readFileSync(resolve('./src/main.ts'), 'utf8');
      expect(src).toMatch(/gridVisible/);
      expect(src).toMatch(/classList\.contains\(['"]show-grid['"]\)/);
    });
    it('beforeunload lifecycle in main.ts', async () => {
      const { readFileSync } = await import('fs');
      const { resolve } = await import('path');
      const src = readFileSync(resolve('./src/main.ts'), 'utf8');
      expect(src).toMatch(/unsubInteractionState\s*=\s*activeEditor\.onInteractionStateChange/);
      expect(src).toMatch(/window\.addEventListener\(['"]beforeunload['"],/);
      expect(src).toMatch(/unsubInteractionState\?.\(\)/);
    });
  });
});
