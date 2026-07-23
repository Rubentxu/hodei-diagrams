/**
 * find-dialog.ts — Ctrl+F find dialog for searching shapes by label.
 *
 * Opens a floating dialog with a text input. Typing filters shapes
 * across all pages (case-insensitive substring match). Enter steps
 * through matches; Shift+Enter goes backward. Escape closes and
 * clears the selection.
 */

import type { Editor } from './editor.js';

const FIND_DIALOG_TESTID = 'find-dialog';
const FIND_INPUT_TESTID = 'find-input';
const FIND_COUNT_TESTID = 'find-count';
const FIND_PREV_TESTID = 'find-prev';
const FIND_NEXT_TESTID = 'find-next';
const FIND_CLOSE_TESTID = 'find-close';

interface Match {
  id: { idx: number; version: number };
  label: string | null;
  bounds: { x: number; y: number; width: number; height: number };
  pageIdx: number;
}

export function showFindDialog(editor: Editor): void {
  // Remove any existing dialog first
  document.querySelectorAll(`[data-testid="${FIND_DIALOG_TESTID}"]`).forEach((el) => el.remove());

  // State
  let query = '';
  let matches: Match[] = [];
  let currentIndex = -1;

  // Build dialog DOM
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.setAttribute('data-testid', FIND_DIALOG_TESTID);

  overlay.innerHTML = `
    <div class="dialog find-dialog" role="dialog" aria-label="Find shape">
      <header class="dialog-header">
        <h2>Find</h2>
        <button class="dialog-close" data-testid="${FIND_CLOSE_TESTID}" aria-label="Close">✕</button>
      </header>
      <div class="dialog-body find-dialog-body">
        <input
          type="text"
          class="find-input"
          data-testid="${FIND_INPUT_TESTID}"
          placeholder="Search shapes by label…"
          spellcheck="false"
          autocomplete="off"
          autofocus
        />
        <span class="find-count" data-testid="${FIND_COUNT_TESTID}"></span>
      </div>
      <footer class="dialog-footer find-dialog-footer">
        <button class="dialog-btn find-prev" data-testid="${FIND_PREV_TESTID}" disabled>Prev</button>
        <button class="dialog-btn find-next" data-testid="${FIND_NEXT_TESTID}" disabled>Next</button>
      </footer>
    </div>
  `;

  document.body.appendChild(overlay);

  const inputEl = overlay.querySelector(`[data-testid="${FIND_INPUT_TESTID}"]`) as HTMLInputElement;
  const countEl = overlay.querySelector(`[data-testid="${FIND_COUNT_TESTID}"]`) as HTMLElement;
  const prevBtn = overlay.querySelector(`[data-testid="${FIND_PREV_TESTID}"]`) as HTMLButtonElement;
  const nextBtn = overlay.querySelector(`[data-testid="${FIND_NEXT_TESTID}"]`) as HTMLButtonElement;
  const closeBtn = overlay.querySelector(`[data-testid="${FIND_CLOSE_TESTID}"]`) as HTMLButtonElement;

  function updateCount(): void {
    if (!query.trim()) {
      countEl.textContent = '';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }
    if (matches.length === 0) {
      countEl.textContent = 'No matches';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    } else {
      countEl.textContent = `${currentIndex + 1} of ${matches.length}`;
      prevBtn.disabled = false;
      nextBtn.disabled = false;
    }
  }

  function scrollToMatch(match: Match): void {
    const bounds = match.bounds;
    // Center the match in the viewport
    const viewer = editor.viewerElement();
    if (!viewer) return;
    const vw = viewer.clientWidth;
    const vh = viewer.clientHeight;
    const zoom = editor.zoom();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    // setPan takes CSS pixel offsets (pre-scale)
    const panX = vw / 2 - cx * zoom;
    const panY = vh / 2 - cy * zoom;
    editor.setPan(panX, panY);
  }

  function navigateTo(index: number): void {
    if (matches.length === 0) return;
    currentIndex = ((index % matches.length) + matches.length) % matches.length;
    const match = matches[currentIndex];
    if (!match) return;
    // Clear and set selection — the editor's CSS selection highlight acts as the accent outline
    editor.clearSelection();
    editor.addToSelection(match.id);
    scrollToMatch(match);
    editor.refreshScene();
    updateCount();
  }

  function runSearch(q: string): void {
    query = q;
    const lowerQuery = query.toLowerCase();
    const all = editor.getAllShapesWithLabels();
    matches = all.filter((s) => s.label !== null && s.label.toLowerCase().includes(lowerQuery));
    currentIndex = matches.length > 0 ? 0 : -1;
    if (currentIndex >= 0) {
      navigateTo(0);
    } else {
      editor.clearSelection();
      editor.refreshScene();
    }
    updateCount();
  }

  // Event listeners
  inputEl.addEventListener('input', () => {
    runSearch(inputEl.value);
  });

  nextBtn.addEventListener('click', () => {
    navigateTo(currentIndex + 1);
  });

  prevBtn.addEventListener('click', () => {
    navigateTo(currentIndex - 1);
  });

  closeBtn.addEventListener('click', () => {
    close();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  function close(): void {
    editor.clearSelection();
    editor.refreshScene();
    overlay.remove();
  }

  // Keyboard handling on the input
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        navigateTo(currentIndex - 1);
      } else {
        navigateTo(currentIndex + 1);
      }
      e.preventDefault();
    } else if (e.key === 'Escape') {
      close();
      e.preventDefault();
    }
  });

  // Global Escape to close (in case input loses focus)
  const globalKeyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && document.querySelector(`[data-testid="${FIND_DIALOG_TESTID}"]`)) {
      close();
      document.removeEventListener('keydown', globalKeyHandler);
    }
  };
  document.addEventListener('keydown', globalKeyHandler);

  // Initial state: focus the input
  inputEl.focus();
}

