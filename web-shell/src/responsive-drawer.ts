/**
 * responsive-drawer.ts — R3: Mobile drawer controller.
 * Replaces `display: none !important` at mobile breakpoint with slide-in drawers.
 * Accessibility: focus trap, Escape dismiss, outside-click dismiss, aria-modal.
 * prefers-reduced-motion handled entirely by CSS (styles.css @media rule).
 */

export type DrawerType = 'sidebar' | 'inspector';

interface DrawerOptions {
  drawer: DrawerType;
  drawerEl: HTMLElement;
  overlayEl: HTMLElement;
  closeBtn: HTMLButtonElement;
  triggerEl: HTMLElement | null;
}

export class DrawerController {
  private _isOpen = false;
  private previouslyFocusedEl: HTMLElement | null = null;
  private readonly boundKeydown = this.handleKeydown.bind(this);
  private readonly boundOverlayClick = this.handleOverlayClick.bind(this);
  private readonly boundCloseClick = () => this.close();
  private static _activeDrawers = new Set<DrawerController>();

  // eslint-disable-next-line no-unused-vars -- opts is used via this.opts (TypeScript constructor property shorthand)
  constructor(private readonly opts: DrawerOptions) {}

  /** Close all open drawers (called by main.ts for overlay deactivation) */
  static closeAll(): void {
    for (const ctrl of DrawerController._activeDrawers) ctrl.close();
  }

  isOpen(): boolean { return this._isOpen; }

  open(): void {
    if (this._isOpen) return;
    for (const ctrl of DrawerController._activeDrawers) ctrl.close();
    this.previouslyFocusedEl = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    this._isOpen = true;
    DrawerController._activeDrawers.add(this);

    document.querySelector('#app')?.setAttribute('data-drawer-open', this.opts.drawer);
    this.opts.drawerEl.setAttribute('role', 'dialog');
    this.opts.drawerEl.setAttribute('aria-modal', 'true');
    this.opts.overlayEl.setAttribute('aria-hidden', 'false');
    document.addEventListener('keydown', this.boundKeydown);
    this.opts.overlayEl.addEventListener('click', this.boundOverlayClick);
    this.opts.closeBtn.addEventListener('click', this.boundCloseClick);

    requestAnimationFrame(() => {
      const focusable = this.getFocusableElements();
      (focusable[0] ?? this.opts.closeBtn).focus();
    });
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    document.querySelector('#app')?.removeAttribute('data-drawer-open');
    this.opts.drawerEl.removeAttribute('role');
    this.opts.drawerEl.removeAttribute('aria-modal');
    this.opts.overlayEl.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', this.boundKeydown);
    this.opts.overlayEl.removeEventListener('click', this.boundOverlayClick);
    this.opts.closeBtn.removeEventListener('click', this.boundCloseClick);
    const returnEl = this.opts.triggerEl ?? this.previouslyFocusedEl;
    if (returnEl && typeof returnEl.focus === 'function') returnEl.focus();
    DrawerController._activeDrawers.delete(this);
  }

  toggle(): void { this._isOpen ? this.close() : this.open(); }

  private getFocusableElements(): HTMLElement[] {
    const sel = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    return Array.from(this.opts.drawerEl.querySelectorAll<HTMLElement>(sel))
      .filter(el => !el.closest('[hidden]') && !el.closest('[aria-hidden="true"]'));
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
    if (e.key !== 'Tab') return;
    const focusable = this.getFocusableElements();
    if (focusable.length === 0) { e.preventDefault(); return; }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); return; }
    if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); return; }
    if (active && !this.opts.drawerEl.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  }

  private handleOverlayClick(e: MouseEvent): void {
    if (e.target === this.opts.overlayEl) this.close();
  }
}
