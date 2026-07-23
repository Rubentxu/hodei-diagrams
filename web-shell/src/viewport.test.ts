import { describe, it, expect, vi } from 'vitest';
import { Viewport, clampZoom, MIN_ZOOM, MAX_ZOOM, type Point } from './viewport.js';

const EPS = 1e-9;

/** Helper: create a mock DOMRect */
function makeRect(x = 0, y = 0, w = 800, h = 600): DOMRect {
  return {
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    width: w,
    height: h,
    x,
    y,
    toJSON: () => ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h }),
  } as DOMRect;
}

describe('Viewport', () => {
  describe('clientToDoc / docToClient roundtrip', () => {
    it('clientToDoc(docToClient(p)) === p for various points', () => {
      const vp = new Viewport(100, 200, 2.0, 800, 600);
      const rect = makeRect(0, 0, 800, 600);
      const points: Point[] = [
        { x: 400, y: 300 },   // center
        { x: 0, y: 0 },       // top-left
        { x: 800, y: 600 },   // bottom-right
        { x: 100, y: 200 },   // arbitrary
      ];

      for (const p of points) {
        const doc = vp.clientToDoc(p.x, p.y, rect);
        const back = vp.docToClient(doc.x, doc.y, rect);
        expect(back.x, `roundtrip x for (${p.x}, ${p.y})`).toBeCloseTo(p.x, 9);
        expect(back.y, `roundtrip y for (${p.x}, ${p.y})`).toBeCloseTo(p.y, 9);
      }
    });

    it('docToClient(clientToDoc(p)) === p for various points', () => {
      const vp = new Viewport(100, 200, 2.0, 800, 600);
      const rect = makeRect(0, 0, 800, 600);
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 50, y: 100 },
        { x: -200, y: 300 },
        { x: 1000, y: -50 },
      ];

      for (const p of points) {
        const client = vp.docToClient(p.x, p.y, rect);
        const back = vp.clientToDoc(client.x, client.y, rect);
        expect(back.x, `roundtrip x for doc (${p.x}, ${p.y})`).toBeCloseTo(p.x, 9);
        expect(back.y, `roundtrip y for doc (${p.x}, ${p.y})`).toBeCloseTo(p.y, 9);
      }
    });

    it('roundtrip is exact inverse at non-1.0 zoom', () => {
      const vp = new Viewport(-500, 300, 0.5, 1024, 768);
      const rect = makeRect(0, 0, 1024, 768);
      const doc = { x: 124, y: 456 };
      const client = vp.docToClient(doc.x, doc.y, rect);
      const back = vp.clientToDoc(client.x, client.y, rect);
      expect(back.x).toBeCloseTo(doc.x, 9);
      expect(back.y).toBeCloseTo(doc.y, 9);
    });
  });

  describe('fromRect zoom-to-fit', () => {
    it('fits a single shape with 10% padding by default', () => {
      const bounds = { x: 0, y: 0, width: 100, height: 100 };
      const vp = Viewport.fromRect(bounds, 1000, 1000);

      // With 10% padding, the padded dimension is 100 * 1.2 = 120
      // zoom = min(1000/120, 1000/120) = 8.333...
      // The shape center is at (50, 50)
      // panX = 50 - (1000/2)/zoom = 50 - 60 = -10
      // panY = 50 - (1000/2)/zoom = 50 - 60 = -10
      expect(vp.zoom).toBeCloseTo(1000 / 120, 5);
      expect(vp.panX).toBeCloseTo(-10, 5);
      expect(vp.panY).toBeCloseTo(-10, 5);
    });

    it('uses smaller zoom when one axis is constraining', () => {
      // Wide shape — height is the constraint
      const bounds = { x: 0, y: 0, width: 1000, height: 100 };
      const vp = Viewport.fromRect(bounds, 1000, 1000);
      // padded: 1000*1.2=1200, 100*1.2=120
      // zoom = min(1000/1200, 1000/120) = min(0.833, 8.333) = 0.833
      expect(vp.zoom).toBeCloseTo(1000 / 1200, 5);
    });

    it('respects custom padding fraction', () => {
      const bounds = { x: 0, y: 0, width: 100, height: 100 };
      const vp = Viewport.fromRect(bounds, 1000, 1000, 0.2);
      // padded: 100 * 1.4 = 140
      expect(vp.zoom).toBeCloseTo(1000 / 140, 5);
    });

    it('returns default viewport for degenerate bounds', () => {
      const vp1 = Viewport.fromRect({ x: 0, y: 0, width: 0, height: 100 }, 800, 600);
      expect(vp1.zoom).toBe(1.0);
      expect(vp1.panX).toBe(0);
      expect(vp1.panY).toBe(0);

      const vp2 = Viewport.fromRect({ x: 0, y: 0, width: 100, height: -5 }, 800, 600);
      expect(vp2.zoom).toBe(1.0);
    });

    it('centers the bounds in the viewer', () => {
      const bounds = { x: 50, y: 50, width: 100, height: 100 };
      const vp = Viewport.fromRect(bounds, 800, 600);
      // Center of bounds is (100, 100)
      // padded: 100 * 1.2 = 120 on each axis
      // zoom = min(800/120, 600/120) = min(6.666, 5) = 5  (height is constraining)
      // panX = 100 - (800/2)/5 = 100 - 80 = 20
      // panY = 100 - (600/2)/5 = 100 - 60 = 40
      expect(vp.panX).toBeCloseTo(20, 5);
      expect(vp.panY).toBeCloseTo(40, 5);
    });
  });

  describe('withZoom cursor-centered', () => {
    it('preserves the document point under the cursor after zoom', () => {
      const vp = new Viewport(0, 0, 1.0, 800, 600);
      const rect = makeRect(0, 0, 800, 600);

      // Point at cursor (200, 300) in client space
      const cursorX = 200;
      const cursorY = 300;

      // Zoom from 1.0 to 2.0 centered on cursor
      const newVp = vp.withZoom(2.0, cursorX, cursorY, rect);

      // The document point under the cursor should be the same
      const docBefore = vp.clientToDoc(cursorX, cursorY, rect);
      const docAfter = newVp.clientToDoc(cursorX, cursorY, rect);

      expect(docAfter.x).toBeCloseTo(docBefore.x, 9);
      expect(docAfter.y).toBeCloseTo(docBefore.y, 9);
    });

    it('zooming twice in a row preserves the latest cursor point', () => {
      const vp = new Viewport(0, 0, 1.0, 800, 600);
      const rect = makeRect(0, 0, 800, 600);
      const cursor = { x: 400, y: 300 };

      const vp2 = vp.withZoom(2.0, cursor.x, cursor.y, rect);
      const vp3 = vp2.withZoom(0.5, cursor.x, cursor.y, rect);

      const docBefore = vp.clientToDoc(cursor.x, cursor.y, rect);
      const docAfter = vp3.clientToDoc(cursor.x, cursor.y, rect);

      expect(docAfter.x).toBeCloseTo(docBefore.x, 9);
      expect(docAfter.y).toBeCloseTo(docBefore.y, 9);
    });

    it('clamps zoom during withZoom', () => {
      const vp = new Viewport(0, 0, 1.0, 800, 600);
      const rect = makeRect();

      // Try to zoom way out (should clamp to MIN)
      const vpMin = vp.withZoom(0.01, 400, 300, rect);
      expect(vpMin.zoom).toBeCloseTo(MIN_ZOOM, 5);

      // Try to zoom way in (should clamp to MAX)
      const vpMax = vp.withZoom(100, 400, 300, rect);
      expect(vpMax.zoom).toBeCloseTo(MAX_ZOOM, 5);
    });
  });

  describe('withPan', () => {
    it('returns a new Viewport with updated pan', () => {
      const vp = new Viewport(0, 0, 1.0, 800, 600);
      const vp2 = vp.withPan(100, 200);
      expect(vp2.panX).toBe(100);
      expect(vp2.panY).toBe(200);
      expect(vp2.zoom).toBe(1.0);
      expect(vp2.width).toBe(800);
      expect(vp2.height).toBe(600);
    });

    it('does not mutate the original', () => {
      const vp = new Viewport(0, 0, 1.0, 800, 600);
      vp.withPan(100, 200);
      expect(vp.panX).toBe(0);
      expect(vp.panY).toBe(0);
    });
  });

  describe('withSize', () => {
    it('returns a new Viewport with updated dimensions', () => {
      const vp = new Viewport(50, 60, 2.0, 800, 600);
      const vp2 = vp.withSize(1600, 1200);
      expect(vp2.width).toBe(1600);
      expect(vp2.height).toBe(1200);
      expect(vp2.panX).toBe(50);
      expect(vp2.panY).toBe(60);
      expect(vp2.zoom).toBe(2.0);
    });
  });

  describe('applyToSvgElement', () => {
    it('sets viewBox correctly at zoom 1.0', () => {
      const vp = new Viewport(0, 0, 1.0, 800, 600);
      const svg = { setAttribute: vi.fn() } as unknown as SVGSVGElement;
      vp.applyToSvgElement(svg);
      expect(svg.setAttribute).toHaveBeenCalledWith('viewBox', '0 0 800 600');
    });

    it('sets viewBox correctly at zoom 2.0', () => {
      const vp = new Viewport(10, 20, 2.0, 800, 600);
      const svg = { setAttribute: vi.fn() } as unknown as SVGSVGElement;
      vp.applyToSvgElement(svg);
      // viewW = 800/2 = 400, viewH = 600/2 = 300
      expect(svg.setAttribute).toHaveBeenCalledWith('viewBox', '10 20 400 300');
    });

    it('sets viewBox correctly at zoom 0.5', () => {
      const vp = new Viewport(-100, -50, 0.5, 800, 600);
      const svg = { setAttribute: vi.fn() } as unknown as SVGSVGElement;
      vp.applyToSvgElement(svg);
      // viewW = 800/0.5 = 1600, viewH = 600/0.5 = 1200
      expect(svg.setAttribute).toHaveBeenCalledWith('viewBox', '-100 -50 1600 1200');
    });
  });

  describe('fromInitial', () => {
    it('returns viewport at origin with zoom 1.0', () => {
      const vp = Viewport.fromInitial(1024, 768);
      expect(vp.panX).toBe(0);
      expect(vp.panY).toBe(0);
      expect(vp.zoom).toBe(1.0);
      expect(vp.width).toBe(1024);
      expect(vp.height).toBe(768);
    });
  });

  describe('clampZoom', () => {
    it('returns NaN input as 1.0', () => {
      expect(clampZoom(NaN)).toBe(1.0);
    });

    it('clamps values below MIN_ZOOM', () => {
      expect(clampZoom(0.01)).toBeCloseTo(MIN_ZOOM, 5);
      expect(clampZoom(-5)).toBeCloseTo(MIN_ZOOM, 5);
    });

    it('clamps values above MAX_ZOOM', () => {
      expect(clampZoom(50)).toBeCloseTo(MAX_ZOOM, 5);
      expect(clampZoom(Infinity)).toBeCloseTo(MAX_ZOOM, 5);
    });

    it('passes through values in range', () => {
      expect(clampZoom(1.0)).toBe(1.0);
      expect(clampZoom(0.5)).toBe(0.5);
      expect(clampZoom(5.0)).toBe(5.0);
    });
  });

  describe('Zoom range boundaries', () => {
    it('MIN_ZOOM = 0.1', () => {
      expect(MIN_ZOOM).toBe(0.1);
    });

    it('MAX_ZOOM = 10.0', () => {
      expect(MAX_ZOOM).toBe(10.0);
    });
  });
});
