/**
 * bend-handles.test.ts — Unit tests for BendHandlesOverlay.
 *
 * Tests the overlay's attach/detach/render/dispose lifecycle,
 * beginFromEvent routing, and DragSession integration.
 */

// JSDOM does not provide PointerEvent; polyfill using MouseEvent
if (typeof PointerEvent === 'undefined') {
  (window as any).PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type: string, init?: Record<string, unknown>) {
      super(type, init);
    }
  };
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BendHandlesOverlay } from '../src/bend-handles.js';
import type { SlotmapId, ScenePage, DiagramEngineSession } from '../src/types.js';

// ─── Mock types ────────────────────────────────────────────────────────────────

interface ZoneRecord {
  selector: string;
  handler: (_target: Element, _event: PointerEvent) => boolean;
}

class MockOverlayHost {
  readonly #zones: ZoneRecord[] = [];

  registerOverlayHitZone(zone: ZoneRecord): () => void {
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

type MoveBendFn = (
  _edgeId: SlotmapId,
  _bendIndex: number,
  _x: number,
  _y: number,
) => { ok: true } | { ok: false; error: string };

interface MockSession {
  moveBend: ReturnType<typeof vi.fn<MoveBendFn>>;
}

function createMockSession(): MockSession {
  const moveBend = vi.fn<MoveBendFn>();
  moveBend.mockReturnValue({ ok: true });
  return { moveBend };
}

// ─── Scene helpers ────────────────────────────────────────────────────────────

function makeSceneWithEdge(edgeId: SlotmapId): ScenePage[] {
  return [
    {
      page_id: { idx: 1, version: 1 },
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
          // Path edge with 2 waypoints (3 points total): src, bend0, tgt
          Path: {
            id: { idx: edgeId.idx, version: edgeId.version },
            source: { Vertex: { idx: 1, version: 0 } },
            target: { Vertex: { idx: 2, version: 0 } },
            points: [
              { x: 100, y: 80 },
              { x: 150, y: 250 },
              { x: 300, y: 80 },
            ],
          },
        },
      ],
    },
  ];
}

// ─── Test setup ───────────────────────────────────────────────────────────────

function createViewerDiv(): HTMLElement {
  const div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.left = '0px';
  div.style.top = '0px';
  div.style.width = '400px';
  div.style.height = '300px';
  // Mock getBoundingClientRect for the div
  Object.defineProperty(div, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 400, height: 300 }),
  });
  // Add an SVG child so clientToDoc uses viewBox path
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 400 300');
  svg.style.width = '400px';
  svg.style.height = '300px';
  Object.defineProperty(svg, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 400, height: 300 }),
  });
  div.appendChild(svg);
  return div;
}

function dispatchPointerEvent(type: string, opts: Record<string, number>): PointerEvent {
  return new PointerEvent(type, {
    clientX: opts.clientX,
    clientY: opts.clientY,
    bubbles: true,
    cancelable: true,
  } as PointerEventInit);
}

describe('BendHandlesOverlay', () => {
  let host: MockOverlayHost;
  let session: MockSession;
  let viewer: HTMLElement;

  beforeEach(() => {
    host = new MockOverlayHost();
    session = createMockSession();
    viewer = createViewerDiv();
    vi.clearAllMocks();
  });

  // ─── T1: attach registers hit zone ─────────────────────────────────────────

  it('attach() registers a .bend-handle hit zone on the host', () => {
    const overlay = new BendHandlesOverlay(
      viewer as unknown as HTMLElement,
      viewer,
      () => [],
      session as unknown as DiagramEngineSession,
      (x, y) => ({ x, y }),
      (msg) => {},
      () => {},
    );
    overlay.attach(host);
    expect(host.zoneCount).toBe(1);
  });

  // ─── T2: detach removes hit zone ───────────────────────────────────────────

  it('detach() removes the registered hit zone', () => {
    const overlay = new BendHandlesOverlay(
      viewer as unknown as HTMLElement,
      viewer,
      () => [],
      session as unknown as DiagramEngineSession,
      (x, y) => ({ x, y }),
      (msg) => {},
      () => {},
    );
    overlay.attach(host);
    expect(host.zoneCount).toBe(1);
    overlay.detach();
    expect(host.zoneCount).toBe(0);
  });

  // ─── T3: render with null clears handles ───────────────────────────────────

  it('render(null) removes all .bend-handle elements from DOM', () => {
    const edgeId: SlotmapId = { idx: 10, version: 0 };
    const overlay = new BendHandlesOverlay(
      viewer as unknown as HTMLElement,
      viewer,
      () => makeSceneWithEdge(edgeId),
      session as unknown as DiagramEngineSession,
      (x, y) => ({ x, y }),
      (msg) => {},
      () => {},
    );
    overlay.attach(host);

    // Render with an edge — should create handles
    overlay.render(edgeId);
    const countAfterRender = viewer.querySelectorAll('.bend-handle').length;
    expect(countAfterRender).toBe(1); // 1 intermediate waypoint in makeSceneWithEdge

    // Clear
    overlay.render(null);
    expect(viewer.querySelectorAll('.bend-handle').length).toBe(0);
  });

  // ─── T4: render with edge creates one handle per bend ──────────────────────

  it('render(edgeId) creates one .bend-handle per intermediate waypoint', () => {
    const edgeId: SlotmapId = { idx: 10, version: 0 };
    const overlay = new BendHandlesOverlay(
      viewer as unknown as HTMLElement,
      viewer,
      () => makeSceneWithEdge(edgeId),
      session as unknown as DiagramEngineSession,
      (x, y) => ({ x, y }),
      (msg) => {},
      () => {},
    );
    overlay.attach(host);
    overlay.render(edgeId);

    // Path has 3 points: [src, bend0, tgt]; intermediate = 1 (index 1)
    const handles = viewer.querySelectorAll('.bend-handle');
    expect(handles.length).toBe(1);
    expect(handles[0]!.getAttribute('data-bend-index')).toBe('1');
    expect(handles[0]!.getAttribute('data-edge-idx')).toBe('10');
  });

  // ─── T5: beginFromEvent false for non-bend elements ───────────────────────

  it('beginFromEvent returns false for elements not matching .bend-handle', () => {
    const overlay = new BendHandlesOverlay(
      viewer as unknown as HTMLElement,
      viewer,
      () => [],
      session as unknown as DiagramEngineSession,
      (x, y) => ({ x, y }),
      (msg) => {},
      () => {},
    );
    overlay.attach(host);

    const div = document.createElement('div');
    const event = dispatchPointerEvent('pointerdown', { clientX: 100, clientY: 80 });
    const result = overlay.beginFromEvent(div, event);
    expect(result).toBe(false);
  });

  // ─── T6: beginFromEvent parses data attrs and starts DragSession ───────────

  it('beginFromEvent parses data attributes and calls session.moveBend on move', () => {
    const edgeId: SlotmapId = { idx: 10, version: 0 };
    const overlay = new BendHandlesOverlay(
      viewer as unknown as HTMLElement,
      viewer,
      () => makeSceneWithEdge(edgeId),
      session as unknown as DiagramEngineSession,
      (x, y) => ({ x, y }),
      (msg) => {},
      () => {},
    );
    overlay.attach(host);
    overlay.render(edgeId);

    const handle = viewer.querySelector('.bend-handle') as SVGCircleElement;
    expect(handle).not.toBeNull();

    // Simulate pointerdown on the handle
    const downEvent = dispatchPointerEvent('pointerdown', { clientX: 150, clientY: 250 });
    const handled = overlay.beginFromEvent(handle, downEvent);
    expect(handled).toBe(true);

    // Simulate pointermove — should call moveBend
    const moveEvent = dispatchPointerEvent('pointermove', { clientX: 160, clientY: 260 });
    document.dispatchEvent(moveEvent);

    expect(session.moveBend).toHaveBeenCalled();
  });

  // ─── T7: dispose cleans up ─────────────────────────────────────────────────

  it('dispose() removes all .bend-handle elements and disposes DragSession', () => {
    const edgeId: SlotmapId = { idx: 10, version: 0 };
    const overlay = new BendHandlesOverlay(
      viewer as unknown as HTMLElement,
      viewer,
      () => makeSceneWithEdge(edgeId),
      session as unknown as DiagramEngineSession,
      (x, y) => ({ x, y }),
      (msg) => {},
      () => {},
    );
    overlay.attach(host);
    overlay.render(edgeId);
    expect(viewer.querySelectorAll('.bend-handle').length).toBeGreaterThan(0);

    overlay.dispose();
    expect(viewer.querySelectorAll('.bend-handle').length).toBe(0);
    expect(host.zoneCount).toBe(0);
  });
});
