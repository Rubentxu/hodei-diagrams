/**
 * perf-scale.spec.ts — Phase 4 scale performance measurements.
 *
 * Measures render pipeline timings at 1k / 5k / 10k shape counts to
 * determine whether SVG/DOM remains viable at scale or WebGPU/WebGL
 * is warranted for the target use case.
 *
 * Pipeline stages measured:
 *   - fetch          HTTP fetch of the fixture XML
 *   - import_drawio  WASM parse + domain map + replace model
 *   - get_scene      WASM get_scene returning the live scene JSON
 *   - render_page_0  WASM render_svg(page_idx=0) for the first page
 *   - render_all_pages_total  summed render time across all pages
 *
 * The browser console is the artifact. Test status (`passed`) just
 * asserts the session API is reachable; the substantive result is the
 * table of timings printed to stdout.
 */
import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';

type PerfSession = {
  importDrawio(xml: string): { ok: boolean };
  executeCommand(cmdJson: string): { ok: boolean };
  getScene(): { ok: boolean; value?: unknown[]; error?: unknown };
  decodeSceneBuffer(): { ok: boolean; value?: unknown[]; error?: unknown };
  renderPage(pageIdx: number): { ok: boolean; value?: string };
  renderAllPages(): { ok: boolean; value?: unknown[] };
  writeSceneBuffer(): { ok: boolean; value?: { ptr: number; len: number }; error?: unknown };
  readSceneBuffer(): Uint8Array;
  writeSvgBuffer(pageIdx: number): { ok: boolean; value?: { ptr: number; len: number }; error?: unknown };
  readSvgBuffer(pageIdx: number): Uint8Array;
};

type Measurement = { label: string; ms: number };

declare global {
  interface Window {
    __perf: Measurement[];
  }
}

const SCALE_FIXTURES = [
  { name: 'large-1k', count: 1000 },
  { name: 'large-5k', count: 5000 },
  { name: 'large-10k', count: 10000 },
];

test.describe('Phase 4 — scale performance', () => {
  test('render performance at 1k / 5k / 10k shapes', async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'log' && msg.text().startsWith('[perf]')) {
        process.stdout.write(`\n${msg.text()}\n`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      (window as unknown as { __perf: Measurement[] }).__perf = [];
    });

    const runTimings = async (): Promise<Measurement[]> => {
      return await page.evaluate(async (fixtures: { name: string; count: number }[]) => {
        const log = (label: string, ms: number) => {
          const m: Measurement = { label, ms };
          (window as unknown as { __perf: Measurement[] }).__perf.push(m);
          console.log(`[perf] ${label} ${ms.toFixed(2)}ms`);
        };
        const t = () => performance.now();

        const session = (window as unknown as {
          __hodeiDebug: { getSession: () => PerfSession };
        }).__hodeiDebug.getSession();

        for (const fix of fixtures) {
          const label = fix.name; // e.g. "large-1k"
          const count = fix.count;

          // Fetch fixture
          const r = await fetch(`/fixtures/${label}.drawio`);
          const xml = await r.text();
          const xmlBytes = xml.length;

          // import_drawio (parse + domain map + replace model)
          const t0 = t();
          session.importDrawio(xml);
          const t1 = t();
          log(`scale.${label}.import_drawio`, t1 - t0);

          // get_scene
          const t2 = t();
          const sc = session.getScene();
          const t3 = t();
          const pageArr = sc.ok && sc.value ? (sc.value as unknown[]) : [];
          const pageCount = pageArr.length;
          log(`scale.${label}.get_scene (pages=${pageCount})`, t3 - t2);

          // render_page_0 (first page only, for comparison across scales)
          if (pageArr.length > 0) {
            const firstPage = pageArr[0] as { page_id: { idx: number } };
            const pageSlotmapIdx = firstPage.page_id.idx;

            const t4 = t();
            const svgR = session.renderPage(pageSlotmapIdx);
            const t5 = t();
            const svgStr = svgR.ok && svgR.value ? svgR.value : '';
            log(
              `scale.${label}.render_page_0 (svgBytes=${svgStr.length})`,
              t5 - t4,
            );
          }

          // render_all_pages_total (full pipeline cost)
          const t6 = t();
          let totalSvgBytes = 0;
          for (let i = 0; i < pageCount; i++) {
            const pageSlotmapIdx = (pageArr[i] as { page_id: { idx: number } }).page_id.idx;
            const r2 = session.renderPage(pageSlotmapIdx);
            if (r2.ok && r2.value) {
              totalSvgBytes += r2.value.length;
            }
          }
          const t7 = t();
          log(
            `scale.${label}.render_all_pages_total (pages=${pageCount}, totalSvgBytes=${totalSvgBytes})`,
            t7 - t6,
          );

          // Diagnostic: xml size + shape count
          console.log(
            `[perf] scale.${label}: xmlBytes=${xmlBytes}, shapes=${count}, pages=${pageCount}`,
          );
        }

        return (window as unknown as { __perf: Measurement[] }).__perf;
      }, SCALE_FIXTURES);
    };

    const measurements = await runTimings();
    expect(measurements.length).toBeGreaterThanOrEqual(SCALE_FIXTURES.length * 3);

    // Pretty-print the table for the artifact
    console.log('\n[perf] === PHASE 4 SCALE RESULTS (ms) ===');
    const maxLabel = Math.max(...measurements.map((m) => m.label.length));
    for (const m of measurements) {
      const slow = m.ms > 5000 ? '  <<< SLOW' : '';
      console.log(
        `[perf]   ${m.label.padEnd(maxLabel + 2)} ${m.ms.toFixed(2).padStart(8)} ms${slow}`,
      );
    }
  });

  test('fixture sizes sanity', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    for (const fix of SCALE_FIXTURES) {
      const resp = await page.request.get(`/fixtures/${fix.name}.drawio`);
      const xml = await resp.text();
      const sizeKB = xml.length / 1024;
      process.stdout.write(
        `[perf] fixture: ${fix.name}=${xml.length}B (${sizeKB.toFixed(1)} KB), expected_shapes=${fix.count}\n`,
      );
      // Sanity: file should be non-empty and size should scale roughly with shape count
      expect(xml.length).toBeGreaterThan(1000);
    }
  });
});
