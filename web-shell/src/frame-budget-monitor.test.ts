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
    rafCallbacks.forEach((cb) => cb(100));
    // Trigger second frame after 16ms
    rafCallbacks.forEach((cb) => cb(116));

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
});
