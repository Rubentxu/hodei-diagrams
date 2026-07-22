/**
 * ui-hud.test.ts — R2a: HUD tier visibility + data-hud-density behavior
 */
import { describe, it, expect, beforeEach } from 'vitest';
import '../src/styles.css';
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

  it('hud-page is removed (redundant with page-tabs cluster)', () => {
    const pageItem = document.querySelector('[data-testid="hud-page"]');
    expect(pageItem).toBeNull();
  });

  it('hud-mode relocated to contextual toolbar (not in HUD)', () => {
    const hudContainer = document.querySelector('[data-testid="hud"]');
    const hudHasMode = hudContainer?.querySelector('[data-testid="hud-mode"]');
    expect(hudHasMode).toBeNull();
  });

  it('hud-geometry contextual item exists', () => {
    const geometry = document.querySelector('[data-testid="hud-geometry"]') as HTMLElement | null;
    expect(geometry).not.toBeNull();
    expect(geometry?.closest('.hud-item')?.getAttribute('data-hud-tier')).toBe('contextual');
  });

  it('setGeometry updates geometry label and shows element', () => {
    hud.setGeometry('Rect: 100x50');
    const geometry = document.querySelector('[data-testid="hud-geometry"]') as HTMLElement | null;
    expect(geometry?.textContent).toBe('Rect: 100x50');
  });

  it('setGeometry hides element when label is empty', () => {
    hud.setGeometry('');
    const geometry = document.querySelector('[data-testid="hud-geometry"]') as HTMLElement | null;
    const item = geometry?.closest('.hud-item') as HTMLElement | null;
    expect(item?.style.display).toBe('none');
  });
});
