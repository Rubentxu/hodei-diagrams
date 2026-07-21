import { describe, it, expect } from 'vitest';
import { sceneBounds, sceneGeometry, SHAPE_KEYS, CellGeometry } from '../src/scene-bounds.js';
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
