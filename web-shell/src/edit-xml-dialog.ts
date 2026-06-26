/**
 * edit-xml-dialog.ts — Modal that lets the user view/edit the .drawio XML
 * for the current page, then re-imports the modified text into the engine.
 *
 * Lives in its own module so the rest of the editor (sidebar, inspector,
 * file loader) does not need to know about modal/dialog rendering.
 */

export function showEditXmlDialog(
  initialXml: string,
  onSave: (_newXml: string) => boolean,
): void {
  // Remove any existing dialog first
  document.querySelectorAll('[data-testid="edit-xml-dialog"]').forEach((el) => el.remove());

  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.setAttribute('data-testid', 'edit-xml-dialog');

  overlay.innerHTML = `
    <div class="dialog edit-xml-dialog" role="dialog" aria-labelledby="edit-xml-title">
      <header class="dialog-header">
        <h2 id="edit-xml-title">Edit .drawio XML</h2>
        <button class="dialog-close" data-testid="edit-xml-close" aria-label="Close">✕</button>
      </header>
      <div class="dialog-body">
        <p class="edit-xml-hint">
          Edit the XML below. Press <strong>Cancel</strong> to discard or
          <strong>Apply</strong> to re-import into the engine.
        </p>
        <textarea
          class="edit-xml-textarea"
          data-testid="edit-xml-textarea"
          spellcheck="false"
          autocomplete="off"
        ></textarea>
        <p class="edit-xml-error" data-testid="edit-xml-error" hidden></p>
      </div>
      <footer class="dialog-footer">
        <button class="dialog-cancel" data-testid="edit-xml-cancel">Cancel</button>
        <button class="dialog-save" data-testid="edit-xml-apply">Apply</button>
      </footer>
    </div>
  `;

  const textarea = overlay.querySelector('[data-testid="edit-xml-textarea"]') as HTMLTextAreaElement;
  const errorEl = overlay.querySelector('[data-testid="edit-xml-error"]') as HTMLElement;
  textarea.value = initialXml;

  const close = () => overlay.remove();
  overlay.querySelector('[data-testid="edit-xml-close"]')
    ?.addEventListener('click', close);
  overlay.querySelector('[data-testid="edit-xml-cancel"]')
    ?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('[data-testid="edit-xml-apply"]')?.addEventListener('click', () => {
    const ok = onSave(textarea.value);
    if (!ok) {
      errorEl.hidden = false;
      return;
    }
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
}