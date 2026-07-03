/**
 * move-resize-modifiers-move-016.spec.ts — MOVE-016 insert-space/move-area.
 *
 * Implements MOVE-016 from the draw.io parity catalog:
 *   - Alt+Ctrl+Shift+drag in empty area: translate all shapes whose bounds
 *     intersect the rect swept by the drag by the drag delta.
 *
 * Reference:
 *   - docs/drawio-user-interaction-workflows.md → MOVE-016
 *   - docs/ROADMAP.md → Gaps Restantes — Post-IP-G (P0 → v0.104.0)
 */
import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady } from './helpers/app-ready.js';

const SIMPLE_RECT_PATH = fixturePath('simple-rect.drawio');

test.describe('MOVE-016: insert-space / move-area (Alt+Ctrl+Shift+drag)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  /** Add a Rectangle vertex at exact SVG (doc-space) coordinates via the
   *  editor's debug API. */
  async function addRectAt(
    page: import('@playwright/test').Page,
    svgX: number,
    svgY: number,
    width: number,
    height: number,
  ): Promise<void> {
    await page.evaluate(
      ({ svgX, svgY, width, height }) => {
        const w = window as unknown as {
          __hodeiDebug?: {
            addRectAt?: (x: number, y: number, w: number, h: number) => unknown;
          };
        };
        w.__hodeiDebug?.addRectAt?.(svgX, svgY, width, height);
      },
      { svgX, svgY, width, height },
    );
    await page.waitForTimeout(150);
  }

  /** Read all shape bounds and selection state from the DOM. */
  async function readShapes(
    page: import('@playwright/test').Page,
  ): Promise<
    Array<{ x: number; y: number; w: number; h: number; selected: boolean }>
  > {
    return page.evaluate(() => {
      const els = document.querySelectorAll(
        '[data-testid="viewer"] [data-vertex-id]',
      );
      return Array.from(els).map((e) => ({
        x: parseFloat(e.getAttribute('x') ?? '0'),
        y: parseFloat(e.getAttribute('y') ?? '0'),
        w: parseFloat(e.getAttribute('width') ?? '0'),
        h: parseFloat(e.getAttribute('height') ?? '0'),
        selected: e.classList.contains('selected'),
      }));
    });
  }

  test('Alt+Ctrl+Shift+drag translates shapes intersected by the swept rect', async ({ page }) => {
    // simple-rect fixture has rect 0 at SVG (0, 0, 80, 40). Add rect 1 at
    // (200, 0, 80, 40). A drag in the empty gap between them (SVG
    // 100, 0)–(150, 0) with a small vertical extent to clear the 5-unit
    // threshold) should move BOTH rects (because the rect covers from
    // 100 to 150 horizontally, intersecting rect 0's right=80? Actually
    // 100 > 80 means it does NOT intersect rect 0). Let me design a drag
    // that intersects both: SVG (60, 0)–(220, 0) clears the gap and
    // crosses both rects (rect 0 right=80 vs marquee right=220, rect 1
    // left=200 vs marquee left=60).
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg');
    await addRectAt(page, 200, 0, 80, 40);
    await page.waitForTimeout(150);

    const transform = await page.evaluate(() => {
      const svg = document.querySelector(
        '[data-testid="viewer"] svg',
      ) as SVGSVGElement | null;
      if (!svg) return null;
      const vb = svg.viewBox.baseVal;
      const bb = svg.getBoundingClientRect();
      return {
        bbX: bb.left,
        bbY: bb.top,
        bbW: bb.width,
        bbH: bb.height,
        vbX: vb.x,
        vbY: vb.y,
        vbW: vb.width,
        vbH: vb.height,
      };
    });
    if (!transform) throw new Error('viewer not found');
    const scaleX = transform.bbW / transform.vbW;
    const scaleY = transform.bbH / transform.vbH;
    const docToCss = (x: number, y: number) => ({
      x: transform.bbX + (x - transform.vbX) * scaleX,
      y: transform.bbY + (y - transform.vbY) * scaleY,
    });
    // Drag from SVG (0, 0) to (280, 0) so the swept rect covers BOTH rects
    // (rect 0 at x=0..80, rect 1 at x=200..280). The drag starts in empty
    // area to the left of rect 0 (above the viewBox, since viewBox y=0
    // and the bg rect covers y=0..40 fully). Hmm, the start at (0, 0) is
    // on rect 0. Let me start in the empty gap (90, 0)–(190, 0) which
    // covers BOTH rects' edges. Actually, no: gap is 80..200. Marquee
    // (60, 0)–(220, 0) covers rect 0's right (0..80) — 0+80 > 60, so
    // they do NOT intersect under contain but DO under intersect.
    // For MOVE-016 we use intersect, so rect 0 IS in (60, 0, 160, 40)?
    // 0 < 60+160=220 ✓, 0+80=80 > 60 ✓, 0 < 0+40=40 ✓, 40 > 0 ✓ → yes.
    // Rect 1: 200 < 220, 280 > 60, 0 < 40, 40 > 0 → yes. So both rects are
    // intersected. But the start (60, 0) is on rect 0. Start in the gap
    // (95, 0) so the click is on empty area, and drag to (190, 0). That
    // gives a swept rect (95, 0)–(190, 0) which crosses rect 1 (x=200
    // > 190, so NO) but does not include rect 0 (x=80 < 95, so rect 0 is
    // OUT of the swept area). Hmm.
    // Easier: drag in the gap (100, 0)–(200, 0). Swept rect (100, 0,
    // 100, 40) crosses rect 1's left edge (200 vs 200 = touch) but does
    // NOT cross rect 0 (80 vs 100 = no). So only rect 1 moved. But my
    // test expects both — let me use a wider span (90, 0)–(220, 0).
    // Swept rect (90, 0, 130, 40) covers rect 0 (right=80 < 90? no, 80
    // < 90, so rect 0 right is left of the marquee start). Hmm.
    // OK simplest: start ABOVE rect 0 (so the click isn't on it), drag
    // across the full width. The click point at docY=18 (above rect 0's
    // y=0..40 — wait, rect 0 IS at y=0..40, so docY=18 is on rect 0).
    // Hmm. The rects span the entire viewBox height.
    //
    // Cleanest: start at doc (95, 0) (in the empty gap) and drag to
    // doc (185, 0). That covers rect 1 (covers its left edge 200 vs
    // marquee right 185? 200 > 185, so NOT covered). Ugh.
    //
    // Final approach: make the swept rect BIG enough to cover at least
    // rect 1 fully. Start at doc (-10, 0) (off the viewBox to the left)
    // — but e.target is the SVG and we need empty area, so start at the
    // leftmost point in the empty area inside the viewBox. The empty
    // area starts at x=80 (rect 0 right) and goes to x=200 (rect 1 left).
    // Use a Y that doesn't touch the rects... but rects span y=0..40
    // (the whole viewBox). So no empty area in Y.
    //
    // OK, settle for a drag that covers rect 1 (the more distant shape).
    // Drag from (95, 0) to (210, 0). Swept rect (95, 0, 115, 40).
    // Rect 0 (0, 0, 80, 40): 80 < 95? Yes. No intersect. Rect 1 (200, 0, 80,
    // 40): 200 < 210 ✓, 280 > 95 ✓, 0 < 40 ✓, 40 > 0 ✓ → intersect.
    // Result: only rect 1 moves. Updated assertion: only rect 1 moved.
    const from = docToCss(95, 18);
    const to = docToCss(210, 22);

    // Alt+Ctrl+Shift+drag.
    await page.keyboard.down('Alt');
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, {
      steps: 4,
    });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');
    await page.keyboard.up('Alt');
    await page.waitForTimeout(200);

    // After the move, only rect 1 should be translated. Original (0, 0)
    // and (200, 0). With dx=115, dy=4 in doc units, rect 1 is at (315, 4)
    // and rect 0 is still at (0, 0).
    const after = await readShapes(page);
    after.sort((a, b) => a.x - b.x);
    const expectedDx = 115;
    const expectedDy = 4;
    expect(after).toHaveLength(2);
    // rect 0: untouched
    expect(after[0]!.x).toBeCloseTo(0, 0);
    expect(after[0]!.y).toBeCloseTo(0, 0);
    // rect 1: translated
    expect(after[1]!.x).toBeCloseTo(200 + expectedDx, 0);
    expect(after[1]!.y).toBeCloseTo(0 + expectedDy, 0);
  });
});
