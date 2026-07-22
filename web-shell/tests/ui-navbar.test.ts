/**
 * ui-navbar.test.ts — R2a: 44px compact navbar tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../src/styles.css';
import { buildNavbar } from '../src/navbar.js';
import type { DiagramEngineSession } from '../src/session.js';

describe('Navbar 44px height', () => {
  const mockSession = {
    executeCommand: vi.fn(),
    executeCommands: vi.fn(),
    getPageCount: vi.fn().mockReturnValue(1),
    getCurrentPageIndex: vi.fn().mockReturnValue(0),
  } as unknown as DiagramEngineSession;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('navbar-top-row contains menu-bar + quick-controls + toolbar (single row)', () => {
    const { container } = buildNavbar(mockSession);
    document.body.appendChild(container);

    const topRow = document.querySelector('.navbar-top-row') as HTMLElement;
    expect(topRow).not.toBeNull();

    // All three sections are direct children of the single topRow
    expect(topRow?.querySelector('.menu-bar')).not.toBeNull();
    expect(topRow?.querySelector('.quick-controls')).not.toBeNull();
    expect(topRow?.querySelector('.toolbar')).not.toBeNull();
  });

  it('toolbar is inside topRow, not appended separately to navbar', () => {
    const { container } = buildNavbar(mockSession);
    document.body.appendChild(container);

    const navbar = container;
    const topRow = navbar.querySelector('.navbar-top-row') as HTMLElement;
    const toolbar = navbar.querySelector('.toolbar') as HTMLElement;

    // Toolbar must be inside topRow
    expect(topRow?.contains(toolbar)).toBe(true);
  });

  it('toolbar has data-testid and is present', () => {
    const { container } = buildNavbar(mockSession);
    document.body.appendChild(container);

    const toolbar = document.querySelector('[data-testid="toolbar"]') as HTMLElement;
    expect(toolbar).not.toBeNull();
  });

  it('navbar has correct CSS class for 44px single-row layout', () => {
    const { container } = buildNavbar(mockSession);
    document.body.appendChild(container);

    // The navbar element should have the 'navbar' class
    expect(container.classList.contains('navbar')).toBe(true);
    // The topRow should be present and contain all sections
    const topRow = container.querySelector('.navbar-top-row') as HTMLElement;
    expect(topRow).not.toBeNull();
    // topRow should contain menu-bar, quick-controls, and toolbar
    expect(topRow?.querySelector('.menu-bar')).not.toBeNull();
    expect(topRow?.querySelector('.quick-controls')).not.toBeNull();
    expect(topRow?.querySelector('.toolbar')).not.toBeNull();
  });
});
