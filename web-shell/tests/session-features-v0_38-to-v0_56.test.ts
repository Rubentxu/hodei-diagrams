import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiagramEngineSession } from '../src/session.js';
import type { SlotmapId } from '../src/types.js';

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
    // v0.38 layout methods
    apply_layout: vi.fn(),
    apply_hierarchical_layout: vi.fn(),
    // v0.39-v0.43, v0.50 routing methods
    route_all_edges: vi.fn(),
    insert_bend: vi.fn(),
    move_bend: vi.fn(),
    remove_bend: vi.fn(),
    // v0.44 group methods
    group_vertices: vi.fn(),
    ungroup_vertices: vi.fn(),
    // v0.56-v0.65 anchored edges + math
    connect_vertices_anchored: vi.fn(),
    set_edge_anchor: vi.fn(),
    clear_edge_anchor: vi.fn(),
    get_edge_anchors: vi.fn(),
    set_page_math_enabled: vi.fn(),
    get_page_layers: vi.fn(),
    resolve_selection: vi.fn(),
    select_target: vi.fn(),
    clear_selection: vi.fn(),
    get_selection: vi.fn(),
  };
}

const makeId = (idx: number, version = 0): SlotmapId => ({ idx, version });

function createSession(mockWasm: ReturnType<typeof createMockWasm>): DiagramEngineSession {
  mockWasm.create_engine.mockReturnValue(42);
  const result = DiagramEngineSession.create(
    mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
  );
  if (!result.ok) throw new Error('create failed');
  return result.value;
}

describe('Session: layout features v0.38', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('applyLayout', () => {
    it('calls wasm.apply_layout with handle and JSON-serialized kind and config', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);

      session.applyLayout('Hierarchical', { spacing: 42 });

      expect(mockWasm.apply_layout).toHaveBeenCalledOnce();
      expect(mockWasm.apply_layout).toHaveBeenCalledWith(42, '"Hierarchical"', '{"spacing":42}');
    });

    it('returns ok on success', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);

      const result = session.applyLayout('Organic');

      expect(result.ok).toBe(true);
    });

    it('returns err when wasm.apply_layout throws', () => {
      const mockWasm = createMockWasm();
      mockWasm.apply_layout.mockImplementation(() => {
        throw new Error('LayoutFailed: no page');
      });
      const session = createSession(mockWasm);

      const result = session.applyLayout('Tree');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('LayoutFailed: no page');
      }
    });

    it('returns Disposed error when session is disposed', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);
      session.dispose();

      const result = session.applyLayout('Tree');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Disposed: Engine session was disposed');
      }
      expect(mockWasm.apply_layout).not.toHaveBeenCalled();
    });

    it('defaults config to empty object when not provided', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);

      session.applyLayout('Tree');

      expect(mockWasm.apply_layout).toHaveBeenCalledWith(42, '"Tree"', '{}');
    });
  });

  describe('applyHierarchicalLayout', () => {
    it('calls wasm.apply_hierarchical_layout with handle and JSON-serialized config', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);

      session.applyHierarchicalLayout({ direction: 'south' });

      expect(mockWasm.apply_hierarchical_layout).toHaveBeenCalledOnce();
      expect(mockWasm.apply_hierarchical_layout).toHaveBeenCalledWith(42, '{"direction":"south"}');
    });

    it('returns ok on success', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);

      const result = session.applyHierarchicalLayout();

      expect(result.ok).toBe(true);
    });

    it('returns err when wasm.apply_hierarchical_layout throws', () => {
      const mockWasm = createMockWasm();
      mockWasm.apply_hierarchical_layout.mockImplementation(() => {
        throw new Error('HierarchicalLayoutFailed: empty graph');
      });
      const session = createSession(mockWasm);

      const result = session.applyHierarchicalLayout();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('HierarchicalLayoutFailed: empty graph');
      }
    });

    it('returns Disposed error when session is disposed', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);
      session.dispose();

      const result = session.applyHierarchicalLayout();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Disposed: Engine session was disposed');
      }
      expect(mockWasm.apply_hierarchical_layout).not.toHaveBeenCalled();
    });

    it('defaults config to empty object when not provided', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);

      session.applyHierarchicalLayout();

      expect(mockWasm.apply_hierarchical_layout).toHaveBeenCalledWith(42, '{}');
    });
  });
});

describe('Session: routing features v0.39-v0.43, v0.50-v0.53', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('routeAllEdges', () => {
    it('calls wasm.route_all_edges with handle', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);

      session.routeAllEdges();

      expect(mockWasm.route_all_edges).toHaveBeenCalledOnce();
      expect(mockWasm.route_all_edges).toHaveBeenCalledWith(42);
    });

    it('returns ok on success', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);

      const result = session.routeAllEdges();

      expect(result.ok).toBe(true);
    });

    it('returns err when wasm.route_all_edges throws', () => {
      const mockWasm = createMockWasm();
      mockWasm.route_all_edges.mockImplementation(() => {
        throw new Error('RouteFailed: no page');
      });
      const session = createSession(mockWasm);

      const result = session.routeAllEdges();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('RouteFailed: no page');
      }
    });

    it('returns Disposed error when session is disposed', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);
      session.dispose();

      const result = session.routeAllEdges();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Disposed: Engine session was disposed');
      }
      expect(mockWasm.route_all_edges).not.toHaveBeenCalled();
    });
  });

  describe('insertBend', () => {
    it('calls wasm.insert_bend with handle, edgeId.idx, segmentIndex, x, y', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);
      const edgeId = makeId(5, 1);

      session.insertBend(edgeId, 2, 100.5, 200.75);

      expect(mockWasm.insert_bend).toHaveBeenCalledOnce();
      expect(mockWasm.insert_bend).toHaveBeenCalledWith(42, 5, 2, 100.5, 200.75);
    });

    it('returns ok on success', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);

      const result = session.insertBend(makeId(1), 0, 0, 0);

      expect(result.ok).toBe(true);
    });

    it('returns err when wasm.insert_bend throws', () => {
      const mockWasm = createMockWasm();
      mockWasm.insert_bend.mockImplementation(() => {
        throw new Error('InsertBendFailed: invalid edge');
      });
      const session = createSession(mockWasm);

      const result = session.insertBend(makeId(99), 0, 0, 0);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('InsertBendFailed: invalid edge');
      }
    });

    it('returns Disposed error when session is disposed', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);
      session.dispose();

      const result = session.insertBend(makeId(1), 0, 0, 0);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Disposed: Engine session was disposed');
      }
      expect(mockWasm.insert_bend).not.toHaveBeenCalled();
    });
  });

  describe('moveBend', () => {
    it('calls wasm.move_bend with handle, edgeId.idx, bendIndex, x, y', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);
      const edgeId = makeId(7, 0);

      session.moveBend(edgeId, 3, 150.0, 250.0);

      expect(mockWasm.move_bend).toHaveBeenCalledOnce();
      expect(mockWasm.move_bend).toHaveBeenCalledWith(42, 7, 3, 150.0, 250.0);
    });

    it('returns ok on success', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);

      const result = session.moveBend(makeId(2), 1, 50, 50);

      expect(result.ok).toBe(true);
    });

    it('returns err when wasm.move_bend throws', () => {
      const mockWasm = createMockWasm();
      mockWasm.move_bend.mockImplementation(() => {
        throw new Error('MoveBendFailed: bend not found');
      });
      const session = createSession(mockWasm);

      const result = session.moveBend(makeId(3), 99, 0, 0);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('MoveBendFailed: bend not found');
      }
    });

    it('returns Disposed error when session is disposed', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);
      session.dispose();

      const result = session.moveBend(makeId(1), 0, 0, 0);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Disposed: Engine session was disposed');
      }
      expect(mockWasm.move_bend).not.toHaveBeenCalled();
    });
  });

  describe('removeBend', () => {
    it('calls wasm.remove_bend with handle, edgeId.idx, bendIndex', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);
      const edgeId = makeId(9, 2);

      session.removeBend(edgeId, 4);

      expect(mockWasm.remove_bend).toHaveBeenCalledOnce();
      expect(mockWasm.remove_bend).toHaveBeenCalledWith(42, 9, 4);
    });

    it('returns ok on success', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);

      const result = session.removeBend(makeId(1), 0);

      expect(result.ok).toBe(true);
    });

    it('returns err when wasm.remove_bend throws', () => {
      const mockWasm = createMockWasm();
      mockWasm.remove_bend.mockImplementation(() => {
        throw new Error('RemoveBendFailed: cannot remove');
      });
      const session = createSession(mockWasm);

      const result = session.removeBend(makeId(4), 0);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('RemoveBendFailed: cannot remove');
      }
    });

    it('returns Disposed error when session is disposed', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);
      session.dispose();

      const result = session.removeBend(makeId(1), 0);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Disposed: Engine session was disposed');
      }
      expect(mockWasm.remove_bend).not.toHaveBeenCalled();
    });
  });
});

describe('Session: group features v0.44', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('groupVertices', () => {
    it('calls wasm.group_vertices with handle and JSON array of indices', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);
      const ids = [makeId(1, 0), makeId(2, 0), makeId(3, 0)];

      session.groupVertices(ids);

      expect(mockWasm.group_vertices).toHaveBeenCalledOnce();
      expect(mockWasm.group_vertices).toHaveBeenCalledWith(42, '[1,2,3]');
    });

    it('returns ok on success', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);

      const result = session.groupVertices([makeId(1), makeId(2)]);

      expect(result.ok).toBe(true);
    });

    it('returns err when wasm.group_vertices throws', () => {
      const mockWasm = createMockWasm();
      mockWasm.group_vertices.mockImplementation(() => {
        throw new Error('GroupFailed: too few vertices');
      });
      const session = createSession(mockWasm);

      const result = session.groupVertices([makeId(1)]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('GroupFailed: too few vertices');
      }
    });

    it('returns Disposed error when session is disposed', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);
      session.dispose();

      const result = session.groupVertices([makeId(1), makeId(2)]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Disposed: Engine session was disposed');
      }
      expect(mockWasm.group_vertices).not.toHaveBeenCalled();
    });

    it('handles empty array', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);

      session.groupVertices([]);

      expect(mockWasm.group_vertices).toHaveBeenCalledWith(42, '[]');
    });
  });

  describe('ungroupVertices', () => {
    it('calls wasm.ungroup_vertices with handle and id.idx', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);
      const id = makeId(5, 1);

      session.ungroupVertices(id);

      expect(mockWasm.ungroup_vertices).toHaveBeenCalledOnce();
      expect(mockWasm.ungroup_vertices).toHaveBeenCalledWith(42, 5);
    });

    it('returns ok on success', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);

      const result = session.ungroupVertices(makeId(1));

      expect(result.ok).toBe(true);
    });

    it('returns err when wasm.ungroup_vertices throws', () => {
      const mockWasm = createMockWasm();
      mockWasm.ungroup_vertices.mockImplementation(() => {
        throw new Error('UngroupFailed: not a group');
      });
      const session = createSession(mockWasm);

      const result = session.ungroupVertices(makeId(99));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('UngroupFailed: not a group');
      }
    });

    it('returns Disposed error when session is disposed', () => {
      const mockWasm = createMockWasm();
      const session = createSession(mockWasm);
      session.dispose();

      const result = session.ungroupVertices(makeId(1));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Disposed: Engine session was disposed');
      }
      expect(mockWasm.ungroup_vertices).not.toHaveBeenCalled();
    });
  });
});

describe('Session: connectVertices v0.52 (edge with ports)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls wasm.connect_vertices with handle, indices, routingKind, sourcePort, targetPort', () => {
    const mockWasm = createMockWasm();
    const session = createSession(mockWasm);
    const from = makeId(1, 0);
    const to = makeId(2, 0);
    mockWasm.connect_vertices.mockReturnValue(99);

    session.connectVertices(from, to, 'orthogonal', 2, 3);

    expect(mockWasm.connect_vertices).toHaveBeenCalledOnce();
    expect(mockWasm.connect_vertices).toHaveBeenCalledWith(42, 1, 2, 0, 2, 3);
  });

  it('defaults routingKind to orthogonal, ports to 0', () => {
    const mockWasm = createMockWasm();
    const session = createSession(mockWasm);
    mockWasm.connect_vertices.mockReturnValue(50);

    session.connectVertices(makeId(3), makeId(4));

    expect(mockWasm.connect_vertices).toHaveBeenCalledWith(42, 3, 4, 0, 0, 0);
  });

  it('returns ok with SlotmapId on success', () => {
    const mockWasm = createMockWasm();
    const session = createSession(mockWasm);
    mockWasm.connect_vertices.mockReturnValue(77);

    const result = session.connectVertices(makeId(1), makeId(2), 'straight', 1, 1);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ idx: 77, version: 0 });
    }
  });

  it('returns err when wasm.connect_vertices throws', () => {
    const mockWasm = createMockWasm();
    mockWasm.connect_vertices.mockImplementation(() => {
      throw new Error('ConnectFailed: vertices not found');
    });
    const session = createSession(mockWasm);

    const result = session.connectVertices(makeId(1), makeId(2));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('ConnectFailed: vertices not found');
    }
  });

  it('returns Disposed error when session is disposed', () => {
    const mockWasm = createMockWasm();
    const session = createSession(mockWasm);
    session.dispose();

    const result = session.connectVertices(makeId(1), makeId(2));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Disposed: Engine session was disposed');
    }
    expect(mockWasm.connect_vertices).not.toHaveBeenCalled();
  });

  it('maps straight routingKind to value 1', () => {
    const mockWasm = createMockWasm();
    const session = createSession(mockWasm);
    mockWasm.connect_vertices.mockReturnValue(10);

    session.connectVertices(makeId(1), makeId(2), 'straight');

    expect(mockWasm.connect_vertices).toHaveBeenCalledWith(42, 1, 2, 1, 0, 0);
  });
});
