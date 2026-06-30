/**
 * edit-link-dialog.ts — Modal that lets the user set or clear a URL link
 * on a selected shape.
 *
 * Lives in its own module so the rest of the editor (sidebar, inspector,
 * context menu) does not need to know about modal/dialog rendering.
 *
 * IP-D: the cell-style `link` key holds a URL. Empty string clears the link.
 * URL validation: must start with http://, https://, mailto:, tel:, or be empty.
 *
 * Reference: docs/drawio-user-interaction-workflows.md (INS-003)
 */

const ALLOWED_SCHEMES = ['http://', 'https://', 'mailto:', 'tel:'] as const;

export function isValidLinkUrl(value: string): boolean {
  if (value === '') return true;
  return ALLOWED_SCHEMES.some((s) => value.startsWith(s));
}

export function showEditLinkDialog(
  initialUrl: string,
  onSave: (_newUrl: string) => void,
): void {
  // Remove any existing dialog first
  document.querySelectorAll('[data-testid="edit-link-dialog"]').forEach((el) => el.remove());

  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.setAttribute('data-testid', 'edit-link-dialog');

  overlay.innerHTML = `
    <div class="dialog edit-link-dialog" role="dialog" aria-labelledby="edit-link-title">
      <header class="dialog-header">
        <h2 id="edit-link-title">Edit Link</h2>
        <button class="dialog-close" data-testid="edit-link-close" aria-label="Close">✕</button>
      </header>
      <div class="dialog-body">
        <p class="edit-link-hint">
          Enter a URL to open when the shape is clicked. Leave empty to remove the link.
        </p>
        <input
          type="url"
          class="edit-link-input"
          data-testid="edit-link-input"
          placeholder="https://example.com"
          spellcheck="false"
          autocomplete="off"
        />
        <p class="edit-link-error" data-testid="edit-link-error" hidden></p>
      </div>
      <footer class="dialog-footer">
        <button class="dialog-cancel" data-testid="edit-link-cancel">Cancel</button>
        <button class="dialog-save" data-testid="edit-link-apply">Apply</button>
      </footer>
    </div>
  `;

  const input = overlay.querySelector('[data-testid="edit-link-input"]') as HTMLInputElement;
  const errorEl = overlay.querySelector('[data-testid="edit-link-error"]') as HTMLElement;
  input.value = initialUrl;

  const close = () => overlay.remove();
  overlay.querySelector('[data-testid="edit-link-close"]')?.addEventListener('click', close);
  overlay.querySelector('[data-testid="edit-link-cancel"]')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('[data-testid="edit-link-apply"]')?.addEventListener('click', () => {
    const value = input.value.trim();
    if (!isValidLinkUrl(value)) {
      errorEl.textContent = `URL must start with one of: ${ALLOWED_SCHEMES.join(', ')}`;
      errorEl.hidden = false;
      return;
    }
    onSave(value);
    close();
  });
  // Escape closes
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
  input.focus();
}
