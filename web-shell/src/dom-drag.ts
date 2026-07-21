/**
 * dom-drag.ts — Generic drag-session lifecycle for pointer-based gestures.
 *
 * Encapsulates the common pattern of:
 *   1. Store state on pointerdown
 *   2. Attach pointermove/pointerup/pointercancel to document
 *   3. Threshold gate: commit only if distance >= threshold
 *   4. Cleanup listeners + null state on pointerup / pointercancel / dispose
 *
 * Does NOT own geometry math, cursor styling, or DOM updates — those belong to
 * the caller. This makes DragSession<T> reusable across resize, rotation, port,
 * bend, and any future gesture without modification.
 */

export interface DragStateBase {
  startClientX: number;
  startClientY: number;
}

export interface DragSessionOptions<TState extends DragStateBase> {
  /**
   * Called on every pointermove while the session is active.
   * Return value is stored as the new state.
   */
  onMove: (e: PointerEvent, state: TState) => TState;
  /**
   * Called on pointerup if the drag distance >= threshold.
   * Use this to commit the final result.
   */
  onCommit: (e: PointerEvent, state: TState) => void;
  /**
   * Called on pointerup / pointercancel if the drag distance < threshold,
   * OR on explicit cancel(). Use for cleanup without committing.
   */
  onCancel?: (e: PointerEvent, state: TState) => void;
  /**
   * Pixel distance the pointer must travel before onCommit fires (default: 3).
   */
  threshold?: number;
}

/**
 * A reusable drag session that owns pointer listener lifecycle.
 * Construct once; call begin() per gesture.
 */
export class DragSession<TState extends DragStateBase> {
  readonly #opts: Required<DragSessionOptions<TState>>;
  readonly #onMove: (e: PointerEvent) => void;
  readonly #onUp: (e: PointerEvent) => void;
  readonly #onCancel: (e: PointerEvent) => void;

  #state: TState | null = null;
  #active = false;

  constructor(opts: DragSessionOptions<TState>) {
    this.#opts = {
      onMove: opts.onMove,
      onCommit: opts.onCommit,
      onCancel: opts.onCancel ?? (() => {}),
      threshold: opts.threshold ?? 3,
    };

    // Bound listeners allocated once and reused across gestures
    this.#onMove = (e: PointerEvent) => {
      if (!this.#active || !this.#state) return;
      this.#state = this.#opts.onMove(e, this.#state);
    };

    this.#onUp = (e: PointerEvent) => {
      if (!this.#active || !this.#state) return;
      const dist = this.#distance(e);
      if (dist >= this.#opts.threshold) {
        this.#opts.onCommit(e, this.#state);
      } else {
        this.#opts.onCancel(e, this.#state);
      }
      this.#end();
    };

    // pointercancel fires when the OS cancels the pointer (e.g. touch scroll)
    this.#onCancel = (e: PointerEvent) => {
      if (!this.#active || !this.#state) return;
      this.#opts.onCancel(e, this.#state);
      this.#end();
    };
  }

  /**
   * Start a new drag session with the given state.
   * Attaches pointermove/pointerup/pointercancel to the document.
   */
  begin(state: TState): void {
    this.#state = state;
    this.#active = true;
    document.addEventListener('pointermove', this.#onMove);
    document.addEventListener('pointerup', this.#onUp);
    document.addEventListener('pointercancel', this.#onCancel);
  }

  /** True while a drag gesture is in progress. */
  get isActive(): boolean {
    return this.#active;
  }

  /** The current drag state, or null if no drag is active. */
  get current(): TState | null {
    return this.#state;
  }

  /**
   * Cancel the current drag: calls onCancel, removes listeners, nulls state.
   * Idempotent if no drag is active.
   */
  cancel(): void {
    if (!this.#active) return;
    const fakeEvent = new PointerEvent('pointercancel');
    this.#opts.onCancel(fakeEvent, this.#state!);
    this.#end();
  }

  /**
   * Distance in pixels from the drag start to the current pointer position.
   */
  distance(e: PointerEvent): number {
    if (!this.#state) return 0;
    const dx = e.clientX - this.#state.startClientX;
    const dy = e.clientY - this.#state.startClientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  #distance(e: PointerEvent): number {
    return this.distance(e);
  }

  #end(): void {
    this.#active = false;
    this.#state = null;
    document.removeEventListener('pointermove', this.#onMove);
    document.removeEventListener('pointerup', this.#onUp);
    document.removeEventListener('pointercancel', this.#onCancel);
  }

  /**
   * Remove all listeners and null the state. Idempotent.
   * Call when the owner is being disposed.
   */
  dispose(): void {
    this.#end();
  }
}
