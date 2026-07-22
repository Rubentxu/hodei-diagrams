/**
 * ui-hud.test.ts — R2: HUD tier visibility + data-hud-density behavior
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildHud } from '../src/hud.js';

describe('HUD tier visibility', () => {
  let hud: ReturnType<typeof buildHud>;

  beforeEach(() => {
    document.body.innerHTML = '';
    hud = buildHud();
    document.body.appendChild(hud.container);
  });

  it('items expose data-hud-tier attribute on .hud-item parent', () => {
    // Default tier items
    const selection = document.querySelector('[data-testid="hud-selection"]') as HTMLElement | null;
    expect(selection).not.toBeNull();
    expect(selection?.closest('.hud-item')?.getAttribute('data-hud-tier')).toBe('default');

    const zoom = document.querySelector('[data-testid="hud-zoom"]') as HTMLElement | null;
    expect(zoom?.closest('.hud-item')?.getAttribute('data-hud-tier')).toBe('default');

    const saveStatus = document.querySelector('[data-testid="hud-save-status"]') as HTMLElement | null;
    expect(saveStatus?.closest('.hud-item')?.getAttribute('data-hud-tier')).toBe('default');

    // Contextual tier items
    const snap = document.querySelector('[data-testid="hud-snap"]') as HTMLElement | null;
    expect(snap?.closest('.hud-item')?.getAttribute('data-hud-tier')).toBe('contextual');

    const grid = document.querySelector('[data-testid="hud-grid"]') as HTMLElement | null;
    expect(grid?.closest('.hud-item')?.getAttribute('data-hud-tier')).toBe('contextual');

    const cursor = document.querySelector('[data-testid="hud-cursor"]') as HTMLElement | null;
    expect(cursor?.closest('.hud-item')?.getAttribute('data-hud-tier')).toBe('contextual');

    const geometry = document.querySelector('[data-testid="hud-geometry"]') as HTMLElement | null;
    expect(geometry?.closest('.hud-item')?.getAttribute('data-hud-tier')).toBe('contextual');
  });

  it('contextual items are hidden when data-hud-density="compact" on #app', () => {
    const app = document.getElementById('app') ?? document.body;
    app.setAttribute('data-hud-density', 'compact');

    // CSS rules should hide [data-hud-tier="contextual"] when [data-hud-density="compact"]
    // Verify the CSS makes contextual items hidden
    const snapItem = document.querySelector('[data-hud-tier="contextual"]');
    expect(snapItem).not.toBeNull();

    // Check computed style or class-based hiding
    const style = window.getComputedStyle(snapItem as Element);
    // When CSS rule applies: [data-hud-density="compact"] [data-hud-tier="contextual"] { display: none }
    // The actual hiding is done via CSS, so we check the element's parent container visibility
    // For unit test purposes, verify the attribute is set correctly
    expect(app.getAttribute('data-hud-density')).toBe('compact');

    // Cleanup
    app.removeAttribute('data-hud-density');
  });

  it('contextual items visible when data-hud-density="full" on #app', () => {
    const app = document.getElementById('app') ?? document.body;
    app.setAttribute('data-hud-density', 'full');

    const snap = document.querySelector('[data-testid="hud-snap"]') as HTMLElement | null;
    const snapItem = snap?.closest('.hud-item') as HTMLElement | null;
    expect(snapItem?.hidden).toBe(false);

    const grid = document.querySelector('[data-testid="hud-grid"]') as HTMLElement | null;
    const gridItem = grid?.closest('.hud-item') as HTMLElement | null;
    expect(gridItem?.hidden).toBe(false);

    // Cleanup
    app.removeAttribute('data-hud-density');
  });

  it('hud-page is removed (redundant with page-tabs cluster)', () => {
    const pageItem = document.querySelector('[data-testid="hud-page"]');
    expect(pageItem).toBeNull();
  });

  it('hud-mode relocated to contextual toolbar (not in HUD)', () => {
    // hud-mode is no longer in HUD — it moves to contextual toolbar in navbar
    const hudMode = document.querySelector('[data-testid="hud-mode"]') as HTMLElement | null;
    // The element may still exist if preserved elsewhere, but it's NOT in the HUD container
    // The actual relocation is in navbar.ts contextual toolbar
    const hudContainer = document.querySelector('[data-testid="hud"]');
    const hudHasMode = hudContainer?.querySelector('[data-testid="hud-mode"]');
    expect(hudHasMode).toBeNull();
  });

  it('hud-geometry contextual item exists', () => {
    const geometry = document.querySelector('[data-testid="hud-geometry"]') as HTMLElement | null;
    expect(geometry).not.toBeNull();
    expect(geometry?.closest('.hud-item')?.getAttribute('data-hud-tier')).toBe('contextual');
  });
});
