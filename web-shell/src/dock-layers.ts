/**
 * dock-layers.ts — Layers panel builder extracted from main.ts:1663-1743
 *
 * Renders the Layers list with visibility/lock/rename/remove controls.
 * Wired to DiagramEngineSession for live layer data.
 *
 * Design: §Decision: Dock modes via sidebar content swap
 * Spec: §Requirement: Rail switches mutually-exclusive dock modes
 */

import type { DiagramEngineSession } from './session.js';

export interface LayerItem {
  idx: number;
  version: number;
  name: string | null;
  visible: boolean;
  locked: boolean;
}

export interface DockLayersCallbacks {
  onToggleVisibility: (_layerIdx: number, _layerVersion: number, _currentVisible: boolean) => void;
  onToggleLock: (_layerIdx: number, _layerVersion: number, _currentLocked: boolean) => void;
  onRename: (_layerIdx: number, _layerVersion: number, _currentName: string) => void;
  onRemove: (_layerIdx: number, _layerVersion: number) => void;
  onMoveToLayer: (_layerIdx: number, _layerVersion: number) => void;
}

export interface DockLayers {
  setItems: (_items: LayerItem[]) => void;
  refresh: () => void;
}

/**
 * Build a dock layers panel inside the given container.
 * Returns { setItems, refresh } to programmatically control the layer list.
 *
 * @param container - The container element to render layers into
 * @param session - DiagramEngineSession for layer operations
 * @param callbacks - Layer interaction handlers
 */
export function buildDockLayers(
  container: HTMLElement,
  session: DiagramEngineSession,
  callbacks: DockLayersCallbacks
): DockLayers {
  // ─── Layer list element ──────────────────────────────────────────────────
  const layersList = document.createElement('div');
  layersList.className = 'layers-list';
  container.appendChild(layersList);

  /**
   * Render a single layer item.
   */
  function renderLayerItem(item: LayerItem): HTMLElement {
    const layerName = item.name ?? '(default)';

    const layerItem = document.createElement('div');
    layerItem.className = 'layer-item';
    layerItem.setAttribute('data-testid', `layer-item-${layerName}`);

    // ─── Name ───────────────────────────────────────────────────────────────
    const nameSpan = document.createElement('span');
    nameSpan.className = 'layer-name';
    nameSpan.textContent = layerName;
    layerItem.appendChild(nameSpan);

    // ─── Visibility toggle ────────────────────────────────────────────────
    const visBtn = document.createElement('button');
    visBtn.className = 'layer-toggle';
    visBtn.setAttribute('data-testid', `layer-visibility-${layerName}`);
    visBtn.setAttribute('data-state', item.visible ? 'visible' : 'hidden');
    visBtn.textContent = item.visible ? '👁' : '🙈';
    visBtn.title = item.visible ? 'Hide layer' : 'Show layer';
    visBtn.addEventListener('click', () => {
      callbacks.onToggleVisibility(item.idx, item.version, item.visible);
    });
    layerItem.appendChild(visBtn);

    // ─── Lock toggle ──────────────────────────────────────────────────────
    const lockBtn = document.createElement('button');
    lockBtn.className = 'layer-toggle';
    lockBtn.setAttribute('data-testid', `layer-lock-${layerName}`);
    lockBtn.setAttribute('data-state', item.locked ? 'locked' : 'unlocked');
    lockBtn.textContent = item.locked ? '🔒' : '🔓';
    lockBtn.title = item.locked ? 'Unlock layer' : 'Lock layer';
    lockBtn.addEventListener('click', () => {
      callbacks.onToggleLock(item.idx, item.version, item.locked);
    });
    layerItem.appendChild(lockBtn);

    // ─── Rename button ─────────────────────────────────────────────────────
    const renameBtn = document.createElement('button');
    renameBtn.className = 'layer-toggle';
    renameBtn.setAttribute('data-testid', `layer-rename-${layerName}`);
    renameBtn.textContent = '✏️';
    renameBtn.title = 'Rename layer';
    renameBtn.addEventListener('click', () => {
      callbacks.onRename(item.idx, item.version, layerName);
    });
    layerItem.appendChild(renameBtn);

    // ─── Remove button (only for non-default layers) ───────────────────────
    if (item.name !== null) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'layer-toggle';
      removeBtn.setAttribute('data-testid', `layer-remove-${layerName}`);
      removeBtn.textContent = '🗑';
      removeBtn.title = 'Remove layer';
      removeBtn.addEventListener('click', () => {
        callbacks.onRemove(item.idx, item.version);
      });
      layerItem.appendChild(removeBtn);
    }

    // ─── Move-to-layer: clicking the row moves selected shapes here ─────────
    layerItem.style.cursor = 'pointer';
    layerItem.addEventListener('click', (e) => {
      // Don't trigger move if clicking a button inside the row
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      callbacks.onMoveToLayer(item.idx, item.version);
    });

    return layerItem;
  }

  /**
   * Render all layer items into the layers list.
   */
  function render(items: LayerItem[]): void {
    layersList.innerHTML = '';

    for (const item of items) {
      const layerItemEl = renderLayerItem(item);
      layersList.appendChild(layerItemEl);
    }
  }

  /**
   * Set layer items directly (for programmatic updates).
   */
  function setItems(items: LayerItem[]): void {
    render(items);
  }

  /**
   * Refresh layers from session (reads current session state).
   * Used when layer data may have changed (e.g., after add/remove).
   */
  function refresh(): void {
    const pageIdx = 0; // Default to first page
    const result = session.getLayers(pageIdx);

    if (!result.ok) {
      console.warn('[dock-layers] Failed to get layers:', result.error);
      return;
    }

    const { layers } = result.value;
    render(layers);
  }

  return { setItems, refresh };
}
