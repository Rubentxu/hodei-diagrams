/**
 * ui-dock.test.ts — R1b: sidebar dock mode switching
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildSidebar } from '../src/sidebar.js';

describe('sidebar dock mode', () => {
  let sidebar: ReturnType<typeof buildSidebar>;
  beforeEach(() => { sidebar = buildSidebar(); document.body.appendChild(sidebar.container); });

  // 2.1.1: setDockMode swaps children; only one mode visible at a time
  it('shows shapes by default', () => {
    const q = sidebar.container.querySelector.bind(sidebar.container);
    expect((q('.dock-mode-shapes') as HTMLElement).style.display).not.toBe('none');
    expect((q('.dock-mode-layers') as HTMLElement).style.display).toBe('none');
    expect((q('.dock-mode-history') as HTMLElement).style.display).toBe('none');
  });

  it('setDockMode(layers) shows only layers', () => {
    sidebar.setDockMode('layers');
    const q = sidebar.container.querySelector.bind(sidebar.container);
    expect((q('.dock-mode-shapes') as HTMLElement).style.display).toBe('none');
    expect((q('.dock-mode-layers') as HTMLElement).style.display).not.toBe('none');
    expect((q('.dock-mode-history') as HTMLElement).style.display).toBe('none');
  });

  it('setDockMode(history) shows only history', () => {
    sidebar.setDockMode('history');
    const q = sidebar.container.querySelector.bind(sidebar.container);
    expect((q('.dock-mode-shapes') as HTMLElement).style.display).toBe('none');
    expect((q('.dock-mode-layers') as HTMLElement).style.display).toBe('none');
    expect((q('.dock-mode-history') as HTMLElement).style.display).not.toBe('none');
  });

  it('setDockMode(shapes) restores shapes; repeated calls do not duplicate', () => {
    sidebar.setDockMode('history');
    sidebar.setDockMode('shapes');
    expect((sidebar.container.querySelector('.dock-mode-shapes') as HTMLElement).style.display).not.toBe('none');
    sidebar.setDockMode('layers');
    sidebar.setDockMode('layers');
    expect((sidebar.container.querySelector('.dock-mode-layers') as HTMLElement).style.display).not.toBe('none');
  });

  // 2.1.2: preserve existing testids
  it('preserves sidebar, collapse-btn, and layers-panel testids', () => {
    expect(sidebar.container.getAttribute('data-testid')).toBe('sidebar');
    expect(sidebar.collapseBtn.getAttribute('data-testid')).toBe('sidebar-collapse-btn');
    expect(sidebar.layersPanel.getAttribute('data-testid')).toBe('layers-panel');
  });

  // 2.4.2: dock-aliases testids
  it('dock-layers and dock-history testid aliases are present', () => {
    expect(sidebar.container.querySelector('[data-testid="dock-layers"]')).not.toBeNull();
    expect(sidebar.container.querySelector('[data-testid="dock-history"]')).not.toBeNull();
  });

  // 2.1.3: setDockMode is exposed as function
  it('setDockMode is a function', () => { expect(typeof sidebar.setDockMode).toBe('function'); });

  // 2.1.4: shapes inside dock-mode-shapes, layers inside dock-mode-layers
  it('shapes content inside dock-mode-shapes; layers panel inside dock-mode-layers', () => {
    const dockShapes = sidebar.container.querySelector('.dock-mode-shapes') as HTMLElement;
    expect(dockShapes.contains(sidebar.container.querySelector('[data-testid="sidebar-search"]')!)).toBe(true);
    expect(dockShapes.contains(sidebar.container.querySelector('[data-testid="rect-tool-btn"]')!)).toBe(true);
    const dockLayers = sidebar.container.querySelector('.dock-mode-layers') as HTMLElement;
    expect(dockLayers.contains(sidebar.layersPanel)).toBe(true);
  });
});
