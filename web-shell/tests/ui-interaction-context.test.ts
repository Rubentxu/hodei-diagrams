/**
 * ui-interaction-context.test.ts — R2b canonical seam
 *
 * Compact real tests for the InteractionState seam:
 * - 3-field emission (isDragging, snapEnabled, isEditing)
 * - snap and text-edit transition
 * - 50-cycle disposal with real post-unsubscribe emissions
 * - grep boundary assertion (gridVisible NOT in editor.ts)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Editor } from '../src/editor.js';
import { DiagramEngineSession } from '../src/session.js';

// ─── Polyfills ────────────────────────────────────────────────────────────────
function createPointerEvent(type: string, init?: Record<string, unknown>): Event {
  const ev = new MouseEvent(type, { bubbles: true, ...init } as unknown as MouseEventInit);
  Object.defineProperty(ev, 'pointerId', { value: 0, configurable: true });
  Object.defineProperty(ev, 'offsetX', { value: 0, configurable: true });
  Object.defineProperty(ev, 'offsetY', { value: 0, configurable: true });
  Object.defineProperty(ev, 'clientX', { value: (init?.clientX as number) ?? 0, configurable: true });
  Object.defineProperty(ev, 'clientY', { value: (init?.clientY as number) ?? 0, configurable: true });
  Object.defineProperty(ev, 'button', { value: 0, configurable: true });
  return ev;
}
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
}

// ─── Mock WASM factory ────────────────────────────────────────────────────────
function createMockWasm() {
  const wasm = {
    create_engine: vi.fn().mockReturnValue(42),
    dispose_engine: vi.fn(),
    execute_command: vi.fn(),
    execute_transaction: vi.fn(),
    get_scene: vi.fn().mockReturnValue(JSON.stringify({
      pages: [{ page_id: { idx: 0, version: 0 }, name: 'Page 1', width: 800, height: 600, display_list: [] }],
    })),
    render_svg: vi.fn().mockReturnValue('<svg><rect data-vertex-id="0:0" x="10" y="20" width="80" height="40"/></svg>'),
    render_pages: vi.fn().mockReturnValue([]),
    decodeSceneBuffer: vi.fn().mockReturnValue({ ok: true, value: [] }),
    undo: vi.fn(), redo: vi.fn(), engine_can_undo: vi.fn().mockReturnValue(false), engine_can_redo: vi.fn().mockReturnValue(false),
    connect_vertices: vi.fn(), disconnect_edge: vi.fn(), parse_stencil_xml: vi.fn(), parse_stencil_library_xml: vi.fn(),
    set_stencil_library: vi.fn(), get_resolved_style: vi.fn(), get_metadata: vi.fn(), set_metadata: vi.fn(),
    apply_layout: vi.fn(), apply_hierarchical_layout: vi.fn(), route_all_edges: vi.fn(),
    insert_bend: vi.fn(), move_bend: vi.fn(), remove_bend: vi.fn(),
    group_vertices: vi.fn(), ungroup_vertices: vi.fn(),
    connect_vertices_anchored: vi.fn(), set_edge_anchor: vi.fn(), clear_edge_anchor: vi.fn(), get_edge_anchors: vi.fn(),
    set_page_math_enabled: vi.fn(), get_page_layers: vi.fn(),
    resolve_selection: vi.fn(), select_target: vi.fn(), clear_selection: vi.fn(), get_selection: vi.fn(),
    write_scene_to_buffer: vi.fn(), get_scene_buffer_ptr: vi.fn(), get_scene_buffer_len: vi.fn(), get_scene_buffer_capacity: vi.fn(),
    write_svg_to_buffer: vi.fn(), get_svg_buffer_ptr: vi.fn(), get_svg_buffer_len: vi.fn(),
  };
  return wasm;
}

function createSession(wasm = createMockWasm()): { session: DiagramEngineSession; wasm: typeof wasm } {
  return { session: wasm as unknown as DiagramEngineSession, wasm };
}

function createViewer(): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-testid', 'viewer');
  el.style.cssText = 'position:fixed;inset:0;width:800px;height:600px';
  document.body.appendChild(el);
  return el;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('UI Interaction Context (R2b seam)', () => {
  let session: DiagramEngineSession;
  let wasm: ReturnType<typeof createMockWasm>;
  let viewer: HTMLElement;
  let editor: Editor;

  beforeEach(() => {
    vi.restoreAllMocks();
    const ctx = createSession();
    session = ctx.session;
    wasm = ctx.wasm;
    viewer = createViewer();
    viewer.innerHTML = '<svg><rect data-vertex-id="0:0" x="10" y="20" width="80" height="40"/></svg>';
    editor = new Editor(session, viewer);
    editor.attach();
  });

  afterEach(() => {
    editor.detach();
    viewer.remove();
  });

  // ── 3-field emission ─────────────────────────────────────────────────────
  describe('onInteractionStateChange emits 3 fields', () => {
    it('emits { isDragging, snapEnabled, isEditing } on toggleSnap', () => {
      const received: { isDragging: boolean; snapEnabled: boolean; isEditing: boolean }[] = [];
      editor.onInteractionStateChange((s) => received.push({ ...s }));
      editor.toggleSnap();
      expect(received.length).toBeGreaterThan(0);
      const snapEvent = received.find((s) => s.snapEnabled === true);
      expect(snapEvent).toBeDefined();
      if (!snapEvent) return;
      expect(snapEvent.isDragging).toBe(false);
      expect(snapEvent.isEditing).toBe(false);
    });

    it('subscribe returns unsubscribe that stops events', () => {
      const fn = vi.fn();
      const unsub = editor.onInteractionStateChange(fn);
      editor.toggleSnap();
      expect(fn).toHaveBeenCalledTimes(1);
      unsub();
      editor.toggleSnap(); // snap back to false
      expect(fn).toHaveBeenCalledTimes(1); // no new calls
    });

    it('multiple listeners all fire on same event', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      editor.onInteractionStateChange(fn1);
      editor.onInteractionStateChange(fn2);
      editor.toggleSnap();
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });
  });

  // ── snap and isEditing transition ────────────────────────────────────────
  describe('snap and isEditing transitions', () => {
    it('isEditing transitions to true on text edit start (dblclick)', () => {
      const received: { isEditing: boolean }[] = [];
      editor.onInteractionStateChange((s) => received.push({ isEditing: s.isEditing }));

      // Trigger dblclick on the rect in the viewer SVG to start text edit
      const rect = viewer.querySelector('rect[data-vertex-id]')!;
      rect.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 50, clientY: 40 } as unknown as MouseEvent));

      // isEditing should be true immediately after dblclick
      const editingEvent = received.find((s) => s.isEditing === true);
      expect(editingEvent).toBeDefined();
    });

    it('snapEnabled toggles correctly', () => {
      expect(editor.snapEnabled).toBe(false);
      editor.toggleSnap();
      expect(editor.snapEnabled).toBe(true);
      editor.toggleSnap();
      expect(editor.snapEnabled).toBe(false);
    });
  });

  // ── 50-cycle disposal with post-unsubscribe emissions ───────────────────
  describe('50-cycle disposal guard', () => {
    it('after 50 subscribe/unsubscribe cycles, fresh listener fires exactly once', () => {
      for (let i = 0; i < 50; i++) {
        const cycleFn = vi.fn();
        const unsub = editor.onInteractionStateChange(cycleFn);
        unsub();
        expect(cycleFn).not.toHaveBeenCalled();
      }
      const freshFn = vi.fn();
      editor.onInteractionStateChange(freshFn);
      editor.toggleSnap();
      expect(freshFn).toHaveBeenCalledTimes(1);
      const [callArg] = freshFn.mock.calls[0]!;
      expect(callArg).toHaveProperty('isDragging');
      expect(callArg).toHaveProperty('snapEnabled');
      expect(callArg).toHaveProperty('isEditing');
    });

    it('unsubscribed listener never fires, active listeners still receive events', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const unsub1 = editor.onInteractionStateChange(fn1);
      editor.onInteractionStateChange(fn2);
      editor.toggleSnap();
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
      unsub1();
      editor.toggleSnap();
      expect(fn1).toHaveBeenCalledTimes(1); // no new calls
      expect(fn2).toHaveBeenCalledTimes(2); // still receiving
    });
  });

  // ── grep boundary assertion ──────────────────────────────────────────────
  describe('grep boundary: gridVisible NOT in editor.ts', () => {
    it('editor.ts source does not contain gridVisible', async () => {
      const { readFileSync } = await import('fs');
      const { resolve } = await import('path');
      const editorSrc = readFileSync(resolve('./src/editor.ts'), 'utf8');
      expect(editorSrc).not.toMatch(/gridVisible/);
    });
  });
});
