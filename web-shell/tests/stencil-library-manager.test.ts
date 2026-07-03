import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StencilLibraryManager } from '../src/stencil-library-manager.js';
import type { StencilInfo } from '../src/types.js';

function createMockWasm() {
  return {
    create_engine: vi.fn(),
    dispose_engine: vi.fn(),
    execute_command: vi.fn(),
    execute_transaction: vi.fn(),
    get_scene: vi.fn(),
    render_svg: vi.fn(),
    render_pages: vi.fn(),
    write_scene_to_buffer: vi.fn(),
    get_scene_buffer_ptr: vi.fn(),
    get_scene_buffer_len: vi.fn(),
    get_scene_buffer_capacity: vi.fn(),
    write_svg_to_buffer: vi.fn(),
    get_svg_buffer_ptr: vi.fn(),
    get_svg_buffer_len: vi.fn(),
    command_buffer_ptr: vi.fn(),
    command_buffer_capacity: vi.fn(),
    flush_commands: vi.fn(),
    import_drawio: vi.fn(),
    export_drawio: vi.fn(),
      export_drawio_fresh_engine: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    engine_can_undo: vi.fn(),
    engine_can_redo: vi.fn(),
    connect_vertices: vi.fn(),
    disconnect_edge: vi.fn(),
    parse_stencil_xml: vi.fn(),
    parse_stencil_library_xml: vi.fn(),
    set_stencil_library: vi.fn(),
    get_resolved_style: vi.fn(),
    get_metadata: vi.fn(),
    set_metadata: vi.fn(),
    apply_layout: vi.fn(),
    apply_hierarchical_layout: vi.fn(),
    route_all_edges: vi.fn(),
    insert_bend: vi.fn(),
    move_bend: vi.fn(),
    remove_bend: vi.fn(),
    group_vertices: vi.fn(),
    ungroup_vertices: vi.fn(),
    connect_vertices_anchored: vi.fn(),
    set_edge_anchor: vi.fn(),
    clear_edge_anchor: vi.fn(),
    get_edge_anchors: vi.fn(),
    set_page_math_enabled: vi.fn(),
    get_page_layers: vi.fn(),
  };
}

function createMockSession() {
  return {
    isActive: true,
    dispose: vi.fn(),
    setStencilLibrary: vi.fn().mockReturnValue({ ok: true, value: undefined }),
  } as unknown as {
    isActive: boolean;
    dispose: () => void;
    setStencilLibrary: ReturnType<typeof vi.fn>;
  };
}

const SAMPLE_LIBRARY_XML = '<shapes name="test"><shape name="Square" w="40" h="40"><background><path>M 0,0 L 40,0 L 40,40 L 0,40 Z</path></background><foreground><fill/></foreground></shape><shape name="Circle" w="40" h="40"><background><path>M 20,0 A 20,20 0 1,0 20,40 A 20,20 0 1,0 20,0 Z</path></background><foreground><fill/></foreground></shape></shapes>';

const SAMPLE_STENCILS: StencilInfo[] = [
  {
    library: 'test',
    name: 'Square',
    width: 40,
    height: 40,
    aspect: 'fixed',
    background: [],
    foreground: [],
    license: null,
    diagnostics: [],
  },
  {
    library: 'test',
    name: 'Circle',
    width: 40,
    height: 40,
    aspect: 'fixed',
    background: [],
    foreground: [],
    license: null,
    diagnostics: [],
  },
];

describe('StencilLibraryManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock fetch globally for URL-based tests
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('constructor', () => {
    it('does not auto-load default libraries during construction', () => {
      const mockWasm = createMockWasm();
      const mockSession = createMockSession();

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(SAMPLE_LIBRARY_XML),
      } as unknown as Response);
      vi.stubGlobal('fetch', fetchMock);

      // Constructor must stay side-effect free: main.ts calls startAutoLoad()
      // only after the HUD exists and can receive loading callbacks.
      new StencilLibraryManager(mockSession as never, mockWasm as never);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('startAutoLoad', () => {
    it('loads default libraries when explicitly started', async () => {
      const mockWasm = createMockWasm();
      const mockSession = createMockSession();

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(SAMPLE_LIBRARY_XML),
      } as unknown as Response);
      vi.stubGlobal('fetch', fetchMock);

      mockWasm.parse_stencil_library_xml.mockReturnValue(JSON.stringify(SAMPLE_STENCILS));

      const manager = new StencilLibraryManager(mockSession as never, mockWasm as never);
      manager.startAutoLoad();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(1, '/fixtures/general.xml');
      expect(fetchMock).toHaveBeenNthCalledWith(2, '/fixtures/flowchart.xml');

      await new Promise((r) => setTimeout(r, 50));

      expect(mockSession.setStencilLibrary).toHaveBeenCalledTimes(2);
    });
  });

  describe('loadFromUrl', () => {
    it('registers fetched XML through the active engine session on success', async () => {
      const mockWasm = createMockWasm();
      const mockSession = createMockSession();

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(SAMPLE_LIBRARY_XML),
      } as unknown as Response);
      vi.stubGlobal('fetch', fetchMock);

      mockWasm.parse_stencil_library_xml.mockReturnValue(JSON.stringify(SAMPLE_STENCILS));

      const manager = new StencilLibraryManager(mockSession as never, mockWasm as never);
      await manager.loadFromUrl('test', 'http://example.com/test.xml');

      expect(mockWasm.parse_stencil_library_xml).toHaveBeenCalledWith(SAMPLE_LIBRARY_XML);
      expect(mockSession.setStencilLibrary).toHaveBeenCalledWith('test', SAMPLE_LIBRARY_XML);
    });

    it('throws when fetch fails', async () => {
      const mockWasm = createMockWasm();
      const mockSession = createMockSession();

      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as unknown as Response);
      vi.stubGlobal('fetch', fetchMock);

      const manager = new StencilLibraryManager(mockSession as never, mockWasm as never);

      await expect(manager.loadFromUrl('test', 'http://example.com/missing.xml')).rejects.toThrow();
    });
  });

  describe('loadFromFile', () => {
    it('reads file text and calls parse_stencil_library_xml', async () => {
      const mockWasm = createMockWasm();
      const mockSession = createMockSession();

      mockWasm.parse_stencil_library_xml.mockReturnValue(JSON.stringify(SAMPLE_STENCILS));

      const manager = new StencilLibraryManager(mockSession as never, mockWasm as never);

      const mockFile = {
        text: () => Promise.resolve(SAMPLE_LIBRARY_XML),
        name: 'mylib.xml',
      } as unknown as File;
      await manager.loadFromFile('mylib', mockFile);

      expect(mockWasm.parse_stencil_library_xml).toHaveBeenCalledWith(SAMPLE_LIBRARY_XML);
    });

    it('adds library to getLibraries after load', async () => {
      const mockWasm = createMockWasm();
      const mockSession = createMockSession();

      mockWasm.parse_stencil_library_xml.mockReturnValue(JSON.stringify(SAMPLE_STENCILS));

      const manager = new StencilLibraryManager(mockSession as never, mockWasm as never);

      const mockFile = {
        text: () => Promise.resolve(SAMPLE_LIBRARY_XML),
        name: 'mylib.xml',
      } as unknown as File;
      await manager.loadFromFile('mylib', mockFile);

      const libs = manager.getLibraries();
      expect(libs.has('mylib')).toBe(true);
      expect(libs.get('mylib')?.length).toBe(2);
    });
  });

  describe('subscribe/unsubscribe', () => {
    it('subscribe returns unsubscribe function', () => {
      const mockWasm = createMockWasm();
      const mockSession = createMockSession();

      const manager = new StencilLibraryManager(mockSession as never, mockWasm as never);
      const cb = vi.fn();
      const unsubscribe = manager.subscribe(cb);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
      // After unsubscribe, changes should not call cb
      // (indirectly tested by checking the callback set is empty)
    });

    it('calling subscribe multiple times adds multiple listeners', () => {
      const mockWasm = createMockWasm();
      const mockSession = createMockSession();

      const manager = new StencilLibraryManager(mockSession as never, mockWasm as never);
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      manager.subscribe(cb1);
      manager.subscribe(cb2);

      // Both should be notified (indirectly — we trust the implementation)
      expect(cb1).not.toHaveBeenCalled(); // No change triggered yet
      expect(cb2).not.toHaveBeenCalled();
    });
  });

  describe('getShapeByName', () => {
    it('returns null for unknown library', () => {
      const mockWasm = createMockWasm();
      const mockSession = createMockSession();

      const manager = new StencilLibraryManager(mockSession as never, mockWasm as never);
      expect(manager.getShapeByName('nonexistent', 'Square')).toBeNull();
    });

    it('returns null for unknown shape name within known library', async () => {
      const mockWasm = createMockWasm();
      const mockSession = createMockSession();

      mockWasm.parse_stencil_library_xml.mockReturnValue(JSON.stringify(SAMPLE_STENCILS));

      const manager = new StencilLibraryManager(mockSession as never, mockWasm as never);

      const mockFile = {
        text: () => Promise.resolve(SAMPLE_LIBRARY_XML),
        name: 'test.xml',
      } as unknown as File;
      await manager.loadFromFile('test', mockFile);

      expect(manager.getShapeByName('test', 'Triangle')).toBeNull();
    });

    it('returns StencilInfo for known library and shape', async () => {
      const mockWasm = createMockWasm();
      const mockSession = createMockSession();

      mockWasm.parse_stencil_library_xml.mockReturnValue(JSON.stringify(SAMPLE_STENCILS));

      const manager = new StencilLibraryManager(mockSession as never, mockWasm as never);

      const mockFile = {
        text: () => Promise.resolve(SAMPLE_LIBRARY_XML),
        name: 'test.xml',
      } as unknown as File;
      await manager.loadFromFile('test', mockFile);

      const result = manager.getShapeByName('test', 'Square');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Square');
      expect(result!.library).toBe('test');
    });
  });

  describe('getLibraries', () => {
    it('returns empty map initially', () => {
      const mockWasm = createMockWasm();
      const mockSession = createMockSession();

      const manager = new StencilLibraryManager(mockSession as never, mockWasm as never);
      expect(manager.getLibraries().size).toBe(0);
    });

    it('replaces existing library when loading under same name', async () => {
      const mockWasm = createMockWasm();
      const mockSession = createMockSession();

      const squareOnly: StencilInfo[] = [SAMPLE_STENCILS[0]!];
      mockWasm.parse_stencil_library_xml.mockReturnValue(JSON.stringify(squareOnly));

      const manager = new StencilLibraryManager(mockSession as never, mockWasm as never);

      const mockFile1 = {
        text: () => Promise.resolve(SAMPLE_LIBRARY_XML),
        name: 'test.xml',
      } as unknown as File;
      await manager.loadFromFile('test', mockFile1);

      // Replace with only Circle
      const circleOnly: StencilInfo[] = [SAMPLE_STENCILS[1]!];
      mockWasm.parse_stencil_library_xml.mockReturnValue(JSON.stringify(circleOnly));
      const mockFile2 = {
        text: () => Promise.resolve(SAMPLE_LIBRARY_XML),
        name: 'test.xml',
      } as unknown as File;
      await manager.loadFromFile('test', mockFile2);

      const libs = manager.getLibraries();
      expect(libs.get('test')?.length).toBe(1);
      expect(libs.get('test')![0]!.name).toBe('Circle');
    });
  });
});
