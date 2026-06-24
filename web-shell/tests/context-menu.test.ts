import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showContextMenu, type ContextMenuItem } from '../src/context-menu.js';

describe('context-menu', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.querySelectorAll('.context-menu').forEach(el => el.remove());
  });

  describe('renders items correctly', () => {
    it('renders all items as buttons', () => {
      const items: ContextMenuItem[] = [
        { label: 'Edit', action: () => {} },
        { label: 'Copy', action: () => {} },
      ];
      showContextMenu(100, 200, items);
      expect(document.querySelectorAll('.context-menu-item')).toHaveLength(2);
    });

    it('renders separators', () => {
      const items: ContextMenuItem[] = [
        { label: 'A', action: () => {} },
        { separator: true, label: '', action: () => {} },
        { label: 'B', action: () => {} },
      ];
      showContextMenu(100, 200, items);
      expect(document.querySelectorAll('.context-menu-separator')).toHaveLength(1);
    });

    it('disabled items render with disabled attribute', () => {
      const items: ContextMenuItem[] = [{ label: 'Disabled', action: () => {}, disabled: true }];
      showContextMenu(100, 200, items);
      const btn = document.querySelector('.context-menu-item') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  describe('position', () => {
    it('positions menu at given coordinates', () => {
      showContextMenu(150, 250, [{ label: 'Test', action: () => {} }]);
      const menu = document.querySelector('.context-menu') as HTMLElement;
      expect(menu.style.left).toBe('150px');
      expect(menu.style.top).toBe('250px');
    });
  });

  describe('actions', () => {
    it('clicking item calls action and removes menu', () => {
      const action = vi.fn();
      showContextMenu(100, 200, [{ label: 'Click me', action }]);
      const btn = document.querySelector('.context-menu-item') as HTMLButtonElement;
      btn.click();
      expect(action).toHaveBeenCalledOnce();
      expect(document.querySelector('.context-menu')).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('removes existing menu before creating new one', () => {
      showContextMenu(0, 0, [{ label: 'First', action: () => {} }]);
      showContextMenu(100, 100, [{ label: 'Second', action: () => {} }]);
      expect(document.querySelectorAll('.context-menu')).toHaveLength(1);
      expect(document.querySelector('.context-menu-item')?.textContent).toBe('Second');
    });

    it('closes menu on click outside (after delay)', async () => {
      vi.useFakeTimers();
      showContextMenu(100, 200, [{ label: 'Test', action: () => {} }]);
      expect(document.querySelector('.context-menu')).not.toBeNull();

      vi.advanceTimersByTime(10);
      document.body.click();

      expect(document.querySelector('.context-menu')).toBeNull();
      vi.useRealTimers();
    });
  });

  describe('jsimpleSvgNamespaces', () => {
    it('creates div element with correct class', () => {
      showContextMenu(100, 200, [{ label: 'Test', action: () => {} }]);
      const menu = document.querySelector('.context-menu');
      expect(menu?.classList.contains('context-menu')).toBe(true);
    });
  });
});
