/**
 * dock-layers.ts — Layers panel builder extracted from main.ts:1663-1743 (R1a task 1.2.3)
 */
import type { DiagramEngineSession } from './session.js';

export interface LayerItem { idx: number; version: number; name: string | null; visible: boolean; locked: boolean; }
export interface DockLayersCallbacks {
  onToggleVisibility: (layerIdx: number, layerVersion: number, currentVisible: boolean) => void;
  onToggleLock: (layerIdx: number, layerVersion: number, currentLocked: boolean) => void;
  onRename: (layerIdx: number, layerVersion: number, currentName: string) => void;
  onRemove: (layerIdx: number, layerVersion: number) => void;
  onMoveToLayer: (layerIdx: number, layerVersion: number) => void;
}
export interface DockLayers { setItems: (items: LayerItem[]) => void; refresh: () => void; }

export function buildDockLayers(container: HTMLElement, session: DiagramEngineSession, cb: DockLayersCallbacks): DockLayers {
  const list = document.createElement('div');
  list.className = 'layers-list';
  container.appendChild(list);

  function render(items: LayerItem[]): void {
    list.innerHTML = '';
    for (const item of items) list.appendChild(renderItem(item));
  }

  function renderItem(item: LayerItem): HTMLElement {
    const name = item.name ?? '(default)';
    const row = document.createElement('div');
    row.className = 'layer-item';
    row.setAttribute('data-testid', `layer-item-${name}`);

    const label = document.createElement('span');
    label.className = 'layer-name';
    label.textContent = name;
    row.appendChild(label);

    const visBtn = btn('layer-visibility', name, item.visible ? '👁' : '🙈', item.visible ? 'Hide layer' : 'Show layer',
      () => cb.onToggleVisibility(item.idx, item.version, item.visible));
    visBtn.setAttribute('data-state', item.visible ? 'visible' : 'hidden');
    row.appendChild(visBtn);

    const lockBtn = btn('layer-lock', name, item.locked ? '🔒' : '🔓', item.locked ? 'Unlock layer' : 'Lock layer',
      () => cb.onToggleLock(item.idx, item.version, item.locked));
    lockBtn.setAttribute('data-state', item.locked ? 'locked' : 'unlocked');
    row.appendChild(lockBtn);

    row.appendChild(btn('layer-rename', name, '✏️', 'Rename layer',
      () => cb.onRename(item.idx, item.version, name)));

    if (item.name !== null) {
      row.appendChild(btn('layer-remove', name, '🗑', 'Remove layer',
        () => cb.onRemove(item.idx, item.version)));
    }

    row.style.cursor = 'pointer';
    row.addEventListener('click', (e) => { if ((e.target as HTMLElement).tagName === 'BUTTON') return; cb.onMoveToLayer(item.idx, item.version); });
    return row;
  }

  function btn(testid: string, name: string, text: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'layer-toggle';
    b.setAttribute('data-testid', `${testid}-${name}`);
    b.textContent = text;
    b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }

  return {
    setItems: render,
    refresh: () => { const r = session.getLayers(0); if (r.ok) render(r.value.layers); },
  };
}
