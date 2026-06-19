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
    get_scene: vi.fn(),
    render_svg: vi.fn(),
    render_pages: vi.fn(),
    import_drawio: vi.fn(),
    export_drawio: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    engine_can_undo: vi.fn(),
    engine_can_redo: vi.fn(),
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
    expect(editor.selection).toBeNull();
  });

  it('attach/detach cycle works without errors', () => {
    editor.detach();
    editor.attach();
    expect(editor.selection).toBeNull();
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

      expect(editor.selection).toEqual({ idx: 0, version: 0 });
    });

    it('click on empty area deselects', () => {
      const rect = viewer.querySelector('[data-vertex-id="0:0"]');
      rect!.dispatchEvent(createPointerDownEvent({ button: 0 }));
      expect(editor.selection).toEqual({ idx: 0, version: 0 });

      // Click on background (not on a vertex element)
      viewer.dispatchEvent(createPointerDownEvent({ button: 0 }));
      expect(editor.selection).toBeNull();
    });

    it('click on different shape switches selection', () => {
      const rect = viewer.querySelector('[data-vertex-id="0:0"]');
      rect!.dispatchEvent(createPointerDownEvent({ button: 0 }));
      expect(editor.selection).toEqual({ idx: 0, version: 0 });

      const ellipse = viewer.querySelector('[data-vertex-id="1:0"]');
      ellipse!.dispatchEvent(createPointerDownEvent({ button: 0 }));
      expect(editor.selection).toEqual({ idx: 1, version: 0 });
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
});
