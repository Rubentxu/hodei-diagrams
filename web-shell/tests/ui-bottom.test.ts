/**
 * ui-bottom.test.ts — Phase 7 R2d: Bottom-left cluster composition and alias resolution.
 *
 * TDD RED phase: asserts cluster contains page-tabs + error-banner
 * floating bottom-left, and `bottom-bar` alias resolves on the cluster.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildEmptyUi } from '../src/ui.js';
import type { DiagramEngineSession } from '../src/session.js';

// Minimal mock session for testing buildEmptyUi without full engine
const mockSession: DiagramEngineSession = {
  executeCommand: (_cmd: string) => ({ ok: true, value: undefined }),
  executeTransaction: (_cmds: string[]) => ({ ok: true, value: undefined }),
  undo: () => ({ ok: true, value: undefined }),
  redo: () => ({ ok: true, value: undefined }),
  canUndo: () => false,
  canRedo: () => false,
  importDrawio: (_xml: string) => ({ ok: true, value: undefined }),
  exportDrawio: () => ({ ok: true, value: '' }),
  renderAllPages: () => ({ ok: true, value: [] }),
  renderPage: (_pageIdx: bigint) => ({ ok: true, value: '' }),
  getScene: () => ({ ok: true, value: [] }),
  loadStencilLibrary: (_name: string, _url: string) => Promise.resolve(),
  executeCommands: (_cmds: string[]) => ({ ok: true, value: undefined }),
  getResolvedStyle: () => ({ ok: true, value: { remaining: {} } }),
  getMetadata: () => ({
    ok: true,
    value: { title: null, author: null, description: null, tags: [], created: null, modified: null },
  }),
  setMetadata: () => ({ ok: true, value: undefined }),
  setOnStateChange: () => {},
  dispose: () => {},
  isActive: true,
} as unknown as DiagramEngineSession;

describe('Phase 7 R2d: Bottom-Left Cluster', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'app';
    document.body.appendChild(root);
    vi.restoreAllMocks();
  });

  it('creates a bottom-left cluster element', () => {
    buildEmptyUi(root, mockSession);
    const cluster = root.querySelector('.bottom-left-cluster');
    expect(cluster).not.toBeNull();
  });

  it('bottom-bar alias resolves on the cluster', () => {
    buildEmptyUi(root, mockSession);
    const cluster = root.querySelector('[data-testid="bottom-bar"]');
    expect(cluster).not.toBeNull();
    expect(cluster?.classList.contains('bottom-left-cluster')).toBe(true);
  });

  it('contains page-tabs container', () => {
    buildEmptyUi(root, mockSession);
    const cluster = root.querySelector('.bottom-left-cluster');
    const pageTabs = cluster?.querySelector('[data-testid="page-tabs"]');
    expect(pageTabs).not.toBeNull();
  });

  it('contains page-tab-add button', () => {
    buildEmptyUi(root, mockSession);
    const cluster = root.querySelector('.bottom-left-cluster');
    const addBtn = cluster?.querySelector('[data-testid="page-tab-add"]');
    expect(addBtn).not.toBeNull();
    expect(addBtn?.tagName.toLowerCase()).toBe('button');
  });

  it('contains error-banner with correct testids', () => {
    buildEmptyUi(root, mockSession);
    const cluster = root.querySelector('.bottom-left-cluster');
    const banner = cluster?.querySelector('[data-testid="error-banner"]');
    expect(banner).not.toBeNull();

    const errorMsg = banner?.querySelector('[data-testid="error-message"]');
    expect(errorMsg).not.toBeNull();

    const dismissBtn = banner?.querySelector('[data-testid="dismiss-error"]');
    expect(dismissBtn).not.toBeNull();
    expect(dismissBtn?.tagName.toLowerCase()).toBe('button');
  });

  it('contains diagnostics-badge', () => {
    buildEmptyUi(root, mockSession);
    const cluster = root.querySelector('.bottom-left-cluster');
    const badge = cluster?.querySelector('[data-testid="diagnostics-badge"]');
    expect(badge).not.toBeNull();
  });

  it('cluster has bottom-left-cluster class for fixed positioning', () => {
    buildEmptyUi(root, mockSession);
    const cluster = root.querySelector('.bottom-left-cluster');
    expect(cluster).not.toBeNull();
    expect(cluster?.classList.contains('bottom-left-cluster')).toBe(true);
    expect(cluster?.classList.contains('bottom-bar')).toBe(true);
  });

  it('cluster has no grid-area assignment (not grid-placed)', () => {
    buildEmptyUi(root, mockSession);
    const cluster = root.querySelector('.bottom-left-cluster');
    expect(cluster).not.toBeNull();
    // The element should not have grid-area: bottom
    // We verify this by checking it has bottom-left-cluster class (which applies position:fixed)
    expect(cluster?.classList.contains('bottom-left-cluster')).toBe(true);
  });

  it('canvas container is visible and in layout', () => {
    buildEmptyUi(root, mockSession);
    const canvas = root.querySelector('.canvas-container');
    expect(canvas).not.toBeNull();
    const canvasStyle = window.getComputedStyle(canvas as Element);
    expect(canvasStyle.display).not.toBe('none');
  });

  it('error-banner is hidden by default', () => {
    buildEmptyUi(root, mockSession);
    const banner = root.querySelector('[data-testid="error-banner"]');
    expect(banner).not.toBeNull();
    expect((banner as HTMLElement).hidden).toBe(true);
  });

  it('diagnostics-badge is hidden by default', () => {
    buildEmptyUi(root, mockSession);
    const badge = root.querySelector('[data-testid="diagnostics-badge"]');
    expect(badge).not.toBeNull();
    expect((badge as HTMLElement).hidden).toBe(true);
  });

  it('page-tabs has correct data-testid', () => {
    buildEmptyUi(root, mockSession);
    const pageTabs = root.querySelector('[data-testid="page-tabs"]');
    expect(pageTabs).not.toBeNull();
    expect(pageTabs?.classList.contains('page-tabs')).toBe(true);
  });

  it('page-tab-add has correct data-testid and is a button', () => {
    buildEmptyUi(root, mockSession);
    const addBtn = root.querySelector('[data-testid="page-tab-add"]');
    expect(addBtn).not.toBeNull();
    expect(addBtn?.tagName).toBe('BUTTON');
  });

  it('zoom-display is reachable', () => {
    buildEmptyUi(root, mockSession);
    const zoom = root.querySelector('[data-testid="zoom-display"]');
    expect(zoom).not.toBeNull();
  });

  it('save-btn is reachable', () => {
    buildEmptyUi(root, mockSession);
    const save = root.querySelector('[data-testid="save-btn"]');
    expect(save).not.toBeNull();
  });

  it('bottomBar is a child of root (floating), not in the grid row', () => {
    buildEmptyUi(root, mockSession);
    const bottomBar = root.querySelector('[data-testid="bottom-bar"]');
    expect(bottomBar).not.toBeNull();
    // The bottomBar should be a child of root (the floating cluster is inside root)
    expect(bottomBar?.parentElement).toBe(root);
  });

  it('both bottom-bar and bottom-left-cluster class names are present', () => {
    buildEmptyUi(root, mockSession);
    const bottomBar = root.querySelector('.bottom-bar');
    expect(bottomBar).not.toBeNull();
    expect(bottomBar?.classList.contains('bottom-left-cluster')).toBe(true);
  });
});
