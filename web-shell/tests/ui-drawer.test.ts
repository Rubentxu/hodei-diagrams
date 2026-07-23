/**
 * ui-drawer.test.ts — Essential unit tests for DrawerController (R3 responsive drawers)
 * Focus: escape dismiss, return focus, mutual exclusion
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
    DrawerController.closeAll();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
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

  // ─── Return focus ──────────────────────────────────────────────────────────

  describe('Return focus on close', () => {
    it('close() attempts to return focus to trigger element', () => {
      const ctrl = createController('sidebar', fixture);
      ctrl.open();
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
      const inspOverlay = document.createElement('div');
      inspOverlay.className = 'drawer-overlay';
      inspOverlay.setAttribute('data-testid', 'drawer-overlay-inspector');
      const inspDrawer = document.createElement('div');
      inspDrawer.className = 'drawer-inspector';
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
