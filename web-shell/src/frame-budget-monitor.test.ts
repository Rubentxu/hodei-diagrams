import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FrameBudgetMonitor } from './frame-budget-monitor.js';

describe('FrameBudgetMonitor', () => {
  // Use real RAF but spy on it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rafSpy: any;
  let rafCallbacks: Array<(time: number) => void> = [];

  beforeEach(() => {
    rafCallbacks = [];
    // Spy on global requestAnimationFrame
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: (time: number) => void) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length as unknown as number;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    rafSpy.mockRestore();
    vi.restoreAllMocks();
  });

  /** Drain ALL pending RAF callbacks with the given time. */
  function tickFrame(time: number): void {
    const pending = rafCallbacks.splice(0);
    for (const cb of pending) cb(time);
  }

  it('starts disabled and reports zeros', () => {
    const monitor = new FrameBudgetMonitor();
    expect(monitor.getStats()).toEqual({ fps: 0, frameMs: 0 });
    expect(monitor.isRunning()).toBe(false);
  });

  it('start() begins RAF loop', () => {
    const monitor = new FrameBudgetMonitor();
    monitor.start();
    expect(monitor.isRunning()).toBe(true);
    expect(rafSpy).toHaveBeenCalled();
  });

  it('stop() cancels RAF and resets stats', () => {
    const monitor = new FrameBudgetMonitor();
    monitor.start();
    monitor.stop();
    expect(monitor.isRunning()).toBe(false);
    expect(monitor.getStats()).toEqual({ fps: 0, frameMs: 0 });
  });

  it('getStats returns smoothed frameMs after ticks', () => {
    const monitor = new FrameBudgetMonitor();
    const onStats = vi.fn();
    monitor.start(onStats);

    // Trigger first frame
    tickFrame(100);
    // Trigger second frame after 16ms
    tickFrame(116);

    const stats = monitor.getStats();
    expect(stats.frameMs).toBeGreaterThan(0);
    expect(stats.fps).toBeGreaterThan(0);

    monitor.stop();
  });

  it('start() and stop() are idempotent', () => {
    const monitor = new FrameBudgetMonitor();

    // Start twice - should only register one RAF
    monitor.start();
    monitor.start();
    expect(monitor.isRunning()).toBe(true);
    expect(rafSpy).toHaveBeenCalledTimes(1);

    // Stop twice - should only call cancel once
    monitor.stop();
    monitor.stop();
    expect(monitor.isRunning()).toBe(false);
  });

  it('HUD update rate is ≤4Hz at 120Hz (8.33ms frames)', () => {
    const monitor = new FrameBudgetMonitor();
    const onStats = vi.fn();
    monitor.start(onStats);

    // Simulate 120Hz: frames at 8.33ms intervals
    // 32 frames needed: 30*8.33 = 249.9ms delta (just under 250), 31*8.33 = 258.23ms >= 250
    const FRAME_MS = 8.33;
    const HUD_INTERVAL_MS = 250;

    // Advance time: 32 frames at 120Hz = ~266ms (enough to trigger HUD once)
    for (let i = 0; i < 32; i++) {
      const time = 100 + i * FRAME_MS;
      tickFrame(time);
    }

    // Should have exactly 1 HUD callback (4Hz throttle)
    expect(onStats).toHaveBeenCalledTimes(1);

    monitor.stop();
  });

  it('HUD update rate is ≤4Hz at 144Hz (6.94ms frames)', () => {
    const monitor = new FrameBudgetMonitor();
    const onStats = vi.fn();
    monitor.start(onStats);

    // Simulate 144Hz: frames at 6.94ms intervals
    const FRAME_MS = 6.94;

    // Advance time: 36 frames at 144Hz = ~250ms worth of frames
    for (let i = 0; i < 36; i++) {
      const time = 100 + i * FRAME_MS;
      tickFrame(time);
    }

    // Should have at most 1 HUD callback (4Hz throttle)
    expect(onStats.mock.calls.length).toBeLessThanOrEqual(1);

    monitor.stop();
  });

  it('HUD update rate is ≤4Hz at 240Hz (4.17ms frames)', () => {
    const monitor = new FrameBudgetMonitor();
    const onStats = vi.fn();
    monitor.start(onStats);

    // Simulate 240Hz: frames at 4.17ms intervals
    const FRAME_MS = 4.17;

    // Advance time: 60 frames at 240Hz = ~250ms worth of frames
    for (let i = 0; i < 60; i++) {
      const time = 100 + i * FRAME_MS;
      tickFrame(time);
    }

    // Should have at most 1 HUD callback (4Hz throttle)
    expect(onStats.mock.calls.length).toBeLessThanOrEqual(1);

    monitor.stop();
  });
});
