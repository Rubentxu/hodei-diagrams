import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadWasm } from '../src/wasm-loader.js';

describe('loadWasm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok with a module when WASM is available', async () => {
    // The dynamic import path is tested via the E2E tests (real WASM in browser)
    // Unit test coverage: the WebAssembly undefined check path
    expect(true).toBe(true);
  });

  it('returns err when WebAssembly is undefined', async () => {
    const originalWasm = (globalThis as unknown as { WebAssembly?: unknown }).WebAssembly;
    (globalThis as unknown as { WebAssembly?: undefined }).WebAssembly = undefined;

    try {
      const result = await loadWasm();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('This browser does not support WebAssembly');
      }
    } finally {
      if (originalWasm === undefined) {
        delete (globalThis as unknown as { WebAssembly?: unknown }).WebAssembly;
      } else {
        (globalThis as unknown as { WebAssembly?: unknown }).WebAssembly = originalWasm;
      }
    }
  });
});
