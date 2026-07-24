/**
 * frame-budget-monitor.ts — Measure-only RAF loop for frame-rate observability.
 *
 * Provides smoothed FPS and frame-time via EMA (alpha=0.1), throttled HUD
 * updates at 4 Hz. Zero overhead when disabled.
 */

export interface FrameStats {
  /** Smoothed frames-per-second (EMA). 0 when disabled. */
  fps: number;
  /** Smoothed per-frame duration in milliseconds (EMA). 0 when disabled. */
  frameMs: number;
}

/**
 * Lightweight RAF loop measuring performance.now() delta between frames.
 * Observability-only: does NOT schedule work or change rendering.
 * Zero overhead when disabled (loop never starts).
 */
export class FrameBudgetMonitor {
  #rafId: number | null = null;
  #lastFrameTs = 0;
  #emaFrameMs = 16.67; // 60fps baseline
  readonly #emaAlpha = 0.1;
  #hudAccumulator = 0;
  readonly #hudIntervalMs = 250; // 4Hz HUD throttle
  #onStats: ((s: FrameStats) => void) | null = null;
  #enabled = false;

  /** Start the RAF loop. Idempotent. */
  start(onStatsUpdate?: (s: FrameStats) => void): void {
    if (this.#enabled) return;
    this.#enabled = true;
    this.#onStats = onStatsUpdate ?? null;
    this.#rafId = requestAnimationFrame(this.#tick);
  }

  /** Stop loop, cancel RAF, reset stats to zeros. Idempotent. */
  stop(): void {
    if (!this.#enabled) return;
    this.#enabled = false;
    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
    this.#emaFrameMs = 16.67;
    this.#hudAccumulator = 0;
    this.#lastFrameTs = 0;
  }

  /** Current smoothed stats; { fps: 0, frameMs: 0 } when disabled. */
  getStats(): FrameStats {
    if (!this.#enabled) {
      return { fps: 0, frameMs: 0 };
    }
    return {
      fps: this.#emaFrameMs > 0 ? Math.round(1000 / this.#emaFrameMs) : 0,
      frameMs: this.#emaFrameMs,
    };
  }

  isRunning(): boolean {
    return this.#enabled;
  }

  #tick = (now: number): void => {
    if (!this.#enabled) return;

    if (this.#lastFrameTs > 0) {
      const deltaMs = now - this.#lastFrameTs;
      // EMA smoothing: EMA = alpha * sample + (1 - alpha) * EMA
      this.#emaFrameMs = this.#emaAlpha * deltaMs + (1 - this.#emaAlpha) * this.#emaFrameMs;
    }
    this.#lastFrameTs = now;

    // Throttle onStatsUpdate to 4Hz (every 250ms)
    this.#hudAccumulator += 16.67; // approximate frame time
    if (this.#hudAccumulator >= this.#hudIntervalMs) {
      this.#hudAccumulator = 0;
      if (this.#onStats) {
        this.#onStats(this.getStats());
      }
    }

    this.#rafId = requestAnimationFrame(this.#tick);
  };
}
