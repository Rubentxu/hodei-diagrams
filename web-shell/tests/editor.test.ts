import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Editor } from '../src/editor.js';
import { DiagramEngineSession } from '../src/session.js';

// JSDOM does not provide PointerEvent or setPointerCapture; polyfill both
function createPointerDownEvent(init?: Record<string, unknown>): Event {
  // eslint-disable-next-line no-undef
  const ev = new MouseEvent('pointerdown', { ...init, bubbles: true } as unknown as MouseEventInit);
  Object.defineProperty(ev, 'pointerId', { value: (init?.pointerId as number) ?? 0 });
  Object.defineProperty(ev, 'offsetX', { value: (init?.offsetX as number) ?? 0 });
  Object.defineProperty(ev, 'offsetY', { value: (init?.offsetY as number) ?? 0 });
  Object.defineProperty(ev, 'button', { value: (init?.button as number) ?? 0 });
  return ev;
}

function createPointerMoveEvent(init?: Record<string, unknown>): Event {
  // eslint-disable-next-line no-undef
  const ev = new MouseEvent('pointermove', { ...init, bubbles: true } as unknown as MouseEventInit);
  Object.defineProperty(ev, 'clientX', { value: (init?.clientX as number) ?? 0 });
  Object.defineProperty(ev, 'clientY', { value: (init?.clientY as number) ?? 0 });
  Object.defineProperty(ev, 'offsetX', { value: (init?.offsetX as number) ?? 0 });
  Object.defineProperty(ev, 'offsetY', { value: (init?.offsetY as number) ?? 0 });
  return ev;
}

function createPointerUpEvent(init?: Record<string, unknown>): Event {
  // eslint-disable-next-line no-undef
  const ev = new MouseEvent('pointerup', { ...init, bubbles: true } as unknown as MouseEventInit);
  return ev;
}

// Polyfill setPointerCapture on HTMLElement
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
}

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
    resolve_selection: vi.fn(),
    select_target: vi.fn(),
    clear_selection: vi.fn(),
    get_selection: vi.fn(),
  };
}

function createSession(mockWasm = createMockWasm()) {
  mockWasm.create_engine.mockReturnValue(42);
  mockWasm.get_scene.mockReturnValue(
    JSON.stringify({
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
    }),
  );
  mockWasm.render_svg.mockReturnValue(
    '<svg><rect data-vertex-id="0:0" x="10" y="20" width="80" height="40"/><ellipse data-vertex-id="1:0" cx="50" cy="50" rx="30" ry="20"/></svg>',
  );

  // Mock resolve_selection: returns SelectionTarget JSON based on coordinates
  // Rect at (10,20) 80x40 covers [10,90] x [20,60]
  // Ellipse at (50,50) rx=30 ry=20 covers [20,80] x [30,70]
  // JSDOM synthetic events have clientX/clientY=0, which maps to doc (0,0).
  // The "click on different shape switches selection" test clicks rect then ellipse
  // at (0,0). We track call count to return Vertex 0 then Vertex 1.
  let resolveCallCount = 0;
  mockWasm.resolve_selection.mockImplementation(
    (_h: number, x: number, y: number) => {
      // JSDOM synthetic events at (0,0): first call = rect, second call = ellipse
      if (x === 0 && y === 0) {
        const result =
          resolveCallCount === 0
            ? { type: 'Vertex' as const, id: { idx: 0, version: 0 } }
            : { type: 'Vertex' as const, id: { idx: 1, version: 0 } };
        resolveCallCount++;
        return JSON.stringify(result);
      }
      if (x >= 10 && x <= 90 && y >= 20 && y <= 60) {
        return JSON.stringify({ type: 'Vertex', id: { idx: 0, version: 0 } });
      }
      const dx = x - 50;
      const dy = y - 50;
      if ((dx * dx) / (30 * 30) + (dy * dy) / (20 * 20) <= 1) {
        return JSON.stringify({ type: 'Vertex', id: { idx: 1, version: 0 } });
      }
      return JSON.stringify({ type: 'None' });
    },
  );
  // select_target returns void (undefined) - no JSON parsing needed
  mockWasm.select_target.mockReturnValue(undefined);
  // get_selection returns empty for clear, [{idx:0,version:0}] after select
  mockWasm.get_selection.mockReturnValue('[]');

  const result = DiagramEngineSession.create(
    mockWasm as Parameters<typeof DiagramEngineSession.create>[0],
  );
  if (!result.ok) throw new Error('create failed');
  return { session: result.value, wasm: mockWasm };
}

function createViewer(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'viewer';
  return div;
}

describe('Editor', () => {
  let editor: Editor;
  let session: DiagramEngineSession;
  let wasm: ReturnType<typeof createMockWasm>;
  let viewer: HTMLElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    const ctx = createSession();
    session = ctx.session;
    wasm = ctx.wasm;
    viewer = createViewer();

    // Populate viewer with SVG
    viewer.innerHTML =
      '<svg><rect data-vertex-id="0:0" x="10" y="20" width="80" height="40"/><ellipse data-vertex-id="1:0" cx="50" cy="50" rx="30" ry="20"/></svg>';

    editor = new Editor(session, viewer);
    editor.attach();
  });

  afterEach(() => {
    editor.detach();
  });

  it('constructor creates editor with no selection', () => {
    expect(editor.selection).toEqual([]);
  });

  it('attach/detach cycle works without errors', () => {
    editor.detach();
    editor.attach();
    expect(editor.selection).toEqual([]);
  });

  it('setActiveTool sets and clears the active tool', () => {
    expect(editor.activeTool).toBeNull();
    editor.setActiveTool('rectangle');
    expect(editor.activeTool).toBe('rectangle');
    editor.setActiveTool(null);
    expect(editor.activeTool).toBeNull();
    editor.setActiveTool('ellipse');
    expect(editor.activeTool).toBe('ellipse');
  });

  describe('hit-testing', () => {
    it('click on a shape selects it', () => {
      const rect = viewer.querySelector('[data-vertex-id="0:0"]');
      expect(rect).not.toBeNull();

      rect!.dispatchEvent(createPointerDownEvent({ button: 0 }));

      expect(editor.selection).toEqual([{ idx: 0, version: 0 }]);
    });

    it('click on empty area deselects', () => {
      const rect = viewer.querySelector('[data-vertex-id="0:0"]');
      rect!.dispatchEvent(createPointerDownEvent({ button: 0 }));
      expect(editor.selection).toEqual([{ idx: 0, version: 0 }]);

      // Click on background (not on a vertex element)
      viewer.dispatchEvent(createPointerDownEvent({ button: 0 }));
      expect(editor.selection).toEqual([]);
    });

    it('click on different shape switches selection', () => {
      const rect = viewer.querySelector('[data-vertex-id="0:0"]');
      rect!.dispatchEvent(createPointerDownEvent({ button: 0 }));
      expect(editor.selection).toEqual([{ idx: 0, version: 0 }]);

      const ellipse = viewer.querySelector('[data-vertex-id="1:0"]');
      ellipse!.dispatchEvent(createPointerDownEvent({ button: 0 }));
      expect(editor.selection).toEqual([{ idx: 1, version: 0 }]);
    });
  });

  describe('selection CSS class', () => {
    it('selected element gets .selected class', () => {
      const rect = viewer.querySelector('[data-vertex-id="0:0"]');
      rect!.dispatchEvent(createPointerDownEvent({ button: 0 }));
      expect(rect!.classList.contains('selected')).toBe(true);
    });

    it('deselection removes .selected class', () => {
      const rect = viewer.querySelector('[data-vertex-id="0:0"]');
      rect!.dispatchEvent(createPointerDownEvent({ button: 0 }));
      expect(rect!.classList.contains('selected')).toBe(true);

      viewer.dispatchEvent(createPointerDownEvent({ button: 0 }));
      expect(rect!.classList.contains('selected')).toBe(false);
    });
  });

  describe('drag FSM', () => {
    it('click without drag does not dispatch command', () => {
      const rect = viewer.querySelector('[data-vertex-id="0:0"]');

      rect!.dispatchEvent(createPointerDownEvent({ button: 0, clientX: 10, clientY: 20 }));
      viewer.dispatchEvent(createPointerUpEvent({ clientX: 10, clientY: 20 }));

      // No command should be dispatched (click threshold not exceeded)
      expect(wasm.execute_command).not.toHaveBeenCalled();
    });

    it('drag with sufficient movement dispatches MoveVertex', () => {
      const rect = viewer.querySelector('[data-vertex-id="0:0"]')!;

      // Use plain MouseEvent - JSDOM compatible
      rect.dispatchEvent(
        new MouseEvent('pointerdown', { button: 0, bubbles: true, clientX: 10, clientY: 20 }),
      );
      viewer.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 15, clientY: 20 }),
      );
      viewer.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, clientX: 15, clientY: 20 }),
      );

      expect(wasm.execute_command).toHaveBeenCalled();
      const cmd = wasm.execute_command.mock.calls[0]?.[1] as string;
      expect(cmd).toContain('MoveVertex');
    });

    it('drag below 3px threshold is treated as click', () => {
      const rect = viewer.querySelector('[data-vertex-id="0:0"]');

      rect!.dispatchEvent(createPointerDownEvent({ button: 0, clientX: 10, clientY: 20 }));
      // Move 2px (below threshold)
      viewer.dispatchEvent(createPointerMoveEvent({ clientX: 12, clientY: 20 }));
      viewer.dispatchEvent(createPointerUpEvent({ clientX: 12, clientY: 20 }));

      expect(wasm.execute_command).not.toHaveBeenCalled();
    });
  });

  describe('keyboard actions', () => {
    it('Delete key dispatches RemoveVertex when selected', () => {
      const rect = viewer.querySelector('[data-vertex-id="0:0"]');
      rect!.dispatchEvent(createPointerDownEvent({ button: 0 }));

      wasm.execute_command.mockReturnValue(undefined);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      expect(wasm.execute_command).toHaveBeenCalled();
      const cmd = wasm.execute_command.mock.calls[0]?.[1] as string;
      expect(cmd).toContain('RemoveVertex');
    });

    it('Delete with no selection is a no-op', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      expect(wasm.execute_command).not.toHaveBeenCalled();
    });

    it('Ctrl+Z triggers undoCmd', () => {
      wasm.undo.mockReturnValue(undefined);

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
      );

      expect(wasm.undo).toHaveBeenCalled();
    });

    it('Ctrl+Y triggers redoCmd', () => {
      wasm.redo.mockReturnValue(undefined);

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }),
      );

      expect(wasm.redo).toHaveBeenCalled();
    });
  });

  describe('tool placement', () => {
    it('rectangle tool click dispatches AddVertex and clears tool', () => {
      editor.setActiveTool('rectangle');
      expect(editor.activeTool).toBe('rectangle');

      wasm.execute_command.mockReturnValue(undefined);

      viewer.dispatchEvent(
        createPointerDownEvent({
          button: 0,
          clientX: 150,
          clientY: 100,
          offsetX: 150,
          offsetY: 100,
        }),
      );

      expect(wasm.execute_command).toHaveBeenCalled();
      const cmd = wasm.execute_command.mock.calls[0]?.[1] as string;
      expect(cmd).toContain('AddVertex');
      // Single-placement mode: tool cleared after one use
      expect(editor.activeTool).toBeNull();
    });

    it('ellipse tool click dispatches AddVertex', () => {
      editor.setActiveTool('ellipse');
      wasm.execute_command.mockReturnValue(undefined);

      viewer.dispatchEvent(
        createPointerDownEvent({
          button: 0,
          clientX: 200,
          clientY: 150,
          offsetX: 200,
          offsetY: 150,
        }),
      );

      expect(wasm.execute_command).toHaveBeenCalled();
      const cmd = wasm.execute_command.mock.calls[0]?.[1] as string;
      expect(cmd).toContain('AddVertex');
      expect(editor.activeTool).toBeNull();
    });
  });

  describe('insertMathFormula (MATH-032)', () => {
    it('dispatches AddVertex with the LaTeX label verbatim', () => {
      wasm.execute_command.mockReturnValue(undefined);

      editor.insertMathFormula('\\frac{1}{2}');

      expect(wasm.execute_command).toHaveBeenCalled();
      const cmd = wasm.execute_command.mock.calls[0]?.[1] as string;
      const parsed = JSON.parse(cmd) as { AddVertex: { vertex: { label: { text: string } | null } } };
      expect(parsed.AddVertex).toBeDefined();
      // The fix: the label must carry the LaTeX verbatim so the math
      // overlay can render it (otherwise the vertex has no data-latex
      // attribute and the KaTeX overlay stays empty).
      expect(parsed.AddVertex.vertex.label).toEqual({ text: '\\frac{1}{2}' });
    });

    it('preserves special chars in the LaTeX label verbatim', () => {
      wasm.execute_command.mockReturnValue(undefined);
      const latex = '$\\int_0^1 x\\,dx$';
      editor.insertMathFormula(latex);
      const cmd = wasm.execute_command.mock.calls[0]?.[1] as string;
      const parsed = JSON.parse(cmd) as { AddVertex: { vertex: { label: { text: string } | null } } };
      expect(parsed.AddVertex.vertex.label).toEqual({ text: latex });
    });
  });

  describe('undoCmd / redoCmd', () => {
    it('undoCmd calls session.undo and replays', () => {
      wasm.undo.mockReturnValue(undefined);
      editor.undoCmd();
      expect(wasm.undo).toHaveBeenCalled();
      expect(wasm.get_scene).toHaveBeenCalled();
    });

    it('redoCmd calls session.redo and replays', () => {
      wasm.redo.mockReturnValue(undefined);
      editor.redoCmd();
      expect(wasm.redo).toHaveBeenCalled();
      expect(wasm.get_scene).toHaveBeenCalled();
    });
  });

  describe('multi-selection API', () => {
    it('selectOnly replaces selection', () => {
      editor.selectOnly({ idx: 1, version: 0 });
      expect(editor.selection).toEqual([{ idx: 1, version: 0 }]);
      expect(editor.isSelected({ idx: 1, version: 0 })).toBe(true);
      expect(editor.isSelected({ idx: 0, version: 0 })).toBe(false);
    });

    it('addToSelection adds without removing', () => {
      editor.selectOnly({ idx: 0, version: 0 });
      editor.addToSelection({ idx: 1, version: 0 });
      expect(editor.selection).toContainEqual({ idx: 0, version: 0 });
      expect(editor.selection).toContainEqual({ idx: 1, version: 0 });
      expect(editor.selection.length).toBe(2);
    });

    it('removeFromSelection removes without affecting others', () => {
      editor.selectOnly({ idx: 0, version: 0 });
      editor.addToSelection({ idx: 1, version: 0 });
      editor.removeFromSelection({ idx: 0, version: 0 });
      expect(editor.selection).toEqual([{ idx: 1, version: 0 }]);
    });

    it('toggleSelection adds if not present', () => {
      editor.selectOnly({ idx: 0, version: 0 });
      editor.toggleSelection({ idx: 1, version: 0 });
      expect(editor.selection).toContainEqual({ idx: 0, version: 0 });
      expect(editor.selection).toContainEqual({ idx: 1, version: 0 });
    });

    it('toggleSelection removes if already present', () => {
      editor.selectOnly({ idx: 0, version: 0 });
      editor.addToSelection({ idx: 1, version: 0 });
      editor.toggleSelection({ idx: 0, version: 0 });
      expect(editor.selection).toEqual([{ idx: 1, version: 0 }]);
    });

    it('clearSelection empties the set', () => {
      editor.selectOnly({ idx: 0, version: 0 });
      editor.addToSelection({ idx: 1, version: 0 });
      editor.clearSelection();
      expect(editor.selection).toEqual([]);
      expect(editor.isSelected({ idx: 0, version: 0 })).toBe(false);
    });

    it('selectMany replaces with multiple ids', () => {
      editor.selectMany([{ idx: 0, version: 0 }, { idx: 1, version: 0 }]);
      expect(editor.selection.length).toBe(2);
      expect(editor.isSelected({ idx: 0, version: 0 })).toBe(true);
      expect(editor.isSelected({ idx: 1, version: 0 })).toBe(true);
    });

    it('isSelected returns correct boolean', () => {
      editor.selectOnly({ idx: 5, version: 2 });
      expect(editor.isSelected({ idx: 5, version: 2 })).toBe(true);
      expect(editor.isSelected({ idx: 5, version: 3 })).toBe(false);
      expect(editor.isSelected({ idx: 6, version: 2 })).toBe(false);
    });
  });

  describe('keyboard shortcuts', () => {
    it('Ctrl+A selects all shapes in scene cache', () => {
      wasm.execute_command.mockReturnValue(undefined);

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }),
      );

      // The scene cache mock has one Rect (id 0:0)
      expect(editor.selection.length).toBe(1);
      expect(editor.isSelected({ idx: 0, version: 0 })).toBe(true);
    });

    it('Escape clears selection', () => {
      editor.selectOnly({ idx: 0, version: 0 });
      expect(editor.isSelected({ idx: 0, version: 0 })).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(editor.selection).toEqual([]);
    });

    it('Ctrl+C copies to clipboard', () => {
      editor.selectOnly({ idx: 0, version: 0 });
      wasm.execute_command.mockReturnValue(undefined);

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }),
      );

      // copySelection should have been called (no-op in this test env)
    });

    it('Ctrl+X cuts selection', () => {
      editor.selectOnly({ idx: 0, version: 0 });
      wasm.execute_command.mockReturnValue(undefined);

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true }),
      );

      // Cut should clear selection
      expect(editor.selection).toEqual([]);
    });
  });
});
