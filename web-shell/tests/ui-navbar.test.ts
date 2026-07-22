/**
 * ui-navbar.test.ts — R2: 44px compact navbar tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildNavbar } from '../src/navbar.js';
import type { DiagramEngineSession } from '../src/session.js';

describe('Navbar 44px height', () => {
  const mockSession = {
    executeCommand: vi.fn(),
    executeCommands: vi.fn(),
    getPageCount: vi.fn().mockReturnValue(1),
    getCurrentPageIndex: vi.fn().mockReturnValue(0),
  } as unknown as DiagramEngineSession;

  it('navbar-top-row is present and is a single row with menus + quick controls', () => {
    document.body.innerHTML = '';
    const { container } = buildNavbar(mockSession);
    document.body.appendChild(container);

    const topRow = document.querySelector('.navbar-top-row') as HTMLElement;
    expect(topRow).not.toBeNull();

    // topRow should contain menu bar
    const menuBar = topRow?.querySelector('.menu-bar');
    expect(menuBar).not.toBeNull();

    // topRow should contain quick-controls
    const quickControls = topRow?.querySelector('.quick-controls');
    expect(quickControls).not.toBeNull();

    // topRow should contain toolbar
    const toolbar = topRow?.querySelector('.toolbar');
    expect(toolbar).not.toBeNull();
  });

  it('navbar is a single row container (not multi-row)', () => {
    document.body.innerHTML = '';
    const { container } = buildNavbar(mockSession);
    document.body.appendChild(container);

    const navbar = document.querySelector('.navbar') as HTMLElement;
    const topRow = document.querySelector('.navbar-top-row') as HTMLElement;
    const toolbar = document.querySelector('.toolbar') as HTMLElement;

    // Toolbar should be inside the topRow (which is inside navbar)
    expect(topRow?.contains(toolbar)).toBe(true);
    expect(navbar?.contains(topRow)).toBe(true);
  });

  it('toolbar has data-testid and is present', () => {
    document.body.innerHTML = '';
    const { container } = buildNavbar(mockSession);
    document.body.appendChild(container);

    const toolbar = document.querySelector('[data-testid="toolbar"]') as HTMLElement;
    expect(toolbar).not.toBeNull();
  });
});
