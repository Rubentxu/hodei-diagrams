/**
 * stencil-loader.ts — TypeScript loader for draw.io stencil XML libraries.
 *
 * Fetches .xml stencil files, parses them via the WASM engine's
 * `parse_stencil_library_xml`, and returns typed `StencilInfo` descriptors
 * suitable for populating a shape palette.
 */

import type { StencilInfo, WasmModule } from './types.js';
import { ok, err } from './types.js';

export type { StencilInfo, StencilDiagnostic, PathCommand } from './types.js';

/** Result of loading a stencil library. */
export type StencilLoadResult =
  | { ok: true; stencils: StencilInfo[] }
  | { ok: false; error: string };

function okStencil(value: StencilInfo[]): StencilLoadResult {
  return { ok: true, stencils: value };
}

function errStencil(error: string): StencilLoadResult {
  return { ok: false, error };
}

/**
 * Load a stencil library from a URL.
 *
 * Fetches the XML, delegates parsing to the WASM engine via
 * `parse_stencil_library_xml`, and returns an array of `StencilInfo` — one per
 * `<shape>` element found in the document.
 */
export async function loadStencilLibrary(
  wasm: WasmModule,
  url: string,
): Promise<StencilLoadResult> {
  let xml: string;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      return errStencil(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`);
    }
    xml = await resp.text();
  } catch (e) {
    return errStencil(`Network error loading stencil library: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const json = wasm.parse_stencil_library_xml(xml);
    const stencils: StencilInfo[] = JSON.parse(json);
    return okStencil(stencils);
  } catch (e) {
    return errStencil(`Failed to parse stencil library: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Load and parse a single stencil from inline XML.
 *
 * This is useful for testing and for cases where the stencil XML is
 * already available in the page (e.g., embedded via a build step).
 */
export function parseStencilXml(
  wasm: WasmModule,
  xml: string,
): StencilInfo {
  const json = wasm.parse_stencil_xml(xml);
  return JSON.parse(json) as StencilInfo;
}

/**
 * Fetch a stencil XML file from a URL and parse it.
 *
 * Returns a `StencilInfo` on success.
 */
export async function fetchAndParseStencil(
  wasm: WasmModule,
  url: string,
): Promise<StencilInfo> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch stencil: ${resp.status} ${resp.statusText}`);
  }
  const xml = await resp.text();
  return parseStencilXml(wasm, xml);
}
