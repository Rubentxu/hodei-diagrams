/**
 * math-dialog.ts — Insert and edit math formula dialogs.
 *
 * Insert: shown from navbar "Insert > Math Formula" action.
 * Edit: shown from double-click on a math-vertex (data-math-id attribute present).
 */

import { showDialog, hideDialog } from '../ui.js';

/**
 * Open a dialog for inserting a new math formula.
 * Creates a rectangle with the LaTeX label at canvas center.
 *
 * @param onInsert Called with the LaTeX string when user confirms.
 *                  The caller creates the vertex and sets the label.
 */
export function openMathInsertDialog(onInsert: (_latex: string) => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'dialog';

  dialog.innerHTML = `
    <div class="dialog-header">
      <span class="dialog-title">Insert Math Formula</span>
      <button class="dialog-close" data-testid="math-insert-dialog-close" aria-label="Close">✕</button>
    </div>
    <div class="dialog-body" style="gap: 8px;">
      <p style="font-size: 12px; color: var(--text-dim); margin: 0;">
        Enter LaTeX expression (e.g. x^2 + y^2 = z^2):
      </p>
      <input
        type="text"
        id="math-latex-input"
        class="dialog-input"
        placeholder="e.g. \\\\alpha + \\\\beta"
        data-testid="math-latex-input"
        style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-tertiary); color: var(--text); font-family: monospace;"
      />
    </div>
    <div class="dialog-footer">
      <button class="dialog-cancel" data-testid="math-insert-dialog-cancel">Cancel</button>
      <button class="dialog-save" data-testid="math-insert-dialog-insert">Insert</button>
    </div>
  `;

  overlay.appendChild(dialog);

  const closeBtn = dialog.querySelector('[data-testid="math-insert-dialog-close"]');
  const cancelBtn = dialog.querySelector('[data-testid="math-insert-dialog-cancel"]');
  const insertBtn = dialog.querySelector('[data-testid="math-insert-dialog-insert"]');
  const latexInput = dialog.querySelector('[data-testid="math-latex-input"]') as HTMLInputElement;

  function close(): void {
    hideDialog(overlay);
    overlay.remove();
  }

  closeBtn?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  insertBtn?.addEventListener('click', () => {
    const latex = latexInput.value.trim();
    if (latex) {
      close();
      onInsert(latex);
    }
  });

  // Focus the input on open
  latexInput.focus();

  // Enter key submits
  latexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const latex = latexInput.value.trim();
      if (latex) {
        close();
        onInsert(latex);
      }
    }
    if (e.key === 'Escape') {
      close();
    }
  });

  document.body.appendChild(overlay);
  showDialog(overlay);
}

/**
 * Open a dialog for editing an existing math formula.
 *
 * @param currentLatex The current LaTeX string.
 * @param onSave Called with the new LaTeX string when user confirms.
 */
export function openMathEditDialog(
  currentLatex: string,
  onSave: (_newLatex: string) => void,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'dialog';

  dialog.innerHTML = `
    <div class="dialog-header">
      <span class="dialog-title">Edit Math Formula</span>
      <button class="dialog-close" data-testid="math-edit-dialog-close" aria-label="Close">✕</button>
    </div>
    <div class="dialog-body" style="gap: 8px;">
      <p style="font-size: 12px; color: var(--text-dim); margin: 0;">
        Edit LaTeX expression:
      </p>
      <input
        type="text"
        id="math-latex-input"
        class="dialog-input"
        placeholder="e.g. \\\\alpha + \\\\beta"
        data-testid="math-latex-input"
        value="${currentLatex.replace(/"/g, '&quot;')}"
        style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-tertiary); color: var(--text); font-family: monospace;"
      />
    </div>
    <div class="dialog-footer">
      <button class="dialog-cancel" data-testid="math-edit-dialog-cancel">Cancel</button>
      <button class="dialog-save" data-testid="math-edit-dialog-save">Save</button>
    </div>
  `;

  overlay.appendChild(dialog);

  const closeBtn = dialog.querySelector('[data-testid="math-edit-dialog-close"]');
  const cancelBtn = dialog.querySelector('[data-testid="math-edit-dialog-cancel"]');
  const saveBtn = dialog.querySelector('[data-testid="math-edit-dialog-save"]');
  const latexInput = dialog.querySelector('[data-testid="math-latex-input"]') as HTMLInputElement;

  function close(): void {
    hideDialog(overlay);
    overlay.remove();
  }

  closeBtn?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  saveBtn?.addEventListener('click', () => {
    const latex = latexInput.value.trim();
    if (latex) {
      close();
      onSave(latex);
    }
  });

  // Focus and select the input on open
  latexInput.focus();
  latexInput.select();

  // Enter key submits, Escape closes
  latexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const latex = latexInput.value.trim();
      if (latex) {
        close();
        onSave(latex);
      }
    }
    if (e.key === 'Escape') {
      close();
    }
  });

  document.body.appendChild(overlay);
  showDialog(overlay);
}
