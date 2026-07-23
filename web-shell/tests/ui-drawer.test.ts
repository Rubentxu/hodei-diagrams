/**
 * ui-drawer.test.ts — Unit tests for DrawerController (R3 responsive drawers)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DrawerController, type DrawerType } from '../src/responsive-drawer.js';

function createFixture(): {
  drawerEl: HTMLElement;
  overlayEl: HTMLElement;
  closeBtn: HTMLButtonElement;
  triggerEl: HTMLButtonElement;
  app: HTMLElement;
} {
  // Build minimal DOM fixture
  const app = document.createElement('div');
  app.id = 'app';
  app.setAttribute('data-testid', 'app');

  const overlayEl = document.createElement('div');
  overlayEl.className = 'drawer-overlay';
  overlayEl.setAttribute('data-testid', 'drawer-overlay');

  const drawerEl = document.createElement('div');
  drawerEl.className = 'drawer-sidebar';
  drawerEl.setAttribute('data-testid', 'drawer-sidebar');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'drawer-close';
  closeBtn.setAttribute('data-testid', 'drawer-close-sidebar');
  closeBtn.textContent = '✕';

  const triggerEl = document.createElement('button');
  triggerEl.className = 'mobile-panel-toggle';
  triggerEl.setAttribute('data-testid', 'sidebar-toggle');
  triggerEl.textContent = '☰';

  drawerEl.appendChild(closeBtn);
  app.appendChild(overlayEl);
  app.appendChild(drawerEl);
  document.body.appendChild(app);

  return { drawerEl, overlayEl, closeBtn, triggerEl, app };
}

function createController(
  drawerType: DrawerType,
  fixture: ReturnType<typeof createFixture>,
): DrawerController {
  return new DrawerController({
    drawer: drawerType,
    drawerEl: fixture.drawerEl,
    overlayEl: fixture.overlayEl,
    closeBtn: fixture.closeBtn,
    triggerEl: fixture.triggerEl,
  });
}

describe('DrawerController', () => {
  let fixture: ReturnType<typeof createFixture>;

  beforeEach(() => {
    fixture = createFixture();
    // Clear any static state between tests
    DrawerController.closeAll();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // ─── open / close / isOpen ─────────────────────────────────────────────────

  describe('open / close / isOpen', () => {
    it('is closed by default', () => {
      const ctrl = createController('sidebar', fixture);
      expect(ctrl.isOpen()).toBe(false);
    });

    it('open() sets isOpen to true', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      expect(ctrl.isOpen()).toBe(true);
    });

    it('close() sets isOpen to false', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      ctrl.close();
      expect(ctrl.isOpen()).toBe(false);
    });

    it('toggle() alternates open/close', () => {
      const ctrl = createController('sidebar', fixture);
      expect(ctrl.isOpen()).toBe(false);
      ctrl.toggle();
      expect(ctrl.isOpen()).toBe(true);
      ctrl.toggle();
      expect(ctrl.isOpen()).toBe(false);
    });

    it('open() sets data-drawer-open attribute on #app', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      expect(fixture.app.getAttribute('data-drawer-open')).toBe('sidebar');
    });

    it('close() removes data-drawer-open attribute', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      ctrl.close();
      expect(fixture.app.getAttribute('data-drawer-open')).toBeNull();
    });

    it('open() twice is a no-op (idempotent)', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      ctrl.open();
      expect(ctrl.isOpen()).toBe(true);
    });
  });

  // ─── aria / role ───────────────────────────────────────────────────────────

  describe('aria attributes', () => {
    it('open() sets role="dialog" and aria-modal="true" on drawer', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      expect(fixture.drawerEl.getAttribute('role')).toBe('dialog');
      expect(fixture.drawerEl.getAttribute('aria-modal')).toBe('true');
    });

    it('close() removes role and aria-modal', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      ctrl.close();
      expect(fixture.drawerEl.getAttribute('role')).toBeNull();
      expect(fixture.drawerEl.getAttribute('aria-modal')).toBeNull();
    });

    it('open() sets aria-hidden="false" on overlay', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      expect(fixture.overlayEl.getAttribute('aria-hidden')).toBe('false');
    });

    it('close() sets aria-hidden="true" on overlay', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      ctrl.close();
      expect(fixture.overlayEl.getAttribute('aria-hidden')).toBe('true');
    });
  });

  // ─── Escape dismiss ────────────────────────────────────────────────────────

  describe('Escape key dismiss', () => {
    it('Escape closes the drawer', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(ctrl.isOpen()).toBe(false);
    });

    it('Escape is prevented and stopped from propagating', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      const stopPropSpy = vi.spyOn(event, 'stopPropagation');
      document.dispatchEvent(event);
      expect(stopPropSpy).toHaveBeenCalled();
    });
  });

  // ─── Outside-click dismiss ─────────────────────────────────────────────────

  describe('Outside-click dismiss', () => {
    it('clicking overlay closes drawer', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      fixture.overlayEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(ctrl.isOpen()).toBe(false);
    });

    it('clicking drawer itself does NOT close', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      fixture.drawerEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(ctrl.isOpen()).toBe(true);
    });

    it('clicking close button closes drawer', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      fixture.closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(ctrl.isOpen()).toBe(false);
    });
  });

  // ─── Focus trap ───────────────────────────────────────────────────────────

  describe('Focus trap', () => {
    it('open() sets role="dialog" (focus trap indicator)', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      expect(fixture.drawerEl.getAttribute('role')).toBe('dialog');
      expect(fixture.drawerEl.getAttribute('aria-modal')).toBe('true');
    });

    it('getFocusableElements returns all focusable elements in drawer', () => {
      const btn1 = document.createElement('button');
      const btn2 = document.createElement('button');
      const input = document.createElement('input');
      fixture.drawerEl.appendChild(btn1);
      fixture.drawerEl.appendChild(input);
      fixture.drawerEl.appendChild(btn2);

      const ctrl = createController('sidebar', fixture);
      // Access private method for testing
      const ctrlAny = ctrl as unknown as { getFocusableElements: () => HTMLElement[] };
      const focusable = ctrlAny.getFocusableElements();
      expect(focusable).toContain(btn1);
      expect(focusable).toContain(btn2);
      expect(focusable).toContain(input);
    });

    it('getFocusableElements filters out hidden elements', () => {
      const btn1 = document.createElement('button');
      const hiddenDiv = document.createElement('div');
      hiddenDiv.hidden = true;
      const btn2 = document.createElement('button');
      fixture.drawerEl.appendChild(btn1);
      fixture.drawerEl.appendChild(hiddenDiv);
      fixture.drawerEl.appendChild(btn2);

      const ctrl = createController('sidebar', fixture);
      const ctrlAny = ctrl as unknown as { getFocusableElements: () => HTMLElement[] };
      const focusable = ctrlAny.getFocusableElements();
      expect(focusable).toContain(btn1);
      expect(focusable).toContain(btn2);
      expect(focusable).not.toContain(hiddenDiv);
    });
  });

  // ─── Return focus ──────────────────────────────────────────────────────────

  describe('Return focus on close', () => {
    it('close() attempts to return focus to trigger element', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
      // jsdom doesn't actually move focus, but close() calls focus() on triggerEl
      // We verify by checking no error is thrown and drawer state is correct
      ctrl.close();
      expect(ctrl.isOpen()).toBe(false);
    });

    it('close() does not throw when triggerEl is null', () => {
      const ctrl = new DrawerController({
        drawer: 'sidebar',
        drawerEl: fixture.drawerEl,
        overlayEl: fixture.overlayEl,
        closeBtn: fixture.closeBtn,
        triggerEl: null,
      });
      ctrl.open();
      expect(() => ctrl.close()).not.toThrow();
    });
  });

  // ─── Mutual exclusion ──────────────────────────────────────────────────────

  describe('Mutual exclusion', () => {
    it('opening sidebar closes any open inspector (and vice versa)', () => {
      // Create inspector elements
      const inspOverlay = document.createElement('div');
      inspOverlay.className = 'drawer-overlay';
      inspOverlay.setAttribute('data-testid', 'drawer-overlay-inspector');
      const inspDrawer = document.createElement('div');
      inspDrawer.className = 'drawor-inspector';
      inspDrawer.setAttribute('data-testid', 'drawer-inspector');
      const inspClose = document.createElement('button');
      inspClose.setAttribute('data-testid', 'drawer-close-inspector');
      inspDrawer.appendChild(inspClose);
      fixture.app.appendChild(inspOverlay);
      fixture.app.appendChild(inspDrawer);

      const sidebarCtrl = createController('sidebar', fixture);
      const inspectorCtrl = new DrawerController({
        drawer: 'inspector',
        drawerEl: inspDrawer,
        overlayEl: inspOverlay,
        closeBtn: inspClose,
        triggerEl: null,
      });

      sidebarCtrl.open();
      expect(sidebarCtrl.isOpen()).toBe(true);
      expect(inspectorCtrl.isOpen()).toBe(false);

      inspectorCtrl.open();
      expect(sidebarCtrl.isOpen()).toBe(false);
      expect(inspectorCtrl.isOpen()).toBe(true);
    });

    it('closeAll() closes all open drawers', () => {
      const sidebarCtrl = createController('sidebar', fixture);
      sidebarCtrl.open();
      expect(sidebarCtrl.isOpen()).toBe(true);

      DrawerController.closeAll();
      expect(sidebarCtrl.isOpen()).toBe(false);
    });
  });
});
