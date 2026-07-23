import { describe, it, expect, vi } from 'vitest';
import { sceneBounds, sceneGeometry, SHAPE_KEYS, EDGE_KEYS, findEdgeVariant, CellGeometry, clientToDoc } from '../src/scene-bounds.js';
import type { SlotmapId, ScenePage } from '../src/types.js';

function makeSlotmapId(idx: number, version = 1): SlotmapId {
  return { idx, version };
}

function makeRectPage(verts: Array<{ id: SlotmapId; x: number; y: number; w: number; h: number }>): ScenePage {
  return {
    page_id: { idx: 1, version: 1 },
    name: 'Page 1',
    width: 800,
    height: 600,
    display_list: verts.map((v) => ({
      Rect: {
        id: { idx: v.id.idx, version: v.id.version },
        bounds: {
          origin: { x: v.x, y: v.y },
          size: { width: v.w, height: v.h },
        },
      },
    })),
  };
}

function makeEllipseWithRotationPage(
  id: SlotmapId,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
  flip_h: boolean,
  flip_v: boolean,
): ScenePage {
  return {
    page_id: { idx: 1, version: 1 },
    name: 'Page 1',
    width: 800,
    height: 600,
    display_list: [
      {
        Ellipse: {
          id: { idx: id.idx, version: id.version },
          bounds: {
            origin: { x, y },
            size: { width: w, height: h },
          },
          rotation,
          flip_h,
          flip_v,
        },
      },
    ],
  };
}

function makeGroupPage(id: SlotmapId, x: number, y: number, w: number, h: number): ScenePage {
  return {
    page_id: { idx: 1, version: 1 },
    name: 'Page 1',
    width: 800,
    height: 600,
    display_list: [
      {
        Group: {
          id: { idx: id.idx, version: id.version },
          bounds: {
            origin: { x, y },
            size: { width: w, height: h },
          },
        },
      },
    ],
  };
}

function makePageWithMissingBounds(id: SlotmapId): ScenePage {
  return {
    page_id: { idx: 1, version: 1 },
    name: 'Page 1',
    width: 800,
    height: 600,
    display_list: [
      {
        Rect: {
          id: { idx: id.idx, version: id.version },
          // bounds missing
        },
      },
    ],
  };
}

describe('sceneBounds', () => {
  it('returns {x,y,width,height} for a Rect', () => {
    const id = makeSlotmapId(5);
    const page = makeRectPage([{ id, x: 10, y: 20, w: 100, h: 50 }]);
    const result = sceneBounds([page], id);
    expect(result).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  // ── Group regression: pre-refactor, overlays returned null for Group ───────

  it('returns non-null bounds for a Group variant (Group regression)', () => {
    const id = makeSlotmapId(7);
    const page = makeGroupPage(id, 50, 60, 200, 150);
    const result = sceneBounds([page], id);
    expect(result).not.toBeNull();
    expect(result).toEqual({ x: 50, y: 60, width: 200, height: 150 });
  });

  it('returns null for an id not present in any page display_list', () => {
    const page = makeRectPage([{ id: makeSlotmapId(1), x: 0, y: 0, w: 10, h: 10 }]);
    const result = sceneBounds([page], makeSlotmapId(999));
    expect(result).toBeNull();
  });

  it('returns null when bounds.origin is missing', () => {
    const id = makeSlotmapId(3);
    const page = makePageWithMissingBounds(id);
    const result = sceneBounds([page], id);
    expect(result).toBeNull();
  });

  it('returns bounds across multi-page ScenePage[]', () => {
    const id = makeSlotmapId(9);
    const page1: ScenePage = { page_id: { idx: 1, version: 1 }, name: 'P1', width: 800, height: 600, display_list: [] };
    const page2: ScenePage = { page_id: { idx: 2, version: 1 }, name: 'P2', width: 800, height: 600, display_list: [] };
    const page3 = makeRectPage([{ id, x: 33, y: 44, w: 120, h: 80 }]);
    const result = sceneBounds([page1, page2, page3], id);
    expect(result).toEqual({ x: 33, y: 44, width: 120, height: 80 });
  });
});

describe('sceneGeometry', () => {
  it('returns full 8-field CellGeometry for an Ellipse with rotation and flip', () => {
    const id = makeSlotmapId(11);
    const page = makeEllipseWithRotationPage(id, 5, 10, 80, 40, 0.5, true, false);
    const result = sceneGeometry([page], id);
    expect(result).not.toBeNull();
    const r = result as CellGeometry;
    expect(r.x).toBe(5);
    expect(r.y).toBe(10);
    expect(r.width).toBe(80);
    expect(r.height).toBe(40);
    expect(r.rotation).toBe(0.5);
    expect(r.flip_h).toBe(true);
    expect(r.flip_v).toBe(false);
    expect(r.relative).toBe(false);
  });

  it('returns null for an id not found', () => {
    const page = makeEllipseWithRotationPage(makeSlotmapId(2), 0, 0, 10, 10, 0, false, false);
    const result = sceneGeometry([page], makeSlotmapId(999));
    expect(result).toBeNull();
  });

  it('returns null for a variant with missing bounds', () => {
    const id = makeSlotmapId(6);
    const page = makePageWithMissingBounds(id);
    const result = sceneGeometry([page], id);
    expect(result).toBeNull();
  });

  it('fills in default values for missing optional fields', () => {
    const id = makeSlotmapId(20);
    const page = {
      page_id: { idx: 1, version: 1 },
      name: 'P1',
      width: 800,
      height: 600,
      display_list: [
        {
          Rect: {
            id: { idx: id.idx, version: id.version },
            bounds: {
              origin: { x: 0, y: 0 },
              size: { width: 50, height: 50 },
              // rotation, flip_h, flip_v absent
            },
          },
        },
      ],
    };
    const result = sceneGeometry([page], id);
    expect(result?.rotation).toBe(0);
    expect(result?.flip_h).toBe(false);
    expect(result?.flip_v).toBe(false);
  });
});

describe('SHAPE_KEYS', () => {
  it("includes 'Group' (fixes the latent bug where overlays omitted Group)", () => {
    expect(SHAPE_KEYS).toContain('Group');
  });

  it('has 12 entries matching Editor.#SHAPE_KEYS', () => {
    expect(SHAPE_KEYS).toHaveLength(12);
  });
});

describe('EDGE_KEYS', () => {
  it("includes 'Line' and 'Path'", () => {
    expect(EDGE_KEYS).toContain('Line');
    expect(EDGE_KEYS).toContain('Path');
  });

  it('has exactly 2 entries', () => {
    expect(EDGE_KEYS).toHaveLength(2);
  });
});

// Helper functions for edge tests

function makeLinePage(sourceId: SlotmapId, targetId: SlotmapId): ScenePage {
  return {
    page_id: { idx: 1, version: 1 },
    name: 'Page 1',
    width: 800,
    height: 600,
    display_list: [
      {
        Line: {
          id: { idx: 100, version: 1 },
          source: { Vertex: { idx: sourceId.idx, version: sourceId.version } },
          target: { Vertex: { idx: targetId.idx, version: targetId.version } },
        },
      },
    ],
  };
}

function makePathPage(edgeId: SlotmapId, sourceId: SlotmapId, targetId: SlotmapId): ScenePage {
  return {
    page_id: { idx: 1, version: 1 },
    name: 'Page 1',
    width: 800,
    height: 600,
    display_list: [
      {
        Path: {
          id: { idx: edgeId.idx, version: edgeId.version },
          source: { Vertex: { idx: sourceId.idx, version: sourceId.version } },
          target: { Vertex: { idx: targetId.idx, version: targetId.version } },
        },
      },
    ],
  };
}

describe('findEdgeVariant', () => {
  it('returns the variant record for a Line edge', () => {
    const sourceId = makeSlotmapId(1);
    const targetId = makeSlotmapId(2);
    const edgeId = { idx: 100, version: 1 };
    const page = makeLinePage(sourceId, targetId);
    const result = findEdgeVariant([page], edgeId);
    expect(result).not.toBeNull();
    // result IS the Line object (e[key]), verified by id match
    const line = result as Record<string, unknown>;
    expect(line['id']).toEqual({ idx: 100, version: 1 });
    expect(line).toHaveProperty('source');
    expect(line).toHaveProperty('target');
  });

  it('returns the variant record for a Path edge', () => {
    const sourceId = makeSlotmapId(3);
    const targetId = makeSlotmapId(4);
    const edgeId = { idx: 200, version: 1 };
    const page = makePathPage(edgeId, sourceId, targetId);
    const result = findEdgeVariant([page], edgeId);
    expect(result).not.toBeNull();
    // result IS the Path object (e[key]), verified by id match
    const path = result as Record<string, unknown>;
    expect(path['id']).toEqual({ idx: 200, version: 1 });
    expect(path).toHaveProperty('source');
    expect(path).toHaveProperty('target');
  });

  it('returns null for an edgeId not present in any page', () => {
    const sourceId = makeSlotmapId(1);
    const targetId = makeSlotmapId(2);
    const page = makeLinePage(sourceId, targetId);
    const result = findEdgeVariant([page], { idx: 999, version: 1 });
    expect(result).toBeNull();
  });

  it('returns the correct edge when multiple edges exist (filters by edge keys, not shape keys)', () => {
    const sourceId1 = makeSlotmapId(1);
    const targetId1 = makeSlotmapId(2);
    const sourceId2 = makeSlotmapId(3);
    const targetId2 = makeSlotmapId(4);
    const edgeId1 = { idx: 100, version: 1 };
    const edgeId2 = { idx: 200, version: 1 };
    const page1 = makePathPage(edgeId1, sourceId1, targetId1);
    const page2 = makePathPage(edgeId2, sourceId2, targetId2);
    const result = findEdgeVariant([page1, page2], edgeId2);
    expect(result).not.toBeNull();
    // result IS the Path object
    const path = result as Record<string, unknown>;
    expect(path['id']).toEqual({ idx: 200, version: 1 });
  });

  it('does NOT match a shape variant with the same idx/version as an edge (filters by EDGE_KEYS only)', () => {
    // Create a page with both a Rect and a Line that happen to share the same id
    const sharedId = { idx: 50, version: 1 };
    const page: ScenePage = {
      page_id: { idx: 1, version: 1 },
      name: 'Page 1',
      width: 800,
      height: 600,
      display_list: [
        {
          Rect: {
            id: { idx: sharedId.idx, version: sharedId.version },
            bounds: {
              origin: { x: 0, y: 0 },
              size: { width: 100, height: 100 },
            },
          },
        },
        {
          Line: {
            id: { idx: sharedId.idx, version: sharedId.version },
            source: { Vertex: { idx: 1, version: 1 } },
            target: { Vertex: { idx: 2, version: 1 } },
          },
        },
      ],
    };
    const result = findEdgeVariant([page], sharedId);
    // findEdgeVariant returns the Line object directly (not a container with 'Line' key)
    expect(result).not.toBeNull();
    const line = result as Record<string, unknown>;
    expect(line['id']).toEqual({ idx: 50, version: 1 });
    expect(line).toHaveProperty('source');
    expect(line).toHaveProperty('target');
  });
});

// ─── clientToDoc tests ─────────────────────────────────────────────────────────

describe('clientToDoc', () => {
  /**
   * CD-001: zero origin viewBox — result must be byte-identical to the editor's
   * existing #clientToDoc for viewBox="0 0 W H" (all current fixtures).
   * Simulates: viewer at viewport (0,0), SVG viewBox="0 0 400 300",
   * SVG rect same size as viewer, no zoom CSS transform.
   * clientX=100, clientY=60 → doc (100, 60)
   */
  it('CD-001: zero origin viewBox returns client-offset scaled by viewBox ratio', () => {
    const viewer = document.createElement('div');
    viewer.style.position = 'absolute';
    viewer.style.left = '0px';
    viewer.style.top = '0px';
    viewer.style.width = '400px';
    viewer.style.height = '300px';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 400 300');
    svg.style.width = '400px';
    svg.style.height = '300px';
    // getBoundingClientRect for SVG: 0,0,400,300
    Object.defineProperty(svg, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 400, height: 300 }),
    });
    viewer.appendChild(svg);

    // Mock getZoom to return 1 (no CSS transform)
    vi.stubGlobal('getComputedStyle', () => ({ transform: '' }));

    const result = clientToDoc(viewer, 100, 60);
    expect(result.x).toBeCloseTo(100, 5);
    expect(result.y).toBeCloseTo(60, 5);
  });

  /**
   * CD-002: non-zero origin viewBox — math must correctly subtract the viewBox
   * origin. viewBox="100 200 800 600", client at SVG-relative (0,0) → doc (100, 200).
   * This is the critical regression test: the naive (clientX-rect.left)/zoom formula
   * would give (0-0)/scale = 0, but the correct answer is 100.
   */
  it('CD-002: non-zero origin viewBox subtracts viewBox origin from coordinates', () => {
    const viewer = document.createElement('div');
    viewer.style.position = 'absolute';
    viewer.style.left = '50px';
    viewer.style.top = '50px';
    viewer.style.width = '800px';
    viewer.style.height = '600px';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    // viewBox origin is (100, 200) — not zero
    svg.setAttribute('viewBox', '100 200 800 600');
    svg.style.width = '800px';
    svg.style.height = '600px';
    // SVG rect: left=50, top=50, width=800, height=600
    // viewBox width/height = 800/800=1, 600/600=1 (uniform scale)
    Object.defineProperty(svg, 'getBoundingClientRect', {
      value: () => ({ left: 50, top: 50, width: 800, height: 600 }),
    });
    viewer.appendChild(svg);

    vi.stubGlobal('getComputedStyle', () => ({ transform: '' }));

    // Client at SVG-relative (0,0) means clientX=50, clientY=50
    // Correct: x = 100 + (50-50)*1 = 100, y = 200 + (50-50)*1 = 200
    const result = clientToDoc(viewer, 50, 50);
    expect(result.x).toBeCloseTo(100, 5);
    expect(result.y).toBeCloseTo(200, 5);
  });

  /**
   * CD-003: no SVG — falls back to zoom-only math using viewer rect.
   * Simulates a viewer without an embedded SVG (e.g., during initial render).
   */
  it('CD-003: no SVG falls back to zoom-only math with viewer rect', () => {
    const viewer = document.createElement('div');
    viewer.style.position = 'absolute';
    viewer.style.left = '0px';
    viewer.style.top = '0px';
    viewer.style.width = '400px';
    viewer.style.height = '300px';
    viewer.style.transform = 'scale(2)'; // 2x zoom

    Object.defineProperty(viewer, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 400, height: 300 }),
    });

    // getZoom reads style.transform → returns 2
    const zoomResult = clientToDoc(viewer, 100, 60);
    // Fallback: x = (100-0)/2 = 50, y = (60-0)/2 = 30
    expect(zoomResult.x).toBeCloseTo(50, 5);
    expect(zoomResult.y).toBeCloseTo(30, 5);
  });
});
