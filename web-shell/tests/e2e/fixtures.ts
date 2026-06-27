/**
 * fixtures.ts — Resolve test fixture paths relative to the test file.
 *
 * All E2E tests must use this helper to load fixture files (drawio
 * diagrams, stencil XML, etc.). The previous code hardcoded absolute
 * paths like `/var/home/rubentxu/.../fixtures/foo.drawio`, which
 * broke for any other developer machine or CI runner.
 *
 * Usage:
 *
 * ```ts
 * import { fixturePath, testFixturePath } from './fixtures.js';
 *
 * const DRAWIO = fixturePath('simple-rect.drawio');
 * const STENCIL = testFixturePath('custom-stencil.xml');
 * await page.setInputFiles('[data-testid="file-input"]', DRAWIO);
 * ```
 *
 * Both helpers resolve from this file's directory — never from cwd —
 * so the result is portable across machines and CI runners.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// tests/e2e/fixtures.ts → web-shell/public/fixtures (served by Vite)
const PUBLIC_FIXTURES_DIR = path.resolve(__dirname, '..', '..', 'public', 'fixtures');

// tests/e2e/fixtures.ts → web-shell/tests/fixtures (test-only fixtures, not served)
const TEST_FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');

function safeResolve(base: string, name: string, label: string): string {
  const resolved = path.resolve(base, name);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error(`${label}: '${name}' resolves outside ${base}`);
  }
  return resolved;
}

/**
 * Resolve a fixture file path relative to web-shell/public/fixtures.
 * These are user-facing fixtures (sample drawio diagrams) that Vite
 * also serves at `/fixtures/<name>`.
 */
export function fixturePath(name: string): string {
  return safeResolve(PUBLIC_FIXTURES_DIR, name, 'fixturePath');
}

/**
 * Resolve a fixture file path relative to web-shell/tests/fixtures.
 * These are test-only fixtures (e.g. custom stencil XML used by
 * load-stencil-library tests) — NOT served by Vite.
 */
export function testFixturePath(name: string): string {
  return safeResolve(TEST_FIXTURES_DIR, name, 'testFixturePath');
}
