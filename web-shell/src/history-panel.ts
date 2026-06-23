/**
 * history-panel.ts — Zone 2 sidebar: Version History timeline panel.
 *
 * Collapsible `<details>` section showing all saved versions in reverse-chronological order.
 * Each row has: relative/absolute timestamp, label, Restore button, Delete button.
 *
 * Invariants (from spec):
 *   - I2: shell never parses the snapshot field
 *   - I11: VersionStore never inspects or transforms the snapshot string
 */

import type { DiagramEngineSession } from './session.js';
import type { VersionStore, VersionRecord } from './version-store.js';

/** Format a Date as a relative string ("2 min ago") if < 24h, else absolute. */
function formatTimestamp(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  const MIN = 60 * 1000;
  const HR = 60 * MIN;
  const DAY = 24 * HR;

  if (diff < MIN) {
    return 'Just now';
  }
  if (diff < HR) {
    const mins = Math.floor(diff / MIN);
    return `${mins} min ago`;
  }
  if (diff < DAY) {
    const hrs = Math.floor(diff / HR);
    return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  }

  // Absolute: "Jun 22, 2026 14:32"
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export class HistoryPanel {
  private readonly container: HTMLElement;
  private readonly session: DiagramEngineSession;
  private readonly versionStore: VersionStore;

  constructor(container: HTMLElement, session: DiagramEngineSession, versionStore: VersionStore) {
    this.container = container;
    this.session = session;
    this.versionStore = versionStore;
  }

  /** Re-render the panel from scratch. Called on mount and after any store mutation. */
  async render(): Promise<void> {
    // Defer to next animation frame so callers can schedule without double-render
    return new Promise((resolve) => {
      requestAnimationFrame(async () => {
        this.container.innerHTML = '';

        const section = document.createElement('details');
        section.className = 'history-section';
        section.setAttribute('data-testid', 'history-section');

        // ─── Summary / header ─────────────────────────────────────────────────
        const summary = document.createElement('summary');
        summary.className = 'history-summary';

        const summaryIcon = document.createElement('span');
        summaryIcon.className = 'history-summary-icon';
        summaryIcon.textContent = '⏱';
        summary.appendChild(summaryIcon);

        const summaryText = document.createElement('span');
        summaryText.className = 'history-summary-text';
        summaryText.textContent = 'Version History';
        summary.appendChild(summaryText);

        section.appendChild(summary);

        // ─── Save button ─────────────────────────────────────────────────────
        const saveBtn = document.createElement('button');
        saveBtn.className = 'history-save-btn';
        saveBtn.setAttribute('data-testid', 'history-save-btn');
        saveBtn.textContent = 'Save version';
        saveBtn.addEventListener('click', (e) => {
          e.preventDefault();
          // Emit a custom event that main.ts listens to for manual save
          this.container.dispatchEvent(new CustomEvent('history-save', { bubbles: true }));
        });
        section.appendChild(saveBtn);

        // ─── List ────────────────────────────────────────────────────────────
        const list = document.createElement('div');
        list.className = 'history-list';
        list.setAttribute('data-testid', 'history-list');

        try {
          const versions = await this.versionStore.list();

          if (versions.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'history-empty';
            emptyState.setAttribute('data-testid', 'history-empty');
            emptyState.textContent = 'No versions yet — save to start your timeline';
            list.appendChild(emptyState);
          } else {
            for (const version of versions) {
              const row = this.#buildRow(version);
              list.appendChild(row);
            }
          }
        } catch (err) {
          console.error('[HistoryPanel] Failed to list versions:', err);
          const errorState = document.createElement('div');
          errorState.className = 'history-empty';
          errorState.textContent = 'Failed to load versions';
          list.appendChild(errorState);
        }

        section.appendChild(list);
        this.container.appendChild(section);
        resolve();
      });
    });
  }

  #buildRow(version: VersionRecord): HTMLElement {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.setAttribute('data-testid', `history-row-${version.id}`);

    // Timestamp + label
    const info = document.createElement('div');
    info.className = 'history-row-info';

    const label = document.createElement('span');
    label.className = 'history-row-label';
    label.setAttribute('data-testid', `history-row-label-${version.id}`);
    label.textContent = version.name;

    const timestamp = document.createElement('span');
    timestamp.className = 'history-row-time';
    timestamp.setAttribute('data-testid', `history-row-time-${version.id}`);
    timestamp.textContent = formatTimestamp(version.updated);

    info.appendChild(label);
    info.appendChild(timestamp);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'history-row-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'history-action-btn history-restore-btn';
    restoreBtn.setAttribute('data-testid', `history-restore-btn-${version.id}`);
    restoreBtn.textContent = 'Restore';
    restoreBtn.title = 'Restore this version';
    restoreBtn.addEventListener('click', () => {
      this.container.dispatchEvent(
        new CustomEvent('history-restore', {
          bubbles: true,
          detail: { id: version.id },
        }),
      );
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'history-action-btn history-delete-btn';
    deleteBtn.setAttribute('data-testid', `history-delete-btn-${version.id}`);
    deleteBtn.textContent = 'Delete';
    deleteBtn.title = 'Delete this version';
    deleteBtn.addEventListener('click', () => {
      this.container.dispatchEvent(
        new CustomEvent('history-delete', {
          bubbles: true,
          detail: { id: version.id },
        }),
      );
    });

    actions.appendChild(restoreBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(info);
    row.appendChild(actions);
    return row;
  }
}
