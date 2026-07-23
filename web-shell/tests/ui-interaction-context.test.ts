/**
 * ui-interaction-context.test.ts — R2b canonical seam
 * Real tests: 3-field IS emission, snap/isEditing transitions, 50-cycle disposal, pointer drag lifecycle
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Editor } from '../src/editor.js';
import { DiagramEngineSession } from '../src/session.js';

if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
}

function createMockWasm() {
  const scene = JSON.stringify({ pages: [{ page_id: { idx: 0, version: 0 }, name: 'Page 1', width: 800, height: 600, display_list: [] }] });
  return {
    create_engine: vi.fn().mockReturnValue(42), dispose_engine: vi.fn(),
    execute_command: vi.fn(), execute_transaction: vi.fn(),
    get_scene: vi.fn().mockReturnValue(scene),
    render_svg: vi.fn().mockReturnValue('<svg><rect data-vertex-id="0:0" x="10" y="20" width="80" height="40"/></svg>'),
    render_pages: vi.fn().mockReturnValue([]),
    decodeSceneBuffer: vi.fn().mockReturnValue({ ok: true, value: [
      { page_id: { idx: 0, version: 0 }, name: 'Page 1', width: 800, height: 600,
        display_list: [{ id: '0:0', kind: 'Rectangle', x: 10, y: 20, width: 80, height: 40, style: {}, text: 'Label', owner: { Vertex: { idx: 0, version: 0 } } }] },
    ] }),
    resolve_selection: (_h: number, x: number, y: number) =>
      (x >= 10 && x <= 90 && y >= 20 && y <= 60) ? '{"type":"Vertex","id":{"idx":0,"version":0}}' : '{"type":"None"}',
    select_target: vi.fn(), clear_selection: vi.fn(),
    undo: vi.fn(), redo: vi.fn(), engine_can_undo: vi.fn().mockReturnValue(false), engine_can_redo: vi.fn().mockReturnValue(false),
    connect_vertices: vi.fn(), disconnect_edge: vi.fn(), parse_stencil_xml: vi.fn(), parse_stencil_library_xml: vi.fn(),
    set_stencil_library: vi.fn(), get_resolved_style: vi.fn(), get_metadata: vi.fn(), set_metadata: vi.fn(),
    apply_layout: vi.fn(), apply_hierarchical_layout: vi.fn(), route_all_edges: vi.fn(),
    insert_bend: vi.fn(), move_bend: vi.fn(), remove_bend: vi.fn(),
    group_vertices: vi.fn(), ungroup_vertices: vi.fn(),
    connect_vertices_anchored: vi.fn(), set_edge_anchor: vi.fn(), clear_edge_anchor: vi.fn(), get_edge_anchors: vi.fn(),
    set_page_math_enabled: vi.fn(), get_page_layers: vi.fn(), get_selection: vi.fn(),
    write_scene_to_buffer: vi.fn(), get_scene_buffer_ptr: vi.fn(), get_scene_buffer_len: vi.fn(), get_scene_buffer_capacity: vi.fn(),
    write_svg_to_buffer: vi.fn(), get_svg_buffer_ptr: vi.fn(), get_svg_buffer_len: vi.fn(),
  };
}

function createSession(wasm = createMockWasm()): { session: DiagramEngineSession; wasm: typeof wasm } {
  function ok<T>(v: T) { return { ok: true as const, value: v }; }
  const session = {
    resolveSelection: (_x: number, _y: number, _m: { alt: boolean; shift: boolean; ctrl: boolean; meta: boolean }) => {
      const raw = (wasm as Record<string, unknown>).resolve_selection as (_Handle: number, _x: number, _y: number, _alt: boolean, _shift: boolean, _ctrl: boolean, _meta: boolean) => string;
      const result = raw(42, _x, _y, _m.alt, _m.shift, _m.ctrl, _m.meta);
      try { return ok(JSON.parse(result)); } catch { return ok({ type: 'None' as const }); }
    },
    selectTarget: () => ok(undefined), clearSelection: () => ok(undefined),
    decodeSceneBuffer: wasm.decodeSceneBuffer,
    renderPage: vi.fn().mockReturnValue(ok('<svg><rect data-vertex-id="0:0" x="10" y="20" width="80" height="40"/></svg>')),
    renderPages: wasm.render_pages, executeCommand: wasm.execute_command, executeTransaction: wasm.execute_transaction,
    exportDrawio: vi.fn().mockReturnValue(ok('<mxGraphModel/>')), exportDrawioFresh: vi.fn().mockReturnValue(ok('<mxGraphModel/>')),
    importDrawio: vi.fn().mockReturnValue(ok(undefined)), setPageMathEnabled: vi.fn().mockReturnValue(ok(undefined)),
    getSceneCache: vi.fn().mockReturnValue(ok([])), addPage: vi.fn().mockReturnValue(ok(undefined)),
    renderAllPages: vi.fn().mockReturnValue(ok([])), undo: wasm.undo, redo: wasm.redo,
    engineCanUndo: wasm.engine_can_undo, engineCanRedo: wasm.engine_can_redo,
  } as unknown as DiagramEngineSession;
  return { session, wasm };
}

describe('UI Interaction Context (R2b seam)', () => {
  let session: DiagramEngineSession;
  let viewer: HTMLElement;
  let editor: Editor;

  beforeEach(() => {
    vi.restoreAllMocks();
    const ctx = createSession(); session = ctx.session;
    viewer = document.createElement('div');
    viewer.setAttribute('data-testid', 'viewer');
    viewer.style.cssText = 'position:fixed;inset:0;width:800px;height:600px';
    viewer.innerHTML = '<svg><rect data-vertex-id="0:0" x="10" y="20" width="80" height="40"/></svg>';
    document.body.appendChild(viewer);
    editor = new Editor(session, viewer); editor.attach();
  });

  afterEach(() => { editor.detach(); viewer.remove(); });

  // 3-field InteractionState emission
  describe('onInteractionStateChange', () => {
    it('emits 3-field IS on toggleSnap', () => {
      const received: { isDragging: boolean; snapEnabled: boolean; isEditing: boolean }[] = [];
      editor.onInteractionStateChange((s) => received.push({ ...s }));
      editor.toggleSnap();
      expect(received.some((s) => s.snapEnabled === true)).toBe(true);
      const snap = received.find((s) => s.snapEnabled === true)!;
      expect(snap.isDragging).toBe(false);
      expect(snap.isEditing).toBe(false);
    });

    it('unsubscribe stops events', () => {
      const fn = vi.fn(); const unsub = editor.onInteractionStateChange(fn);
      editor.toggleSnap(); expect(fn).toHaveBeenCalledTimes(1);
      unsub(); editor.toggleSnap(); expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // snapEnabled property and isEditing transition
  describe('snapEnabled and isEditing', () => {
    it('snapEnabled toggles correctly', () => {
      expect(editor.snapEnabled).toBe(false); editor.toggleSnap(); expect(editor.snapEnabled).toBe(true); editor.toggleSnap(); expect(editor.snapEnabled).toBe(false);
    });

    it('isEditing true on text edit (dblclick)', () => {
      const received: boolean[] = [];
      editor.onInteractionStateChange((s) => received.push(s.isEditing));
      const rect = viewer.querySelector('rect[data-vertex-id]')!;
      rect.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 50, clientY: 40 } as unknown as MouseEvent));
      expect(received.some((v) => v === true)).toBe(true);
    });
  });

  // 50-cycle disposal: after 50 cycles, fresh listener fires
  describe('50-cycle disposal', () => {
    it('fresh listener fires after 50 cycles', () => {
      for (let i = 0; i < 50; i++) { const f = vi.fn(); const u = editor.onInteractionStateChange(f); u(); }
      const fresh = vi.fn(); editor.onInteractionStateChange(fresh); editor.toggleSnap();
      expect(fresh).toHaveBeenCalledTimes(1);
      const [arg] = fresh.mock.calls[0]!;
      expect(arg).toHaveProperty('isDragging'); expect(arg).toHaveProperty('snapEnabled'); expect(arg).toHaveProperty('isEditing');
    });

    it('unsubscribed listener never fires, active listeners still receive', () => {
      const dead = vi.fn(); const live = vi.fn();
      const u = editor.onInteractionStateChange(dead); editor.onInteractionStateChange(live);
      editor.toggleSnap(); expect(dead).toHaveBeenCalledTimes(1); expect(live).toHaveBeenCalledTimes(1);
      u(); editor.toggleSnap(); expect(dead).toHaveBeenCalledTimes(1); expect(live).toHaveBeenCalledTimes(2);
    });
  });

  // Real pointer drag lifecycle: pointerdown→pointermove→pointerup
  describe('isDragging pointer lifecycle', () => {
    it('false→true on pointerdown, stays true on pointermove, true→false on pointerup', () => {
      const snaps: { isDragging: boolean }[] = [];
      editor.onInteractionStateChange((s) => snaps.push({ isDragging: s.isDragging }));
      const rect = viewer.querySelector('rect[data-vertex-id]')!;
      const cx = 50, cy = 40;
      const down = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: cx, clientY: cy }); Object.defineProperty(down, 'pointerId', { value: 1 });
      rect.dispatchEvent(down); expect(snaps.at(-1)?.isDragging).toBe(true);
      const move = new MouseEvent('pointermove', { bubbles: true, clientX: cx + 5, clientY: cy + 5 }); Object.defineProperty(move, 'pointerId', { value: 1 });
      rect.dispatchEvent(move); expect(snaps.at(-1)?.isDragging).toBe(true);
      const up = new MouseEvent('pointerup', { bubbles: true, clientX: cx + 5, clientY: cy + 5 }); Object.defineProperty(up, 'pointerId', { value: 1 });
      rect.dispatchEvent(up); expect(snaps.at(-1)?.isDragging).toBe(false);
    });

    it('detach mid-drag fires isDragging=false', () => {
      const snaps: { isDragging: boolean }[] = [];
      editor.onInteractionStateChange((s) => snaps.push({ isDragging: s.isDragging }));
      const rect = viewer.querySelector('rect[data-vertex-id]')!;
      const down = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 50, clientY: 40 }); Object.defineProperty(down, 'pointerId', { value: 1 });
      rect.dispatchEvent(down); expect(snaps.at(-1)?.isDragging).toBe(true);
      editor.detach(); expect(snaps.at(-1)?.isDragging).toBe(false);
    });

    // R2b-FIX: pointercancel clears moveArea/drag state and emits compact state
    it('pointercancel after pointerdown clears dragState and emits isDragging=false', () => {
      const snaps: { isDragging: boolean }[] = [];
      editor.onInteractionStateChange((s) => snaps.push({ isDragging: s.isDragging }));
      const rect = viewer.querySelector('rect[data-vertex-id]')!;
      const cx = 50, cy = 40;
      // Start a drag
      const down = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: cx, clientY: cy }); Object.defineProperty(down, 'pointerId', { value: 1 });
      rect.dispatchEvent(down);
      expect(snaps.at(-1)?.isDragging).toBe(true);
      // Trigger pointercancel (not pointerup)
      const cancel = new MouseEvent('pointercancel', { bubbles: true, clientX: cx + 3, clientY: cy + 3 }); Object.defineProperty(cancel, 'pointerId', { value: 1 });
      rect.dispatchEvent(cancel);
      // After pointercancel, isDragging should be false (compact state)
      expect(snaps.at(-1)?.isDragging).toBe(false);
    });
  });

  // R2b-FIX: detach clears moveArea state (moveArea is internal, verify via isDragging)
  describe('detach lifecycle', () => {
    it('detach when no drag active emits isDragging=false', () => {
      const snaps: { isDragging: boolean }[] = [];
      editor.onInteractionStateChange((s) => snaps.push({ isDragging: s.isDragging }));
      // No drag started, just detach
      editor.detach();
      // Should emit compact state (isDragging=false)
      expect(snaps.at(-1)?.isDragging).toBe(false);
    });
  });
});
