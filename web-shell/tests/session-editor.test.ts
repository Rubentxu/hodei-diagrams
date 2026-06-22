import { describe, it, expect, vi } from 'vitest';
import { DiagramEngineSession } from '../src/session.js';

function createMockWasm() {
  return {
    create_engine: vi.fn(),
    dispose_engine: vi.fn(),
    execute_command: vi.fn(),
    execute_transaction: vi.fn(),
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
    parse_stencil_xml: vi.fn(),
    parse_stencil_library_xml: vi.fn(),
    set_stencil_library: vi.fn(),
    get_resolved_style: vi.fn(),
  };
}

function createSession(mockWasm = createMockWasm()) {
  mockWasm.create_engine.mockReturnValue(42);
  const result = DiagramEngineSession.create(
    mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
  );
  if (!result.ok) throw new Error('create failed');
  return { session: result.value, wasm: mockWasm };
}

describe('executeCommand', () => {
  it('calls wasm.execute_command and returns ok', () => {
    const { session, wasm } = createSession();
    const cmd = '{"AddVertex":{}}';
    const r = session.executeCommand(cmd);
    expect(r.ok).toBe(true);
    expect(wasm.execute_command).toHaveBeenCalledWith(42, cmd);
  });

  it('returns err on disposed session without calling wasm', () => {
    const { session, wasm } = createSession();
    session.dispose();
    const r = session.executeCommand('{}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Disposed: Engine session was disposed');
    expect(wasm.execute_command).not.toHaveBeenCalled();
  });

  it('wraps wasm throw into error result', () => {
    const { session, wasm } = createSession();
    wasm.execute_command.mockImplementation(() => {
      throw new Error('InvalidCommand: bad json');
    });
    const r = session.executeCommand('not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('InvalidCommand');
  });
});

describe('executeCommands', () => {
  it('calls wasm.execute_command for each command in order', () => {
    const { session, wasm } = createSession();
    const cmds = ['{"AddVertex":{}}', '{"MoveVertex":{}}', '{"RemoveVertex":{}}'];
    const r = session.executeCommands(cmds);
    expect(r.ok).toBe(true);
    expect(wasm.execute_command).toHaveBeenCalledTimes(3);
    expect(wasm.execute_command).toHaveBeenNthCalledWith(1, 42, '{"AddVertex":{}}');
    expect(wasm.execute_command).toHaveBeenNthCalledWith(2, 42, '{"MoveVertex":{}}');
    expect(wasm.execute_command).toHaveBeenNthCalledWith(3, 42, '{"RemoveVertex":{}}');
  });

  it('returns aggregate ok when all commands succeed', () => {
    const { session, wasm } = createSession();
    const cmds = ['{"cmd":1}', '{"cmd":2}'];
    const r = session.executeCommands(cmds);
    expect(r.ok).toBe(true);
  });

  it('returns err on disposed session without calling wasm', () => {
    const { session, wasm } = createSession();
    session.dispose();
    const r = session.executeCommands(['{}']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Disposed: Engine session was disposed');
    expect(wasm.execute_command).not.toHaveBeenCalled();
  });

  it('wraps wasm throw into error result', () => {
    const { session, wasm } = createSession();
    wasm.execute_command.mockImplementation(() => {
      throw new Error('InvalidCommand: boom');
    });
    const r = session.executeCommands(['{"AddVertex":{}}', '{"MoveVertex":{}}']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('InvalidCommand');
  });
});

describe('undo / redo', () => {
  it('undo calls wasm.undo and returns ok', () => {
    const { session, wasm } = createSession();
    const r = session.undo();
    expect(r.ok).toBe(true);
    expect(wasm.undo).toHaveBeenCalledWith(42);
  });

  it('redo calls wasm.redo and returns ok', () => {
    const { session, wasm } = createSession();
    const r = session.redo();
    expect(r.ok).toBe(true);
    expect(wasm.redo).toHaveBeenCalledWith(42);
  });

  it('undo on disposed returns error without calling wasm', () => {
    const { session, wasm } = createSession();
    session.dispose();
    const r = session.undo();
    expect(r.ok).toBe(false);
    expect(wasm.undo).not.toHaveBeenCalled();
  });

  it('redo on disposed returns error without calling wasm', () => {
    const { session, wasm } = createSession();
    session.dispose();
    const r = session.redo();
    expect(r.ok).toBe(false);
    expect(wasm.redo).not.toHaveBeenCalled();
  });

  it('undo wraps wasm throw into error result', () => {
    const { session, wasm } = createSession();
    wasm.undo.mockImplementation(() => {
      throw new Error('Cannot undo');
    });
    const r = session.undo();
    expect(r.ok).toBe(false);
  });

  it('redo wraps wasm throw into error result', () => {
    const { session, wasm } = createSession();
    wasm.redo.mockImplementation(() => {
      throw new Error('Cannot redo');
    });
    const r = session.redo();
    expect(r.ok).toBe(false);
  });
});

describe('canUndo / canRedo', () => {
  it('canUndo returns true when wasm returns true', () => {
    const { session, wasm } = createSession();
    wasm.engine_can_undo.mockReturnValue(true);
    expect(session.canUndo()).toBe(true);
  });

  it('canUndo returns false when wasm returns false', () => {
    const { session, wasm } = createSession();
    wasm.engine_can_undo.mockReturnValue(false);
    expect(session.canUndo()).toBe(false);
  });

  it('canRedo returns true when wasm returns true', () => {
    const { session, wasm } = createSession();
    wasm.engine_can_redo.mockReturnValue(true);
    expect(session.canRedo()).toBe(true);
  });

  it('canRedo returns false when wasm returns false', () => {
    const { session, wasm } = createSession();
    wasm.engine_can_redo.mockReturnValue(false);
    expect(session.canRedo()).toBe(false);
  });

  it('canUndo returns false on disposed session', () => {
    const { session, wasm } = createSession();
    session.dispose();
    expect(session.canUndo()).toBe(false);
    expect(wasm.engine_can_undo).not.toHaveBeenCalled();
  });

  it('canRedo returns false on disposed session', () => {
    const { session, wasm } = createSession();
    session.dispose();
    expect(session.canRedo()).toBe(false);
    expect(wasm.engine_can_redo).not.toHaveBeenCalled();
  });

  it('canUndo returns false when wasm throws', () => {
    const { session, wasm } = createSession();
    wasm.engine_can_undo.mockImplementation(() => {
      throw new Error('InvalidHandle');
    });
    expect(session.canUndo()).toBe(false);
  });

  it('canRedo returns false when wasm throws', () => {
    const { session, wasm } = createSession();
    wasm.engine_can_redo.mockImplementation(() => {
      throw new Error('InvalidHandle');
    });
    expect(session.canRedo()).toBe(false);
  });
});

describe('getScene', () => {
  it('parses scene JSON and returns typed pages', () => {
    const { session, wasm } = createSession();
    const sceneJson = JSON.stringify({
      pages: [
        {
          page_id: { idx: 0, version: 0 },
          name: 'Page 1',
          width: 800,
          height: 600,
          display_list: [
            {
              Rect: {
                id: { idx: 0, version: 0 },
                bounds: { origin: { x: 10, y: 20 }, size: { width: 80, height: 40 } },
              },
            },
          ],
        },
      ],
    });
    wasm.get_scene.mockReturnValue(sceneJson);

    const r = session.getScene();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toHaveLength(1);
      expect(r.value[0]!.page_id).toEqual({ idx: 0, version: 0 });
      expect(r.value[0]!.name).toBe('Page 1');
      expect(r.value[0]!.display_list).toHaveLength(1);
    }
  });

  it('returns error on disposed session', () => {
    const { session, wasm } = createSession();
    session.dispose();
    const r = session.getScene();
    expect(r.ok).toBe(false);
    expect(wasm.get_scene).not.toHaveBeenCalled();
  });

  it('returns error on malformed JSON from wasm', () => {
    const { session, wasm } = createSession();
    wasm.get_scene.mockReturnValue('not json');
    const r = session.getScene();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('SceneParse');
  });

  it('returns error when pages is not an array', () => {
    const { session, wasm } = createSession();
    wasm.get_scene.mockReturnValue('{"pages": "not array"}');
    const r = session.getScene();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('SceneParse');
  });

  it('wraps wasm throw into error', () => {
    const { session, wasm } = createSession();
    wasm.get_scene.mockImplementation(() => {
      throw new Error('InvalidHandle');
    });
    const r = session.getScene();
    expect(r.ok).toBe(false);
  });
});

describe('renderPage', () => {
  it('calls wasm.render_svg with BigInt and returns SVG string', () => {
    const { session, wasm } = createSession();
    wasm.render_svg.mockReturnValue('<svg><rect/></svg>');
    const r = session.renderPage(0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('<svg><rect/></svg>');
    // Verify BigInt was passed
    expect(wasm.render_svg).toHaveBeenCalledWith(42, BigInt(0));
  });

  it('returns error on disposed session', () => {
    const { session, wasm } = createSession();
    session.dispose();
    const r = session.renderPage(0);
    expect(r.ok).toBe(false);
    expect(wasm.render_svg).not.toHaveBeenCalled();
  });

  it('wraps wasm throw into error', () => {
    const { session, wasm } = createSession();
    wasm.render_svg.mockImplementation(() => {
      throw new Error('PageNotFound: 99');
    });
    const r = session.renderPage(99);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('PageNotFound');
  });
});
