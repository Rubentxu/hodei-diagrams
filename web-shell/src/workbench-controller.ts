/**
 * workbench-controller.ts — Thin layout-state FSM (R1a tasks 1.1.4–1.1.8)
 * Owns exactly 5 fields. Engine state flows IN as read-only LayoutContext.
 */
import type { Result } from './types.js';

export type DockMode = 'shapes' | 'layers' | 'history';
export type Breakpoint = 'desktop' | 'tablet' | 'mobile';
export type HudDensity = 'full' | 'compact';
export type OverlayType = 'sidebar' | 'inspector' | null;

export interface WorkbenchState {
  dockMode: DockMode;
  panelVisibility: { sidebar: boolean; inspector: boolean };
  breakpoint: Breakpoint;
  hudDensity: HudDensity;
  overlayActive: OverlayType;
}

export interface LayoutContext {
  hasSelection: boolean;
  isDragging: boolean;
  snapEnabled: boolean;
  gridVisible: boolean;
  isEditing: boolean;
}

type WorkbenchListener = (state: WorkbenchState) => void;

// ─── Boundary guard (entropy verification) ───────────────────────────────────
const FIELD_COUNT = 5;

export function isWorkbenchState(obj: unknown): obj is WorkbenchState {
  if (typeof obj !== 'object' || obj === null) return false;
  const s = obj as WorkbenchState;
  if (Object.keys(s).length !== FIELD_COUNT) return false;
  return (
    ['shapes', 'layers', 'history'].includes(s.dockMode) &&
    ['desktop', 'tablet', 'mobile'].includes(s.breakpoint) &&
    ['full', 'compact'].includes(s.hudDensity) &&
    ['sidebar', 'inspector', null].includes(s.overlayActive) &&
    typeof s.panelVisibility === 'object' && s.panelVisibility !== null &&
    typeof s.panelVisibility.sidebar === 'boolean' &&
    typeof s.panelVisibility.inspector === 'boolean'
  );
}

export function assertControllerBoundary(state: WorkbenchState): void {
  if (!isWorkbenchState(state)) throw new Error(`[WorkbenchController] Boundary violation: must own exactly ${FIELD_COUNT} fields.`);
}

// ─── Controller ──────────────────────────────────────────────────────────────
export class WorkbenchController {
  private readonly _state: WorkbenchState = {
    dockMode: 'shapes', panelVisibility: { sidebar: true, inspector: false },
    breakpoint: 'desktop', hudDensity: 'compact', overlayActive: null,
  };
  private readonly _listeners = new Set<WorkbenchListener>();

  getState(): Readonly<WorkbenchState> { return this._state; }

  subscribe(fn: WorkbenchListener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  setState(partial: Partial<WorkbenchState>): void {
    // Overlay mutual exclusion: opening one overlay closes the other
    if (partial.overlayActive === 'sidebar' && this._state.overlayActive !== null && this._state.overlayActive !== 'sidebar') {
      this._state.overlayActive = null;
    } else if (partial.overlayActive === 'inspector' && this._state.overlayActive !== null && this._state.overlayActive !== 'inspector') {
      this._state.overlayActive = null;
    }
    Object.assign(this._state, partial);
    this._notify();
  }

  // ── DensityContext-derived state (4 fields, no hasSelection) ───────────────
  updateHudDensity(ctx: Omit<LayoutContext, 'hasSelection'>): void {
    const full = ctx.isDragging || ctx.snapEnabled || ctx.gridVisible || ctx.isEditing;
    const next: HudDensity = full ? 'full' : 'compact';
    if (this._state.hudDensity !== next) { this._state.hudDensity = next; this._notify(); }
  }

  // ── Full LayoutContext for updateContextualToolbar (includes hasSelection) ──
  updateContextualToolbar(ctx: LayoutContext): void {
    const root = document.getElementById('app');
    root?.setAttribute('data-context-toolbar', ctx.hasSelection ? 'active' : 'inactive');
  }

  // ── Breakpoint detection ───────────────────────────────────────────────────
  detectBreakpoint(): void {
    if (typeof window === 'undefined' || !window.matchMedia) {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
      this._setBp(w <= 767 ? 'mobile' : w <= 1023 ? 'tablet' : 'desktop');
      return;
    }
    const bp: Breakpoint = window.matchMedia('(max-width: 767px)').matches ? 'mobile'
      : window.matchMedia('(max-width: 1023px)').matches ? 'tablet' : 'desktop';
    this._setBp(bp);
  }

  private _setBp(bp: Breakpoint): void {
    if (this._state.breakpoint !== bp) { this._state.breakpoint = bp; this._notify(); }
  }

  private _notify(): void {
    const snap = { ...this._state };
    for (const fn of this._listeners) fn(snap);
  }
}
