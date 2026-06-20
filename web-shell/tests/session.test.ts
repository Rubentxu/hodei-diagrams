import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiagramEngineSession } from '../src/session.js';
import type { PageToken } from '../src/types.js';

function createMockWasm() {
  return {
    create_engine: vi.fn(),
    dispose_engine: vi.fn(),
    execute_command: vi.fn(),
    get_scene: vi.fn(),
    render_svg: vi.fn(),
    render_pages: vi.fn(),
    import_drawio: vi.fn(),
    export_drawio: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    engine_can_undo: vi.fn(),
    engine_can_redo: vi.fn(),
    connect_vertices: vi.fn(),
    disconnect_edge: vi.fn(),
  };
}

describe('DiagramEngineSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('create returns ok with active session on valid handle', () => {
    const mockWasm = createMockWasm();
    mockWasm.create_engine.mockReturnValue(42);

    const result = DiagramEngineSession.create(
      mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isActive).toBe(true);
    }
  });

  it('create returns err when wasm.create_engine throws', () => {
    const mockWasm = createMockWasm();
    mockWasm.create_engine.mockImplementation(() => {
      throw new Error('TooManyEngines');
    });

    const result = DiagramEngineSession.create(
      mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('TooManyEngines');
    }
  });

  it('dispose calls wasm.dispose_engine and marks session inactive', () => {
    const mockWasm = createMockWasm();
    mockWasm.create_engine.mockReturnValue(42);

    const result = DiagramEngineSession.create(
      mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
    );
    if (!result.ok) throw new Error('create failed');
    const session = result.value;

    session.dispose();

    expect(mockWasm.dispose_engine).toHaveBeenCalledOnce();
    expect(mockWasm.dispose_engine).toHaveBeenCalledWith(42);
    expect(session.isActive).toBe(false);
  });

  it('dispose is idempotent (second call is no-op)', () => {
    const mockWasm = createMockWasm();
    mockWasm.create_engine.mockReturnValue(42);

    const result = DiagramEngineSession.create(
      mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
    );
    if (!result.ok) throw new Error('create failed');
    const session = result.value;

    session.dispose();
    session.dispose();

    expect(mockWasm.dispose_engine).toHaveBeenCalledOnce();
  });

  it('importDrawio on disposed session returns Disposed error without calling wasm', () => {
    const mockWasm = createMockWasm();
    mockWasm.create_engine.mockReturnValue(42);

    const result = DiagramEngineSession.create(
      mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
    );
    if (!result.ok) throw new Error('create failed');
    const session = result.value;
    session.dispose();

    const importResult = session.importDrawio('<?xml?>');

    expect(importResult.ok).toBe(false);
    if (!importResult.ok) {
      expect(importResult.error).toBe('Disposed: Engine session was disposed');
    }
    expect(mockWasm.import_drawio).not.toHaveBeenCalled();
  });

  it('importDrawio on active session returns ok and forwards XML', () => {
    const mockWasm = createMockWasm();
    mockWasm.create_engine.mockReturnValue(42);
    mockWasm.import_drawio.mockReturnValue(undefined);

    const result = DiagramEngineSession.create(
      mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
    );
    if (!result.ok) throw new Error('create failed');
    const session = result.value;

    const importResult = session.importDrawio('<?xml?><diagram></diagram>');

    expect(importResult.ok).toBe(true);
    expect(mockWasm.import_drawio).toHaveBeenCalledWith(42, '<?xml?><diagram></diagram>');
  });

  it('importDrawio propagates ImportFailed error string from wasm', () => {
    const mockWasm = createMockWasm();
    mockWasm.create_engine.mockReturnValue(42);
    mockWasm.import_drawio.mockImplementation(() => {
      throw new Error('ImportFailed: parse: malformed XML');
    });

    const result = DiagramEngineSession.create(
      mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
    );
    if (!result.ok) throw new Error('create failed');
    const session = result.value;

    const importResult = session.importDrawio('<not-valid>');

    expect(importResult.ok).toBe(false);
    if (!importResult.ok) {
      expect(importResult.error).toContain('ImportFailed');
    }
  });

  it('renderAllPages parses JSON and returns PageRender array', () => {
    const mockWasm = createMockWasm();
    mockWasm.create_engine.mockReturnValue(42);
    mockWasm.render_pages.mockReturnValue('[{"page_id":1,"svg":"<svg><rect/></svg>"}]');

    const result = DiagramEngineSession.create(
      mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
    );
    if (!result.ok) throw new Error('create failed');
    const session = result.value;

    const renderResult = session.renderAllPages();

    expect(renderResult.ok).toBe(true);
    if (renderResult.ok) {
      expect(renderResult.value.length).toBe(1);
      expect(renderResult.value[0]!.pageId).toBe(1);
      expect(renderResult.value[0]!.svg).toBe('<svg><rect/></svg>');
    }
  });

  it('renderAllPages returns err on malformed JSON', () => {
    const mockWasm = createMockWasm();
    mockWasm.create_engine.mockReturnValue(42);
    mockWasm.render_pages.mockReturnValue('not-json');

    const result = DiagramEngineSession.create(
      mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
    );
    if (!result.ok) throw new Error('create failed');
    const session = result.value;

    const renderResult = session.renderAllPages();

    expect(renderResult.ok).toBe(false);
    if (!renderResult.ok) {
      expect(renderResult.error).toContain('RenderFailed: parse:');
    }
  });

  it('renderAllPages returns err on unexpected shape (not array)', () => {
    const mockWasm = createMockWasm();
    mockWasm.create_engine.mockReturnValue(42);
    mockWasm.render_pages.mockReturnValue('{"page_id":1}');

    const result = DiagramEngineSession.create(
      mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
    );
    if (!result.ok) throw new Error('create failed');
    const session = result.value;

    const renderResult = session.renderAllPages();

    expect(renderResult.ok).toBe(false);
    if (!renderResult.ok) {
      expect(renderResult.error).toContain('unexpected shape');
    }
  });

  it('renderAllPages populates cache; getPage returns cached SVG without wasm call', () => {
    const mockWasm = createMockWasm();
    mockWasm.create_engine.mockReturnValue(42);
    mockWasm.render_pages.mockReturnValue(
      '[{"page_id":1,"svg":"<svg>page1</svg>"},{"page_id":2,"svg":"<svg>page2</svg>"}]',
    );

    const result = DiagramEngineSession.create(
      mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
    );
    if (!result.ok) throw new Error('create failed');
    const session = result.value;

    session.renderAllPages();
    const svg = session.getPage(1 as PageToken);

    expect(svg).toBe('<svg>page1</svg>');
    expect(mockWasm.render_pages).toHaveBeenCalledTimes(1);
  });

  it('getPage returns null for unknown token', () => {
    const mockWasm = createMockWasm();
    mockWasm.create_engine.mockReturnValue(42);
    mockWasm.render_pages.mockReturnValue('[{"page_id":1,"svg":"<svg>page1</svg>"}]');

    const result = DiagramEngineSession.create(
      mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
    );
    if (!result.ok) throw new Error('create failed');
    const session = result.value;

    session.renderAllPages();
    const svg = session.getPage(999 as PageToken);

    expect(svg).toBeNull();
  });

  it('categorizeError maps known prefixes', () => {
    const mockWasm = createMockWasm();
    mockWasm.create_engine.mockReturnValue(42);

    const result = DiagramEngineSession.create(
      mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
    );
    if (!result.ok) throw new Error('create failed');
    const session = result.value;

    expect(session.categorizeError('ImportFailed: parse: oops').kind).toBe('ImportFailed');
    expect(session.categorizeError('InvalidCommand: bad json').kind).toBe('InvalidCommand');
    expect(session.categorizeError('InvalidHandle').kind).toBe('InvalidHandle');
    expect(session.categorizeError('PageNotFound: 42').kind).toBe('PageNotFound');
    expect(session.categorizeError('TooManyEngines').kind).toBe('TooManyEngines');
    expect(session.categorizeError('SomeOtherError').kind).toBe('Unknown');
  });
});
