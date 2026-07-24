import { describe, it, expect, vi } from 'vitest';
import { DiagramEngineSession } from './session.js';

// Mock WasmModule for testing
function makeMockWasm(overrides?: Partial<{
  memory: WebAssembly.Memory;
  write_scene_to_buffer: () => number;
  get_scene_buffer_ptr: () => number;
  write_svg_to_buffer: () => number;
  get_svg_buffer_ptr: () => number;
}>): unknown {
  return {
    create_engine: () => 42,
    dispose_engine: vi.fn(),
    execute_command: vi.fn(),
    execute_transaction: vi.fn(),
    get_scene: () => '{"pages":[]}',
    render_svg: () => '<svg></svg>',
    render_pages: () => '[]',
    ...overrides,
  };
}

describe('DiagramEngineSession memory and buffer getters', () => {
  describe('getWasmMemoryBytes', () => {
    it('returns 0 when WASM has no memory', () => {
      const wasm = makeMockWasm() as Parameters<typeof DiagramEngineSession.create>[0];
      const result = DiagramEngineSession.create(wasm);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const session = result.value;
      expect(session.getWasmMemoryBytes()).toBe(0);
      session.dispose();
    });

    it('returns positive multiple of 65536 when WASM has memory', () => {
      // Create a mock memory with a 2-page buffer (2 * 65536 = 131072 bytes)
      const memory = {
        buffer: { byteLength: 131072 },
      } as WebAssembly.Memory;
      const wasm = makeMockWasm({ memory }) as Parameters<typeof DiagramEngineSession.create>[0];
      const result = DiagramEngineSession.create(wasm);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const session = result.value;
      const bytes = session.getWasmMemoryBytes();
      expect(bytes).toBe(131072);
      expect(bytes % 65536).toBe(0);
      session.dispose();
    });
  });

  describe('getSceneBufferBytes', () => {
    it('returns null before first writeSceneBuffer', () => {
      const wasm = makeMockWasm() as Parameters<typeof DiagramEngineSession.create>[0];
      const result = DiagramEngineSession.create(wasm);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const session = result.value;
      expect(session.getSceneBufferBytes()).toBeNull();
      session.dispose();
    });

    it('returns null when writeSceneBuffer returns len=0', () => {
      const wasm = makeMockWasm({
        write_scene_to_buffer: () => 0,
        get_scene_buffer_ptr: () => 0,
      }) as Parameters<typeof DiagramEngineSession.create>[0];
      const result = DiagramEngineSession.create(wasm);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const session = result.value;
      const r = session.writeSceneBuffer();
      expect(r.ok).toBe(true);
      expect(session.getSceneBufferBytes()).toBeNull();
      session.dispose();
    });
  });

  describe('getSvgBufferBytes', () => {
    it('returns null before first writeSvgBuffer', () => {
      const wasm = makeMockWasm() as Parameters<typeof DiagramEngineSession.create>[0];
      const result = DiagramEngineSession.create(wasm);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const session = result.value;
      expect(session.getSvgBufferBytes()).toBeNull();
      session.dispose();
    });
  });
});
