/**
 * perf-baseline.spec.ts — Phase 2 baseline measurements.
 *
 * Measures concrete render timings in the live browser so we have
 * numbers (ms) to drive optimization work, not guesses.
 *
 *   - small.fetch          time to fetch the 224-byte fixture over HTTP
 *   - small.import_drawio  wasm import_drawio (parse + domain map)
 *   - small.get_scene      wasm get_scene returning the live scene JSON
 *   - small.render_page_0  wasm render_svg(page_idx=0) for the small model
 *   - small.exec_cmd       wasm execute_command(AddVertex) on the small model
 *   - small.mut_*          re-measure after the mutation (cache invalidation check)
 *
 *   - large.fetch         3.9MB aws-admision.drawio fetch
 *   - large.import_drawio  parse + map + replace_model on 3.9MB
 *   - large.get_scene      scene JSON for the large model
 *   - large.render_pages_total  render_svg summed across all pages
 *
 * The browser console is the artifact. Test status (`passed`) just
 * asserts the session API is reachable; the substantive result is the
 * table of timings printed to stdout.
 */
import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT = fixturePath('simple-rect.drawio');
const AWS_ADMISION = fixturePath('aws-admision.drawio');

type PerfSession = {
  importDrawio(xml: string): { ok: boolean };
  executeCommand(cmdJson: string): { ok: boolean };
  // getScene returns Result<ScenePage[]> — value is the array directly
  getScene(): { ok: boolean; value?: unknown[]; error?: unknown };
  renderPage(pageIdx: number): { ok: boolean; value?: string };
  renderAllPages(): { ok: boolean; value?: unknown[] };
};

type Measurement = { label: string; ms: number };

declare global {
  interface Window {
    __perf: Measurement[];
  }
}

test.describe('Phase 2 — perf baseline', () => {
  test('full render pipeline timings (small + large fixture)', async ({ page }) => {
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
      return await page.evaluate(async () => {
        const log = (label: string, ms: number) => {
          const m: Measurement = { label, ms };
          (window as unknown as { __perf: Measurement[] }).__perf.push(m);
          console.log(`[perf] ${label} ${ms.toFixed(2)}ms`);
        };
        const t = () => performance.now();

        // ── SMALL FIXTURE (1 vertex, 224 bytes) ────────────────────────────
        const r1 = await fetch('/fixtures/simple-rect.drawio');
        const smallXml = await r1.text();
        log('small.fetch', t() - 0);

        const session = (window as unknown as {
          __hodeiDebug: { getSession: () => PerfSession };
        }).__hodeiDebug.getSession();

        // Initial getScene — engine on a fresh page is empty
        const t0 = t();
        const init = session.getScene();
        const t1 = t();
        const initPages = init.ok && init.value ? (init.value as unknown[]).length : 0;
        log(`small.initial_get_scene (pages=${initPages})`, t1 - t0);

        // importDrawio (parse + domain map + replace model)
        const t2 = t();
        session.importDrawio(smallXml);
        const t3 = t();
        log('small.import_drawio', t3 - t2);

        // getScene (now populated)
        const t4 = t();
        session.getScene();
        const t5 = t();
        log('small.get_scene', t5 - t4);

        // renderPage: in production the editor passes `page_id.idx` (slotmap key).
        // We must mirror that — `renderPage(0)` here would be wrong.
        const scenesAfterImport = (session.getScene().ok && session.getScene().value
          ? (session.getScene().value as unknown[])
          : []) as { page_id: { idx: number } }[];
        const page0SlotmapIdx = scenesAfterImport[0]?.page_id.idx ?? 0;

        const t6 = t();
        const svgR = session.renderPage(page0SlotmapIdx);
        const t7 = t();
        const svgStr = svgR.ok && svgR.value ? svgR.value : '(no svg)';
        log(
          `small.render_page_0 (svgBytes=${svgStr.length})`,
          t7 - t6,
        );
        if (svgR.ok && svgR.value) {
          console.log(`[perf] small.svg-preview: ${svgR.value.slice(0, 200)}`);
        }

        // Execute a single AddVertex command
        const t8 = t();
        const cmd = JSON.stringify({
          AddVertex: {
            vertex: {
              geometry: { x: 100, y: 100, width: 80, height: 40, relative: false },
              label: { text: 'perf-test-vertex' },
              page_id: { idx: 1, version: 1 },
              parent: null,
              style_id: null,
            },
          },
        });
        session.executeCommand(cmd);
        const t9 = t();
        log('small.exec_cmd_add_vertex', t9 - t8);

        // Re-measure getScene + render after mutation (cache invalidation)
        const t10 = t();
        session.getScene();
        const t11 = t();
        log('small.mutation_get_scene', t11 - t10);

        const t12 = t();
        session.renderPage(0);
        const t13 = t();
        log('small.mutation_render_page', t13 - t12);

        // ── LARGE FIXTURE (aws-admision.drawio, 3.9MB) ────────────────────
        const r2 = await fetch('/fixtures/aws-admision.drawio');
        const largeXml = await r2.text();
        log(`large.fetch (bytes=${largeXml.length})`, t() - 0);

        const t20 = t();
        session.importDrawio(largeXml);
        const t21 = t();
        log('large.import_drawio', t21 - t20);

        const t22 = t();
        const sc = session.getScene();
        const t23 = t();
        const pageArr = sc.ok && sc.value ? (sc.value as unknown[]) : [];
        const pageCount = pageArr.length;
        // Diagnostic: print page_id of each page so we know what flat idx to pass
        console.log(`[perf] large.page_ids: ${JSON.stringify(
          pageArr.slice(0, 3).map((p) => (p as { page_id: { idx: number } }).page_id),
        )}`);
        log(`large.get_scene (pages=${pageCount})`, t23 - t22);

        const t24 = t();
        let totalSvgBytes = 0;
        for (let i = 0; i < pageCount; i++) {
          // Use the actual slotmap idx from the page, not the array position
          const pageSlotmapIdx = (pageArr[i] as { page_id: { idx: number } }).page_id.idx;
          const r = session.renderPage(pageSlotmapIdx);
          if (r.ok && r.value) {
            totalSvgBytes += r.value.length;
            if (i === 0) console.log(`[perf] large.svg-preview[0]: ${r.value.slice(0, 200)}`);
          } else {
            console.log(
              `[perf] large.render_pages[${i}] error=${String(
                (r as { error?: unknown }).error,
              )}`,
            );
          }
        }
        const t25 = t();
        log(
          `large.render_pages_total (pages=${pageCount}, totalSvgBytes=${totalSvgBytes})`,
          t25 - t24,
        );

        return (window as unknown as { __perf: Measurement[] }).__perf;
      });
    };

    const measurements = await runTimings();
    expect(measurements.length).toBeGreaterThanOrEqual(10);

    // Pretty-print the table for the artifact
    console.log('\n[perf] === PHASE 2 BASELINE (ms) ===');
    const maxLabel = Math.max(...measurements.map((m) => m.label.length));
    for (const m of measurements) {
      console.log(
        `[perf]   ${m.label.padEnd(maxLabel + 2)} ${m.ms.toFixed(2).padStart(8)} ms`,
      );
    }
  });

  test('fixture sizes SSoT report', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const resp = await fetch('/fixtures/simple-rect.drawio');
    const xml = await resp.text();
    const resp2 = await fetch('/fixtures/aws-admision.drawio');
    const xml2 = await resp2.text();
    process.stdout.write(
      `[perf] fixtures: simple-rect=${xml.length}B, aws-admision=${xml2.length}B\n`,
    );
    expect(xml2.length).toBeGreaterThan(1_000_000); // >= 1MB sanity
  });
});
