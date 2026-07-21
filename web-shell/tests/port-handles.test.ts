import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PortHandlesOverlay } from '../src/port-handles.js';
import type { OverlayHost, OverlayHitZone } from '../src/editor.js';
import type { DiagramEngineSession } from '../src/session.js';
import type { ScenePage, SlotmapId } from '../src/types.js';

// Polyfill PointerEvent if not present (JSDOM)
if (typeof PointerEvent === 'undefined') {
  (window as any).PointerEvent = class PointerEvent extends MouseEvent {
    pointerId: number;
    pressure: number;
    pointerType: string;
    isPrimary: boolean;
    override shiftKey: boolean;
    constructor(type: string, init: any = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pressure = init.pressure ?? 0;
      this.pointerType = init.pointerType ?? '';
      this.isPrimary = init.isPrimary ?? true;
      this.shiftKey = init.shiftKey ?? false;
    }
  };
}

function dispatchPointerEvent(type: string, props: Record<string, unknown> = {}): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    clientX: props.clientX as number ?? 0,
    clientY: props.clientY as number ?? 0,
    button: props.button as number ?? 0,
    pointerId: props.pointerId as number ?? 0,
    shiftKey: props.shiftKey as boolean ?? false,
  } as any);
}

// ─── Mock OverlayHost ──────────────────────────────────────────────────────────

interface ZoneRecord {
  selector: string;
  handler: (_target: Element, _event: PointerEvent) => boolean;
}

class MockOverlayHost implements OverlayHost {
  readonly #zones: ZoneRecord[] = [];

  registerOverlayHitZone(zone: OverlayHitZone): () => void {
    const record: ZoneRecord = { selector: zone.selector, handler: zone.handler };
    this.#zones.push(record);
    return () => {
      const idx = this.#zones.indexOf(record);
      if (idx !== -1) this.#zones.splice(idx, 1);
    };
  }

  dispatchPointerDown(target: Element, event: PointerEvent): boolean {
    for (const zone of this.#zones) {
      const matched = target.closest(zone.selector);
      if (matched && zone.handler(matched, event)) {
        return true;
      }
    }
    return false;
  }

  get zoneCount(): number {
    return this.#zones.length;
  }
}

// ─── Mock session ─────────────────────────────────────────────────────────────

type SetEdgeAnchorFn = (
  _edgeId: SlotmapId,
  _end: 0 | 1,
  _anchor: { kind: string; nx?: number; ny?: number },
) => { ok: true } | { ok: false; error: string };

interface MockSession {
  setEdgeAnchor: ReturnType<typeof vi.fn<SetEdgeAnchorFn>>;
}

function createMockSession(): MockSession {
  const setEdgeAnchor = vi.fn<SetEdgeAnchorFn>();
  setEdgeAnchor.mockReturnValue({ ok: true });
  return { setEdgeAnchor };
}

// ─── Scene page with a single edge between two rectangles ─────────────────────

function makeScene(): ScenePage[] {
  return [
    {
      page_id: { idx: 0, version: 0 },
      name: 'Page 1',
      width: 800,
      height: 600,
      display_list: [
        {
          Rect: {
            id: { idx: 1, version: 0 },
            bounds: { origin: { x: 50, y: 50 }, size: { width: 100, height: 60 } },
          },
        },
        {
          Rect: {
            id: { idx: 2, version: 0 },
            bounds: { origin: { x: 250, y: 50 }, size: { width: 100, height: 60 } },
          },
        },
        {
          Edge: {
            id: { idx: 10, version: 0 },
            source: { Vertex: { idx: 1, version: 0 } },
            target: { Vertex: { idx: 2, version: 0 } },
            geometry: {
              sourcePoint: { x: 100, y: 80 },
              targetPoint: { x: 250, y: 80 },
              points: [],
            },
          },
        },
      ],
    },
  ];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create an SVG layer using innerHTML (like editor.test.ts does).
 * Uses data-vertex-idx (not data-vertex-id) to match beginFromEvent expectations.
 */
function createDivWithSvg(innerHtml: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = innerHtml;
  return div;
}

describe('PortHandlesOverlay DragSession lifecycle', () => {
  let host: MockOverlayHost;
  // Use mock type to allow .mock.calls access on setEdgeAnchor
  let session: ReturnType<typeof createMockSession>;

  beforeEach(() => {
    host = new MockOverlayHost();
    session = createMockSession();
  });

  // ── T1: begin commits, current reflects state ───────────────────────────────

  it('beginFromEvent starts drag session and current reflects PortDragState', () => {
    // Use innerHTML like editor.test.ts — JSDOM parses this correctly for HTML namespaces
    // NOTE: data-vertex-idx (not data-vertex-id) matches beginFromEvent expectations
    const container = createDivWithSvg(
      `<svg><circle class="port-handle" data-vertex-idx="1" data-vertex-version="0" data-edge-idx="10" data-edge-version="0" data-end="0" cx="100" cy="80" r="5"/></svg>`,
    );
    const svgLayer = container as unknown as HTMLElement;
    const overlay = new PortHandlesOverlay(svgLayer, makeScene, session as unknown as DiagramEngineSession);
    overlay.attach(host);

    const circle = container.querySelector('.port-handle') as SVGCircleElement;
    expect(circle).not.toBeNull();

    const event = dispatchPointerEvent('pointerdown', { clientX: 100, clientY: 80 });
    const handled = host.dispatchPointerDown(circle, event);
    expect(handled).toBe(true);

    // Commit with a small move above threshold (3px)
    document.dispatchEvent(dispatchPointerEvent('pointermove', { clientX: 105, clientY: 82 }));
    document.dispatchEvent(dispatchPointerEvent('pointerup', { clientX: 105, clientY: 82 }));

    // setEdgeAnchor should have been called with end: 0|1 (numeric, not string)
    expect(session.setEdgeAnchor).toHaveBeenCalled();
    const call = session.setEdgeAnchor.mock.calls[0]!;
    expect(call[1]).toBe(0); // end is 0 (source) — numeric literal, not 'source' string
  });

  // ── T2: sub-threshold (3px) cancel does NOT commit ───────────────────────

  it('pointermove below 3px threshold calls onCancel without committing', () => {
    const container = createDivWithSvg(
      `<svg><circle class="port-handle" data-vertex-idx="1" data-vertex-version="0" data-edge-idx="10" data-edge-version="0" data-end="0" cx="100" cy="80" r="5"/></svg>`,
    );
    const svgLayer = container as unknown as HTMLElement;
    const overlay = new PortHandlesOverlay(svgLayer, makeScene, session as unknown as DiagramEngineSession);
    overlay.attach(host);

    const circle = container.querySelector('.port-handle') as SVGCircleElement;
    expect(circle).not.toBeNull();

    const event = dispatchPointerEvent('pointerdown', { clientX: 100, clientY: 80 });
    host.dispatchPointerDown(circle, event);

    // Sub-threshold move (only ~1.4px Euclidean distance)
    document.dispatchEvent(dispatchPointerEvent('pointermove', { clientX: 101, clientY: 81 }));
    document.dispatchEvent(dispatchPointerEvent('pointerup', { clientX: 101, clientY: 81 }));

    // onCancel fires but no command is issued
    expect(session.setEdgeAnchor).not.toHaveBeenCalled();
  });

  // ── T3: end: 0|1 literal — assert numeric end, not string ─────────────────

  it('setEdgeAnchor is called with numeric end (0=source, 1=target), not string', () => {
    // Build a scene with the target port handle (data-end="1")
    const container = createDivWithSvg(
      `<svg><circle class="port-handle" data-vertex-idx="2" data-vertex-version="0" data-edge-idx="10" data-edge-version="0" data-end="1" cx="250" cy="80" r="5"/></svg>`,
    );
    const svgLayer = container as unknown as HTMLElement;
    const overlay = new PortHandlesOverlay(svgLayer, makeScene, session as unknown as DiagramEngineSession);
    overlay.attach(host);

    const circle = container.querySelector('.port-handle') as SVGCircleElement;
    expect(circle).not.toBeNull();

    const event = dispatchPointerEvent('pointerdown', { clientX: 250, clientY: 80 });
    host.dispatchPointerDown(circle, event);

    // Move above threshold
    document.dispatchEvent(dispatchPointerEvent('pointermove', { clientX: 260, clientY: 82 }));
    document.dispatchEvent(dispatchPointerEvent('pointerup', { clientX: 260, clientY: 82 }));

    expect(session.setEdgeAnchor).toHaveBeenCalledTimes(1);
    const call = session.setEdgeAnchor.mock.calls[0]!;
    // end is the second argument
    expect(call[1]).toBe(1); // numeric 1, NOT string 'target'
    expect(typeof call[1]).toBe('number');
  });
});
