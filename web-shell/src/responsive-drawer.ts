/**
 * responsive-drawer.ts — R3: Mobile drawer controller with focus trap,
 * a11y, and prefers-reduced-motion support.
 *
 * Replaces `display: none !important` rules at mobile breakpoint with
 * slide-in drawers that are always reachable (no essential control ever hidden).
 */

export type DrawerType = 'sidebar' | 'inspector';

interface DrawerOptions {
  drawer: DrawerType;
  drawerEl: HTMLElement;
  overlayEl: HTMLElement;
  closeBtn: HTMLButtonElement;
  triggerEl: HTMLElement | null;
}

/**
 * DrawerController manages a modal drawer with:
 * - open / close / isOpen API
 * - Focus trap (Tab cycles within drawer)
 * - Escape key dismiss
 * - Outside-click dismiss
 * - Return focus to trigger element on close
 * - aria-modal / role="dialog"
 * - prefers-reduced-motion: instant open/close
 *
 * Mutual exclusion: call DrawerController.closeAll() before opening a new drawer.
 */
export class DrawerController {
  private readonly opts: DrawerOptions;
  private _isOpen = false;
  private previouslyFocusedEl: HTMLElement | null = null;
  private boundKeydown: (e: KeyboardEvent) => void;
  private boundOverlayClick: (e: MouseEvent) => void;
  private boundCloseClick: (e: MouseEvent) => void;

  /** Global registry for mutual exclusion — close all drawers before opening a new one */
  private static _activeDrawers = new Set<DrawerController>();

  constructor(opts: DrawerOptions) {
    this.opts = opts;
    this.boundKeydown = this.handleKeydown.bind(this);
    this.boundOverlayClick = this.handleOverlayClick.bind(this);
    this.boundCloseClick = this.handleCloseClick.bind(this);
  }

  /** Close all open drawers (used for mutual exclusion) */
  static closeAll(): void {
    for (const ctrl of DrawerController._activeDrawers) {
      ctrl._closeUnsafe();
    }
    DrawerController._activeDrawers.clear();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  isOpen(): boolean {
    return this._isOpen;
  }

  open(): void {
    if (this._isOpen) return;
    // Mutual exclusion: close any open drawer first
    DrawerController.closeAll();
    this.previouslyFocusedEl = this.getCurrentlyFocusedEl();
    this._isOpen = true;
    DrawerController._activeDrawers.add(this);

    // Set aria attribute on app root so CSS can target
    document.querySelector('#app')?.setAttribute('data-drawer-open', this.opts.drawer);

    // Accessibility: mark drawer as dialog
    this.opts.drawerEl.setAttribute('role', 'dialog');
    this.opts.drawerEl.setAttribute('aria-modal', 'true');
    this.opts.overlayEl.setAttribute('aria-hidden', 'false');

    // Attach listeners
    document.addEventListener('keydown', this.boundKeydown);
    this.opts.overlayEl.addEventListener('click', this.boundOverlayClick);
    this.opts.closeBtn.addEventListener('click', this.boundCloseClick);

    // Focus first focusable element in drawer (or close button as fallback)
    // Instant open when prefers-reduced-motion is set
    if (this.prefersReducedMotion()) {
      this.trapFocus();
    } else {
      requestAnimationFrame(() => this.trapFocus());
    }
  }

  close(): void {
    if (!this._isOpen) return;
    this._closeUnsafe();
    DrawerController._activeDrawers.delete(this);
  }

  /** Internal close without touching the registry (used by closeAll) */
  private _closeUnsafe(): void {
    this._isOpen = false;

    document.querySelector('#app')?.removeAttribute('data-drawer-open');

    this.opts.drawerEl.removeAttribute('role');
    this.opts.drawerEl.removeAttribute('aria-modal');
    this.opts.overlayEl.setAttribute('aria-hidden', 'true');

    document.removeEventListener('keydown', this.boundKeydown);
    this.opts.overlayEl.removeEventListener('click', this.boundOverlayClick);
    this.opts.closeBtn.removeEventListener('click', this.boundCloseClick);

    // Return focus to trigger (or previously focused element)
    const returnEl = this.opts.triggerEl ?? this.previouslyFocusedEl;
    if (returnEl && typeof returnEl.focus === 'function') {
      returnEl.focus();
    }
  }

  toggle(): void {
    if (this._isOpen) this.close();
    else this.open();
  }

  // ─── Focus trap ─────────────────────────────────────────────────────────────

  private prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private trapFocus(): void {
    const focusable = this.getFocusableElements();
    if (focusable.length === 0) {
      this.opts.closeBtn.focus();
      return;
    }
    focusable[0]!.focus();
  }

  private getFocusableElements(): HTMLElement[] {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    const all = Array.from(
      this.opts.drawerEl.querySelectorAll<HTMLElement>(selector),
    );
    return all.filter((el) => !el.closest('[hidden]') && !el.closest('[aria-hidden="true"]'));
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      return;
    }

    if (e.key !== 'Tab') return;

    const focusable = this.getFocusableElements();
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    if (e.shiftKey) {
      // Shift+Tab: if at first, wrap to last
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: if at last, wrap to first
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // ─── Outside-click dismiss ──────────────────────────────────────────────────

  private handleOverlayClick(e: MouseEvent): void {
    // Only close if click is on the overlay itself (not children)
    if (e.target === this.opts.overlayEl) {
      this.close();
    }
  }

  // ─── Close button dismiss ───────────────────────────────────────────────────

  private handleCloseClick(_e: MouseEvent): void {
    this.close();
  }

  // ─── Utility ────────────────────────────────────────────────────────────────

  private getCurrentlyFocusedEl(): HTMLElement | null {
    const active = document.activeElement;
    if (active instanceof HTMLElement) return active;
    return null;
  }
}
