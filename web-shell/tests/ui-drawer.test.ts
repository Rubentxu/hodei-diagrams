/**
 * ui-drawer.test.ts — 4 critical scenarios only
 */
import { describe, it, expect, afterEach } from 'vitest';
import { DrawerController, type DrawerType } from '../src/responsive-drawer.js';

function make(drawer: DrawerType) {
  const app = document.createElement('div');
  app.id = 'app';
  const overlay = document.createElement('div');
  const drawerEl = document.createElement('div');
  const closeBtn = document.createElement('button');
  const trigger = document.createElement('button');
  drawerEl.appendChild(closeBtn);
  app.appendChild(overlay);
  app.appendChild(drawerEl);
  app.appendChild(trigger);
  document.body.appendChild(app);
  return new DrawerController({ drawer, drawerEl, overlayEl: overlay, closeBtn, triggerEl: trigger });
}

describe('DrawerController', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('open/close toggles isOpen', () => {
    const c = make('sidebar');
    expect(c.isOpen()).toBe(false);
    c.open(); expect(c.isOpen()).toBe(true);
    c.close(); expect(c.isOpen()).toBe(false);
  });
  it('close() returns focus to triggerEl', () => {
    const c = make('sidebar');
    const t = (c as any).opts.triggerEl;
    t.focus(); c.open(); c.close();
    expect(document.activeElement).toBe(t);
  });
  it('Escape key closes the drawer', () => {
    const c = make('sidebar');
    c.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(c.isOpen()).toBe(false);
  });
  it('opening one drawer closes the other', () => {
    const s = make('sidebar');
    const i = make('inspector');
    s.open(); expect(s.isOpen()).toBe(true); expect(i.isOpen()).toBe(false);
    i.open(); expect(s.isOpen()).toBe(false); expect(i.isOpen()).toBe(true);
  });
});
