import type { WasmModule, Result, EngineError } from './types.js';
import { ok, err } from './types.js';

export async function loadWasm(): Promise<Result<WasmModule, EngineError>> {
  try {
    if (typeof WebAssembly === 'undefined') {
      return err('This browser does not support WebAssembly');
    }

    const mod = await import('./wasm/diagram_wasm.js');
    // wasm-pack --target web: default export is the async init() function
    // Named exports are the 12 WASM functions
    // Capture InitOutput so we can attach its `memory` to the WasmModule.
    const initOutput = await mod.default();

    const wasm: WasmModule = {
      memory: initOutput.memory,
      create_engine: mod.create_engine,
      dispose_engine: mod.dispose_engine,
      execute_command: mod.execute_command,
      execute_transaction: mod.execute_transaction,
      get_scene: mod.get_scene,
      render_svg: mod.render_svg,
      render_pages: mod.render_pages,
      write_scene_to_buffer: mod.write_scene_to_buffer,
      get_scene_buffer_ptr: mod.get_scene_buffer_ptr,
      get_scene_buffer_len: mod.get_scene_buffer_len,
      get_scene_buffer_capacity: mod.get_scene_buffer_capacity,
      write_svg_to_buffer: mod.write_svg_to_buffer,
      get_svg_buffer_ptr: mod.get_svg_buffer_ptr,
      get_svg_buffer_len: mod.get_svg_buffer_len,
      command_buffer_ptr: mod.command_buffer_ptr,
      command_buffer_capacity: mod.command_buffer_capacity,
      flush_commands: mod.flush_commands,
      import_drawio: mod.import_drawio,
      export_drawio: mod.export_drawio,
      export_drawio_fresh_engine: mod.export_drawio_fresh_engine,
      undo: mod.undo,
      redo: mod.redo,
      engine_can_undo: mod.engine_can_undo,
      engine_can_redo: mod.engine_can_redo,
      connect_vertices: mod.connect_vertices,
      disconnect_edge: mod.disconnect_edge,
      parse_stencil_xml: mod.parse_stencil_xml,
      parse_stencil_library_xml: mod.parse_stencil_library_xml,
      set_stencil_library: mod.set_stencil_library,
      get_resolved_style: mod.get_resolved_style,
      get_metadata: mod.get_metadata,
      set_metadata: mod.set_metadata,
      apply_layout: mod.apply_layout,
      apply_hierarchical_layout: mod.apply_hierarchical_layout,
      route_all_edges: mod.route_all_edges,
      insert_bend: mod.insert_bend,
      move_bend: mod.move_bend,
      remove_bend: mod.remove_bend,
      group_vertices: mod.group_vertices,
      ungroup_vertices: mod.ungroup_vertices,
      connect_vertices_anchored: mod.connect_vertices_anchored,
      set_edge_anchor: mod.set_edge_anchor,
      clear_edge_anchor: mod.clear_edge_anchor,
      get_edge_anchors: mod.get_edge_anchors,
      set_page_math_enabled: mod.set_page_math_enabled,
      // ─── Layer queries (IP-F PR5) ───────────────────────────────────────
      // After WASM rebuild: mod.get_page_layers will exist
      // Before rebuild: use a stub so the app loads (panel will show error state)
      get_page_layers: (mod as Record<string, unknown>).get_page_layers as ((h: number, p: number) => string) ?? (() => '{\"page_idx\":0,\"layers\":[]}') as ((h: number, p: number) => string),
      // ─── Selection (Slice 3) ───────────────────────────────────────────
      // After WASM rebuild: mod.{resolve_selection,select_target,clear_selection,get_selection} will exist
      // Before rebuild: use stubs so the app loads
      resolve_selection: ((mod as Record<string, unknown>).resolve_selection as WasmModule['resolve_selection']) ?? (() => '{"type":"None"}'),
      select_target: ((mod as Record<string, unknown>).select_target as WasmModule['select_target']) ?? (() => {}),
      clear_selection: ((mod as Record<string, unknown>).clear_selection as WasmModule['clear_selection']) ?? (() => {}),
      get_selection: ((mod as Record<string, unknown>).get_selection as WasmModule['get_selection']) ?? (() => '[]'),
    };

    return ok(wasm);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
