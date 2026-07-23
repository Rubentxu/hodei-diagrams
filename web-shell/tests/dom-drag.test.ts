import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DragSession, DragStateBase } from '../src/dom-drag.js';

// JSDOM does not provide PointerEvent; polyfill using MouseEvent
if (typeof PointerEvent === 'undefined') {
   
  (window as any).PointerEvent = class PointerEvent extends MouseEvent {
    pointerId: number;
    pressure: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, init: Record<string, unknown> = {}) {
      super(type, init as unknown as MouseEventInit);
      this.pointerId = (init.pointerId as number) ?? 0;
      this.pressure = (init.pressure as number) ?? 0;
      this.pointerType = (init.pointerType as string) ?? '';
      this.isPrimary = (init.isPrimary as boolean) ?? true;
    }
  };
}

interface TestState extends DragStateBase {
  value: number;
}

function dispatchPointerEvent(type: string, props: Record<string, unknown> = {}): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    clientX: props.clientX as number ?? 0,
    clientY: props.clientY as number ?? 0,
    button: props.button as number ?? 0,
    pointerId: props.pointerId as number ?? 0,
  } as unknown as PointerEventInit);
}

function dispatchEvent(type: string, props: Record<string, unknown> = {}): Event {
  return dispatchPointerEvent(type, props);
}

describe('DragSession', () => {
  let onMove: ReturnType<typeof vi.fn>;
  let onCommit: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onMove = vi.fn((e: PointerEvent, s: TestState) => ({ ...s }));
    onCommit = vi.fn();
    onCancel = vi.fn();
  });

  // ── T01: threshold gate fires commit only past dist >= threshold ─────────────

  it('calls onCommit when distance >= threshold', () => {
    const session = new DragSession<TestState>({
      onMove,
      onCommit,
      onCancel,
      threshold: 3,
    });

    session.begin({ startClientX: 100, startClientY: 100, value: 0 });
    document.dispatchEvent(dispatchEvent('pointermove', { clientX: 105, clientY: 105 })); // dist = sqrt(50) ≈ 7 > 3
    document.dispatchEvent(dispatchEvent('pointerup', { clientX: 105, clientY: 105 }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(session.isActive).toBe(false);
  });

  it('calls onCancel when distance < threshold', () => {
    const session = new DragSession<TestState>({
      onMove,
      onCommit,
      onCancel,
      threshold: 3,
    });

    session.begin({ startClientX: 100, startClientY: 100, value: 0 });
    document.dispatchEvent(dispatchEvent('pointermove', { clientX: 101, clientY: 101 })); // dist = sqrt(2) ≈ 1.4 < 3
    document.dispatchEvent(dispatchEvent('pointerup', { clientX: 101, clientY: 101 }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(session.isActive).toBe(false);
  });

  it('uses default threshold of 3px', () => {
    const session = new DragSession<TestState>({
      onMove,
      onCommit,
      onCancel,
      // threshold not provided — defaults to 3
    });

    session.begin({ startClientX: 100, startClientY: 100, value: 0 });
    document.dispatchEvent(dispatchEvent('pointermove', { clientX: 102, clientY: 102 })); // dist ≈ 2.8 < 3
    document.dispatchEvent(dispatchEvent('pointerup', { clientX: 102, clientY: 102 }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  // ── T02: listeners removed on end / cancel / dispose ──────────────────────

  it('removes all listeners after pointerup commits', () => {
    const session = new DragSession<TestState>({
      onMove,
      onCommit,
      onCancel,
      threshold: 1,
    });

    session.begin({ startClientX: 100, startClientY: 100, value: 0 });
    document.dispatchEvent(dispatchEvent('pointermove', { clientX: 200, clientY: 100 }));
    document.dispatchEvent(dispatchEvent('pointerup', { clientX: 200, clientY: 100 }));

    // Dispatch another move — should NOT call onMove since listeners are removed
    const moveBefore = onMove.mock.calls.length;
    document.dispatchEvent(dispatchEvent('pointermove', { clientX: 300, clientY: 100 }));
    expect(onMove).toHaveBeenCalledTimes(moveBefore); // no new calls
  });

  it('removes all listeners after pointercancel', () => {
    const session = new DragSession<TestState>({
      onMove,
      onCommit,
      onCancel,
      threshold: 1,
    });

    session.begin({ startClientX: 100, startClientY: 100, value: 0 });
    document.dispatchEvent(dispatchEvent('pointercancel'));

    const moveBefore = onMove.mock.calls.length;
    document.dispatchEvent(dispatchEvent('pointermove', { clientX: 300, clientY: 100 }));
    expect(onMove).toHaveBeenCalledTimes(moveBefore);
  });

  it('dispose removes listeners and nulls state', () => {
    const session = new DragSession<TestState>({
      onMove,
      onCommit,
      onCancel,
      threshold: 1,
    });

    session.begin({ startClientX: 100, startClientY: 100, value: 0 });
    session.dispose();

    const moveBefore = onMove.mock.calls.length;
    document.dispatchEvent(dispatchEvent('pointermove', { clientX: 300, clientY: 100 }));
    expect(onMove).toHaveBeenCalledTimes(moveBefore);
    expect(session.current).toBeNull();
    expect(session.isActive).toBe(false);
  });

  it('dispose is idempotent', () => {
    const session = new DragSession<TestState>({
      onMove,
      onCommit,
      onCancel,
    });
    session.dispose();
    session.dispose(); // must not throw
    expect(session.isActive).toBe(false);
  });

  // ── T03: pointercancel invokes onCancel ─────────────────────────────────────

  it('pointercancel calls onCancel without calling onCommit', () => {
    const session = new DragSession<TestState>({
      onMove,
      onCommit,
      onCancel,
      threshold: 1,
    });

    session.begin({ startClientX: 100, startClientY: 100, value: 0 });
    document.dispatchEvent(dispatchEvent('pointercancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(session.isActive).toBe(false);
  });

  // ── T04: cancel() nulls state without invoking commit ──────────────────────

  it('cancel() calls onCancel and nulls state', () => {
    const session = new DragSession<TestState>({
      onMove,
      onCommit,
      onCancel,
      threshold: 1,
    });

    session.begin({ startClientX: 100, startClientY: 100, value: 0 });
    session.cancel();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(session.current).toBeNull();
    expect(session.isActive).toBe(false);
  });

  it('cancel() is idempotent when no drag is active', () => {
    const session = new DragSession<TestState>({
      onMove,
      onCommit,
      onCancel,
    });
    session.cancel();
    session.cancel(); // must not throw
    expect(onCancel).toHaveBeenCalledTimes(0);
  });

  // ── T05: distance() helper ──────────────────────────────────────────────────

  it('distance() returns correct pixel distance', () => {
    const session = new DragSession<TestState>({
      onMove,
      onCommit,
      onCancel,
      threshold: 1,
    });

    session.begin({ startClientX: 100, startClientY: 100, value: 0 });

    // Synthetic move event with known clientX/Y
    const fakeMove = new PointerEvent('pointermove', {
      bubbles: true,
      clientX: 110,
      clientY: 120,
    });
    // The distance from (100,100) to (110,120) = sqrt(10^2 + 20^2) = sqrt(500) ≈ 22.4
    expect(session.distance(fakeMove)).toBeCloseTo(Math.sqrt(500), 1);
  });

  it('isActive is true during drag and false after', () => {
    const session = new DragSession<TestState>({
      onMove,
      onCommit,
      onCancel,
      threshold: 1,
    });

    expect(session.isActive).toBe(false);
    session.begin({ startClientX: 100, startClientY: 100, value: 0 });
    expect(session.isActive).toBe(true);
    document.dispatchEvent(dispatchEvent('pointerup', { clientX: 200, clientY: 100 }));
    expect(session.isActive).toBe(false);
  });
});
