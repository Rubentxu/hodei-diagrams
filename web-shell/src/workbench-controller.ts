/**
 * workbench-controller.ts — Thin layout-state FSM
 *
 * Owns exactly 5 fields: dockMode, panelVisibility, breakpoint, hudDensity, overlayActive.
 * Engine state flows IN as read-only LayoutContext — controller never commands the engine.
 *
 * Design: §Decision: Controller as Observer FSM (not event bus, not state store)
 * Spec: §Requirement: Workbench layout state is bounded
 */

// ─── Types ───────────────────────────────────────────────────────────────────

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

/** Engine state flows IN — controller reads, never writes */
export interface LayoutContext {
  hasSelection: boolean;
  isDragging: boolean;
  snapEnabled: boolean;
  gridVisible: boolean;
  isEditing: boolean;
}

type WorkbenchListener = (state: WorkbenchState) => void;

// ─── Boundary Guard ───────────────────────────────────────────────────────────

const CONTROLLER_FIELD_COUNT = 5;

/**
 * Validates that a state object has exactly the 5 fields the controller owns.
 * Used by entropy guard in verify phase.
 */
export function isWorkbenchState(obj: unknown): obj is WorkbenchState {
  if (typeof obj !== 'object' || obj === null) return false;

  const state = obj as WorkbenchState;

  const keys = Object.keys(state);
  if (keys.length !== CONTROLLER_FIELD_COUNT) return false;

  if (!['shapes', 'layers', 'history'].includes(state.dockMode)) return false;
  if (!['desktop', 'tablet', 'mobile'].includes(state.breakpoint)) return false;
  if (!['full', 'compact'].includes(state.hudDensity)) return false;
  if (!['sidebar', 'inspector', null].includes(state.overlayActive)) return false;

  if (typeof state.panelVisibility !== 'object' || state.panelVisibility === null) return false;
  if (typeof state.panelVisibility.sidebar !== 'boolean') return false;
  if (typeof state.panelVisibility.inspector !== 'boolean') return false;

  return true;
}

/** Asserts the controller boundary — used by entropy guard */
export function assertControllerBoundary(state: WorkbenchState): void {
  if (!isWorkbenchState(state)) {
    throw new Error(
      `[WorkbenchController] Boundary violation: controller must own exactly ${CONTROLLER_FIELD_COUNT} fields ` +
        `(dockMode, panelVisibility, breakpoint, hudDensity, overlayActive). ` +
        `Found extra fields.`
    );
  }
}

// ─── Controller ─────────────────────────────────────────────────────────────

export class WorkbenchController {
  private readonly _state: WorkbenchState = {
    dockMode: 'shapes',
    panelVisibility: { sidebar: true, inspector: false },
    breakpoint: 'desktop',
    hudDensity: 'compact',
    overlayActive: null,
  };

  private readonly _listeners = new Set<WorkbenchListener>();

  // ─── Getters ───────────────────────────────────────────────────────────────

  getState(): Readonly<WorkbenchState> {
    return this._state;
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  /**
   * Subscribe to layout state changes.
   * @returns unsubscribe function — call it to remove the listener
   */
  subscribe(fn: WorkbenchListener): () => void {
    this._listeners.add(fn);
    return () => {
      this._listeners.delete(fn);
    };
  }

  private _notify(): void {
    // Snapshot state to notify — listeners receive a consistent view
    const snapshot = { ...this._state };
    for (const fn of this._listeners) {
      fn(snapshot);
    }
  }

  // ─── State Mutations ────────────────────────────────────────────────────────

  /**
   * Partially update layout state. Handles overlay mutual exclusion automatically.
   * @param partial - Partial state to merge into current state
   */
  setState(partial: Partial<WorkbenchState>): void {
    // Handle overlay mutual exclusion: setting one overlay clears the other
    if (partial.overlayActive !== undefined && partial.overlayActive !== null) {
      // If setting an overlay (not null), clear the other
      if (partial.overlayActive === 'sidebar') {
        this._state.panelVisibility.inspector = false;
      } else if (partial.overlayActive === 'inspector') {
        this._state.panelVisibility.sidebar = false;
      }
    }

    // Merge partial into state
    Object.assign(this._state, partial);

    // Enforce mutual exclusion in the state itself
    if (this._state.overlayActive === 'sidebar') {
      this._state.panelVisibility.inspector = false;
    } else if (this._state.overlayActive === 'inspector') {
      this._state.panelVisibility.sidebar = false;
    }

    this._notify();
  }

  // ─── Breakpoint Detection ───────────────────────────────────────────────────

  /**
   * Detect current breakpoint via window.matchMedia.
   * Falls back to window.innerWidth for environments without matchMedia or when
   * matchMedia returns no matches (e.g., jsdom test environments).
   *
   * Media queries:
   * - mobile: max-width: 767px
   * - tablet: max-width: 1023px
   * - desktop: above 1023px
   */
  detectBreakpoint(): void {
    let breakpoint: Breakpoint = 'desktop';

    // Try matchMedia first (browser-native)
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mobileMq = window.matchMedia('(max-width: 767px)');
      const tabletMq = window.matchMedia('(max-width: 1023px)');

      if (mobileMq.matches) {
        breakpoint = 'mobile';
      } else if (tabletMq.matches) {
        breakpoint = 'tablet';
      } else {
        // No matchMedia match AND no innerWidth fallback means desktop
        // Use innerWidth as fallback when matchMedia returns no matches (test environments)
        const width = window.innerWidth;
        if (width < 768) {
          breakpoint = 'mobile';
        } else if (width < 1024) {
          breakpoint = 'tablet';
        } else {
          breakpoint = 'desktop';
        }
      }

      // Subscribe to changes for reactive updates
      const handler = () => {
        if (mobileMq.matches) {
          this.setState({ breakpoint: 'mobile' });
        } else if (tabletMq.matches) {
          this.setState({ breakpoint: 'tablet' });
        } else {
          this.setState({ breakpoint: 'desktop' });
        }
      };

      mobileMq.addEventListener('change', handler);
      tabletMq.addEventListener('change', handler);
    } else {
      // Fallback: use innerWidth (test environments like jsdom without matchMedia)
      const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
      if (width < 768) {
        breakpoint = 'mobile';
      } else if (width < 1024) {
        breakpoint = 'tablet';
      } else {
        breakpoint = 'desktop';
      }
    }

    this.setState({ breakpoint });
  }

  // ─── HUD Density ────────────────────────────────────────────────────────────

  /**
   * Map LayoutContext to HUD density tier.
   * full: visible when dragging, snap/grid enabled, or editing
   * compact: visible when idle
   */
  updateHudDensity(ctx: LayoutContext): void {
    // Full density during active interactions that need extra context
    const isActive = ctx.isDragging || ctx.snapEnabled || ctx.gridVisible || ctx.isEditing;

    const hudDensity: HudDensity = isActive ? 'full' : 'compact';

    // Also set data-hud-density on #app root for CSS targeting
    this.setState({ hudDensity });

    const app = document.getElementById('app');
    if (app) {
      app.setAttribute('data-hud-density', hudDensity);
    }
  }

  // ─── Contextual Toolbar ────────────────────────────────────────────────────

  /**
   * Map LayoutContext to contextual toolbar visibility.
   * Sets data-context-toolbar="active|inactive" on #app root.
   * Triggered by any non-empty selection with applicable actions.
   */
  updateContextualToolbar(ctx: LayoutContext): void {
    const app = document.getElementById('app');
    if (app) {
      app.setAttribute('data-context-toolbar', ctx.hasSelection ? 'active' : 'inactive');
    }
  }
}
