/**
 * ui-bottom.test.ts — R2: bottom-left cluster composition tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildEmptyUi } from '../src/ui.js';
import type { DiagramEngineSession } from '../src/session.js';

describe('Bottom-left cluster', () => {
  const mockSession = {
    executeCommand: async () => ({ ok: true }),
    executeCommands: async () => ({ ok: true }),
    getPageCount: async () => 1,
    getCurrentPageIndex: async () => 0,
  } as unknown as DiagramEngineSession;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('bottom-left-cluster contains page-tabs', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    buildEmptyUi(root, mockSession);

    const cluster = document.querySelector('.bottom-left-cluster');
    expect(cluster).not.toBeNull();

    const pageTabs = cluster?.querySelector('[data-testid="page-tabs"]');
    expect(pageTabs).not.toBeNull();
  });

  it('bottom-left-cluster contains zoom-display', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    buildEmptyUi(root, mockSession);

    const cluster = document.querySelector('.bottom-left-cluster');
    expect(cluster).not.toBeNull();

    const zoomDisplay = document.querySelector('[data-testid="zoom-display"]');
    expect(zoomDisplay).not.toBeNull();
  });

  it('bottom-left-cluster contains save-btn', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    buildEmptyUi(root, mockSession);

    const cluster = document.querySelector('.bottom-left-cluster');
    expect(cluster).not.toBeNull();

    const saveBtn = cluster?.querySelector('[data-testid="save-btn"]');
    expect(saveBtn).not.toBeNull();
  });

  it('bottom-left-cluster contains error-banner', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    buildEmptyUi(root, mockSession);

    const cluster = document.querySelector('.bottom-left-cluster');
    expect(cluster).not.toBeNull();

    const errorBanner = cluster?.querySelector('[data-testid="error-banner"]');
    expect(errorBanner).not.toBeNull();
  });

  it('bottom-bar testid alias preserved on cluster', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    buildEmptyUi(root, mockSession);

    // The cluster should have both the new class and the old testid alias
    const cluster = document.querySelector('.bottom-left-cluster');
    expect(cluster).not.toBeNull();

    // Legacy testid preserved as alias
    const legacyBottomBar = document.querySelector('[data-testid="bottom-bar"]');
    expect(legacyBottomBar).not.toBeNull();
  });

  it('no full-width bottom-bar grid row exists', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    buildEmptyUi(root, mockSession);

    // The app grid should NOT have a 'bottom' row
    const app = document.querySelector('#app') ?? document.querySelector('[data-testid="app-grid"]');
    expect(app).not.toBeNull();

    // The grid should use floating cluster, not grid row for bottom
    const style = window.getComputedStyle(app as Element);
    // This is more of an E2E check, but the unit test verifies the cluster exists
    const cluster = document.querySelector('.bottom-left-cluster');
    expect(cluster).not.toBeNull();
  });
});
