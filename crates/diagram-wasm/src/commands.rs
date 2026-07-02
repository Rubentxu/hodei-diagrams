//! Command execution: translate JSON commands to engine calls.

use crate::engine::{WasmStencilProvider, with_engine, with_engine_mut};
use diagram_commands::selection_service::SelectionService;
use diagram_commands::{Command, RoutingKind, Transaction};
use diagram_core::geometry::CellGeometry;
use diagram_core::selection::{HitTester, SelectionModifiers, SelectionTarget};
use diagram_core::{Group, PageId, VertexId};
use diagram_scene::resolver::StyleResolver;
use diagram_scene::{ResolvedStyle, SceneBuilder};
use wasm_bindgen::prelude::*;

/// Execute a command on an engine from a JSON string.
///
/// The JSON must match the `Command` enum shape:
/// `{"AddVertex":{...}}` (externally tagged)
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `InvalidCommand: <json_error>` if the JSON is malformed
/// - `Execute: <command_error>` if the command could not be applied
#[wasm_bindgen]
pub fn execute_command(handle: u32, cmd_json: &str) -> Result<(), JsValue> {
    let cmd = match serde_json::from_str::<Command>(cmd_json) {
        Ok(c) => c,
        Err(e) => return Err(JsValue::from_str(&format!("InvalidCommand: {e}"))),
    };
    with_engine_mut(handle, |e| e.editor.execute(cmd))
        .and_then(|r| r.map_err(|e| Box::leak(format!("Execute: {e}").into_boxed_str()) as &str))
        .map_err(JsValue::from_str)
}

/// Execute a transaction (atomic batch) from a JSON string containing an array of commands.
///
/// The JSON must be a `Vec<Command>`: `[{"AddVertex":{...}}, {"MoveVertex":{...}}, ...]`.
/// All commands are applied atomically: on success, one history entry is pushed;
/// on error, all applied commands are rolled back.
///
/// Empty array (`[]`) is a no-op: succeeds without pushing to history.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `InvalidCommand: <json_error>` if the JSON is malformed
/// - `Execute: <command_error>` if a command could not be applied (transaction rolled back)
#[wasm_bindgen]
pub fn execute_transaction(handle: u32, commands_json: &str) -> Result<(), JsValue> {
    let cmds: Vec<Command> = match serde_json::from_str(commands_json) {
        Ok(c) => c,
        Err(e) => return Err(JsValue::from_str(&format!("InvalidCommand: {e}"))),
    };

    // Empty array — no-op per spec V18
    if cmds.is_empty() {
        return Ok(());
    }

    // Build transaction via the builder API and commit atomically.
    // Each builder method takes ownership of the extracted fields and returns a new Transaction.
    let tx = cmds.into_iter().fold(Transaction::new(), |tx, cmd| {
        match cmd {
            Command::AddVertex(p) => tx.add_vertex(p.vertex),
            Command::RemoveVertex(p) => tx.remove_vertex(p.id),
            Command::MoveVertex(p) => tx.move_vertex(p.id, p.geometry),
            Command::EditVertexLabel(p) => {
                // Label is Option<Label>; skip if None (clear label case)
                if let Some(label) = p.label {
                    tx.edit_vertex_label(p.id, label)
                } else {
                    tx
                }
            }
            Command::EditEdgeLabel(p) => {
                if let Some(label) = p.label {
                    tx.edit_edge_label(p.id, label)
                } else {
                    tx
                }
            }
            Command::AddEdge(p) => tx.add_edge(p.edge),
            Command::RemoveEdge(p) => tx.remove_edge(p.id),
            Command::ChangeStyle(p) => tx.change_style(p.id, p.style),
            Command::AddGroup(p) => tx.add_group(p.group),
            Command::RemoveGroup(p) => tx.remove_group(p.id),
            Command::AddPage(p) => tx.add_page(p.page),
            Command::RemovePage(p) => tx.remove_page(p.id),
            Command::RenamePage(p) => tx.rename_page(p.id, p.name),
            // RotateVertex and FlipVertex require Editor's built-in rotation/flip logic
            // (angle delta is relative, not absolute). Skip in transaction path for now.
            Command::RotateVertex(_) => tx,
            Command::FlipVertex(_) => tx,
            // Z-order commands: route through transaction builder methods
            // (added in the cycle 6 fix; previously these were no-ops which
            // meant TS editor's bringToFront/sendToBack/bringForward/sendBackward
            // calls silently failed).
            Command::BringToFront(p) => tx.bring_to_front(p.target),
            Command::SendToBack(p) => tx.send_to_back(p.target),
            Command::BringForward(p) => tx.bring_forward(p.target),
            Command::SendBackward(p) => tx.send_backward(p.target),
            // ConnectVertices and DisconnectEdge have their own dedicated WASM functions
            Command::ConnectVertices(_) => tx,
            Command::DisconnectEdge(_) => tx,
            // SetEdgeLabelOffset has a dedicated WASM function, but also handle via transaction
            Command::SetEdgeLabelOffset(p) => tx.set_edge_label_offset(p.id, p.offset),
            // SetPageMathEnabled: enable/disable math typesetting on a page
            Command::SetPageMathEnabled(p) => tx.set_page_math_enabled(p.page_id, p.enabled),
            // IP-F Layer commands
            Command::AddLayer(p) => tx.add_layer(p.page_id, p.name),
            Command::RemoveLayer(p) => tx.remove_layer(p.layer_id),
            Command::RenameLayer(p) => tx.rename_layer(p.layer_id, p.name),
            Command::SetLayerVisible(p) => tx.set_layer_visible(p.layer_id, p.visible),
            Command::SetLayerLocked(p) => tx.set_layer_locked(p.layer_id, p.locked),
            Command::MoveShapeToLayer(p) => {
                tx.move_shape_to_layer(p.vertex_ids, p.edge_ids, p.layer_id)
            }
            // Handle any future variants gracefully (non_exhaustive)
            _ => tx,
        }
    });

    with_engine_mut(handle, |e| tx.commit(&mut e.editor))
        .and_then(|r| r.map_err(|e| Box::leak(format!("Execute: {e}").into_boxed_str()) as &str))
        .map_err(JsValue::from_str)
}

/// Undo the last command (or transaction) on an engine.
///
/// No-op if undo history is empty.
#[wasm_bindgen]
pub fn undo(handle: u32) -> Result<(), JsValue> {
    with_engine_mut(handle, |e| e.editor.undo())
        .and_then(|r| r.map_err(|e| Box::leak(format!("{e}").into_boxed_str()) as &str))
        .map_err(JsValue::from_str)
}

/// Redo the last undone command (or transaction) on an engine.
///
/// No-op if redo history is empty.
#[wasm_bindgen]
pub fn redo(handle: u32) -> Result<(), JsValue> {
    with_engine_mut(handle, |e| e.editor.redo())
        .and_then(|r| r.map_err(|e| Box::leak(format!("{e}").into_boxed_str()) as &str))
        .map_err(JsValue::from_str)
}

/// Check if undo is available on an engine.
#[wasm_bindgen]
pub fn engine_can_undo(handle: u32) -> Result<bool, JsValue> {
    match with_engine(handle, |e| e.editor.can_undo()) {
        Ok(v) => Ok(v),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Check if redo is available on an engine.
#[wasm_bindgen]
pub fn engine_can_redo(handle: u32) -> Result<bool, JsValue> {
    match with_engine(handle, |e| e.editor.can_redo()) {
        Ok(v) => Ok(v),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Routing kind constants for connect_vertices (exported for TypeScript).
#[allow(dead_code)]
/// Orthogonal routing (right-angle edges).
pub const ROUTING_KIND_ORTHOGONAL: u32 = 0;
/// Straight line routing.
pub const ROUTING_KIND_STRAIGHT: u32 = 1;

fn routing_kind_from_u32(kind: u32) -> RoutingKind {
    match kind {
        1 => RoutingKind::Straight,
        _ => RoutingKind::Orthogonal,
    }
}

/// Find a vertex ID by its raw index (matches the `idx` field of SlotmapId).
fn find_vertex_by_idx(
    model: &diagram_core::DiagramModel,
    idx: u32,
) -> Option<diagram_core::VertexId> {
    model
        .store
        .vertices_with_ids()
        .find(|(vid, _)| {
            let json = match serde_json::to_value(vid) {
                Ok(v) => v,
                Err(_) => return false,
            };
            let json_idx = match json.get("idx") {
                Some(v) => match v.as_u64() {
                    Some(n) => n as u32,
                    None => return false,
                },
                None => return false,
            };
            json_idx == idx
        })
        .map(|(vid, _)| vid)
}

/// Find an edge ID by its raw index.
fn find_edge_by_idx(model: &diagram_core::DiagramModel, idx: u32) -> Option<diagram_core::EdgeId> {
    model
        .store
        .edges_with_ids()
        .find(|(eid, _)| {
            let json = match serde_json::to_value(eid) {
                Ok(v) => v,
                Err(_) => return false,
            };
            let json_idx = match json.get("idx") {
                Some(v) => match v.as_u64() {
                    Some(n) => n as u32,
                    None => return false,
                },
                None => return false,
            };
            json_idx == idx
        })
        .map(|(eid, _)| eid)
}

/// Find a page ID by insertion order index (0-based).
///
/// Note: this is NOT the slotmap internal `idx` — slotmap reuses slots, so
/// after deletes the internal idx of page N may be different from N. Instead,
/// we return the N-th page in insertion order, which is stable for the
/// lifetime of the engine and matches the JS-side `activePageIdx`.
fn find_page_by_idx(model: &diagram_core::DiagramModel, idx: u32) -> Option<PageId> {
    model
        .store
        .pages_with_ids()
        .nth(idx as usize)
        .map(|(pid, _)| pid)
}

/// Connect two vertices with an edge, using the specified routing algorithm.
///
/// `from` and `to` are the source and target vertex slotmap index values (the `idx` field from SlotmapId).
/// `routing_kind` is 0 for orthogonal (default) or 1 for straight.
/// `source_port` and `target_port` are 0 for auto, 1=N, 2=E, 3=S, 4=W.
///
/// Returns the new edge ID on success.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `ConnectError: <reason>` if the connection could not be made
#[wasm_bindgen]
pub fn connect_vertices(
    handle: u32,
    from: u32,
    to: u32,
    routing_kind: u32,
    source_port: u32,
    target_port: u32,
) -> Result<u32, JsValue> {
    let kind = routing_kind_from_u32(routing_kind);
    let src_port = port_from_u32(source_port);
    let tgt_port = port_from_u32(target_port);

    // First: validate handle (with_engine_mut returns Err on invalid handle)
    let result = with_engine_mut(handle, |e| {
        let from_id = match find_vertex_by_idx(e.editor.model(), from) {
            Some(id) => id,
            None => {
                return Err("ConnectError: source vertex not found");
            }
        };
        let to_id = match find_vertex_by_idx(e.editor.model(), to) {
            Some(id) => id,
            None => {
                return Err("ConnectError: target vertex not found");
            }
        };
        e.editor
            .connect_vertices_with_ports(from_id, to_id, kind, src_port, tgt_port)
            .map(|edge_id| {
                let json = match serde_json::to_value(edge_id) {
                    Ok(v) => v,
                    Err(_) => return 0u32,
                };
                match json.get("idx") {
                    Some(v) => v.as_u64().map(|n| n as u32).unwrap_or(0),
                    None => 0,
                }
            })
            .map_err(|e| Box::leak(format!("{e}").into_boxed_str()) as &str)
    });

    // Flatten: result is Result<Result<u32, &str>, &'static str>
    match result {
        Ok(Ok(edge_idx)) => Ok(edge_idx),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Convert a u32 port value to Option<Direction>.
/// 0 = auto (None), 1 = North, 2 = East, 3 = South, 4 = West.
fn port_from_u32(port: u32) -> Option<diagram_routing::Direction> {
    match port {
        1 => Some(diagram_routing::Direction::North),
        2 => Some(diagram_routing::Direction::East),
        3 => Some(diagram_routing::Direction::South),
        4 => Some(diagram_routing::Direction::West),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verify that an empty JSON array parses as an empty Vec<Command>.
    /// This is the prerequisite for the V18 no-op behavior.
    #[test]
    fn execute_transaction_empty_array_parses() {
        let parsed: Vec<Command> = serde_json::from_str("[]").expect("empty array must parse");
        assert!(parsed.is_empty());
    }

    /// Verify that a BringToFront command JSON deserializes correctly.
    /// This is the shape the TS editor emits for z-order operations.
    #[test]
    fn bring_to_front_json_deserializes() {
        let json = r#"[{"BringToFront":{"target":{"kind":"Vertex","idx":1,"version":1}}}]"#;
        let parsed: Vec<Command> = serde_json::from_str(json)
            .expect("BringToFront JSON emitted by TS editor must deserialize");
        assert_eq!(parsed.len(), 1);
        assert!(matches!(parsed[0], Command::BringToFront(_)));
    }

    /// Verify that a single AddVertex command parses correctly.
    #[test]
    fn execute_transaction_single_command_parses() {
        // Build a valid Vec<Command> JSON array using serde_json::json!
        let cmds = serde_json::json!([
            {
                "AddVertex": {
                    "vertex": {
                        "geometry": {"x": 0.0, "y": 0.0, "width": 100.0, "height": 50.0, "relative": false, "rotation": 0.0, "flip_h": false, "flip_v": false},
                        "label": {"text": "Test"},
                        "page_id": {"idx": 0, "version": 0},
                        "parent": null,
                        "style_id": null,
                        "z_order": 0,
                        "locked": false,
                        "visible": true
                    }
                }
            }
        ]);
        let json = serde_json::to_string(&cmds).unwrap();
        let parsed: Vec<Command> =
            serde_json::from_str(&json).expect("single AddVertex must parse");
        assert_eq!(parsed.len(), 1);
        match &parsed[0] {
            Command::AddVertex(p) => {
                assert_eq!(p.vertex.geometry.as_ref().unwrap().x, 0.0);
                assert_eq!(p.vertex.geometry.as_ref().unwrap().y, 0.0);
            }
            _ => panic!("expected AddVertex"),
        }
    }

    /// Verify that multiple commands (MoveVertex + RemoveVertex) parse correctly.
    #[test]
    fn execute_transaction_multiple_commands_parses() {
        let cmds = serde_json::json!([
            {
                "MoveVertex": {
                    "id": {"idx": 1, "version": 0},
                    "geometry": {"x": 50.0, "y": 50.0, "width": 100.0, "height": 50.0, "relative": false, "rotation": 0.0, "flip_h": false, "flip_v": false}
                }
            },
            {
                "RemoveVertex": {
                    "id": {"idx": 2, "version": 0}
                }
            }
        ]);
        let json = serde_json::to_string(&cmds).unwrap();
        let parsed: Vec<Command> =
            serde_json::from_str(&json).expect("multi-command array must parse");
        assert_eq!(parsed.len(), 2);
        match &parsed[0] {
            Command::MoveVertex(_) => {}
            _ => panic!("expected MoveVertex"),
        }
        match &parsed[1] {
            Command::RemoveVertex(_) => {}
            _ => panic!("expected RemoveVertex"),
        }
    }

    /// Verify resolve_returns_nulls_when_no_effects.
    #[test]
    fn resolve_returns_nulls_when_no_effects() {
        use diagram_core::StyleMap;
        use diagram_scene::resolver::StyleResolver;

        let map = StyleMap::new();
        let resolved = StyleResolver::new().resolve(&map);
        assert!(resolved.shadow.is_none());
        assert!(resolved.glass.is_none());
        assert!(resolved.gradient.is_none());
        assert!(resolved.fill_color.is_none());
    }

    /// Verify resolve_is_stateless_repeatable.
    #[test]
    fn resolve_is_stateless_repeatable() {
        use diagram_core::StyleMap;
        use diagram_scene::resolver::StyleResolver;

        let mut map = StyleMap::new();
        map.insert("fillColor", "#dae8fc");
        map.insert("shadow", "1");
        map.insert("shadowDx", "5");
        map.insert("shadowDy", "5");
        map.insert("shadowBlur", "3");
        map.insert("shadowColor", "#00000040");

        let resolver = StyleResolver::new();
        let first = resolver.resolve(&map);
        let second = resolver.resolve(&map);
        assert_eq!(first, second);
    }

    /// Verify resolve_preserves_unknown_keys_in_remaining.
    #[test]
    fn resolve_preserves_unknown_keys_in_remaining() {
        use diagram_core::StyleMap;
        use diagram_scene::resolver::StyleResolver;

        let mut map = StyleMap::new();
        map.insert("fillColor", "#ffffff");
        map.insert("customKey", "foo");

        let resolved = StyleResolver::new().resolve(&map);
        assert_eq!(resolved.fill_color, Some("#ffffff".to_owned()));
        assert_eq!(resolved.remaining.len(), 1);
        assert_eq!(
            resolved.remaining.get("customKey").map(|v| v.as_str()),
            Some("foo")
        );
    }

    /// Verify `serialize_resolved_style(&ResolvedStyle::default())` produces a
    /// valid JSON object with all-null typed fields and an empty `remaining`
    /// map. This is what `get_resolved_style` MUST produce for style-less
    /// vertices (vertices with `style_id: None`) instead of throwing
    /// `VertexHasNoStyle`. The TS UI depends on this when the user selects
    /// a vertex loaded from a minimal `.drawio` fixture (e.g.
    /// `simple-rect.drawio` which has `<mxCell id="2" vertex="1"><mxGeometry/></mxCell>`).
    #[test]
    fn serialize_default_style_produces_all_null_fields() {
        let s = ResolvedStyle::default();
        let json = serialize_resolved_style(&s);
        let parsed: serde_json::Value = serde_json::from_str(&json)
            .expect("default ResolvedStyle should serialize to valid JSON");
        for field in [
            "fill_color",
            "stroke_color",
            "stroke_width",
            "rounded",
            "dashed",
            "font_color",
            "font_size",
            "font_family",
            "opacity",
            "shadow",
            "glass",
            "gradient",
            "end_arrow",
            "start_arrow",
        ] {
            assert!(
                parsed[field].is_null(),
                "{field} should be null in default ResolvedStyle JSON, got: {}",
                parsed[field]
            );
        }
        assert!(
            parsed["remaining"].is_object(),
            "remaining should be an empty object, got: {}",
            parsed["remaining"]
        );
        assert_eq!(
            parsed["remaining"].as_object().unwrap().len(),
            0,
            "default remaining should have no entries"
        );
    }
}

/// Disconnect an edge (remove it from the model).
///
/// `edge_id` is the edge's slotmap index value (the `idx` field from SlotmapId).
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `DisconnectError: <reason>` if the edge could not be removed
#[wasm_bindgen]
pub fn disconnect_edge(handle: u32, edge_id: u32) -> Result<(), JsValue> {
    let result = with_engine_mut(handle, |e| {
        let eid = match find_edge_by_idx(e.editor.model(), edge_id) {
            Some(id) => id,
            None => {
                return Err("DisconnectError: edge not found");
            }
        };
        e.editor
            .disconnect_edge(eid)
            .map_err(|e| Box::leak(format!("{e}").into_boxed_str()) as &str)
    });

    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Serialize a `ResolvedStyle` to a JSON string. On serialization failure
/// returns a stable, static error string the WASM bridge can surface.
fn serialize_resolved_style(style: &ResolvedStyle) -> String {
    serde_json::to_string(style).unwrap_or_else(|e| format!("Serialize: {e}"))
}

/// Get the resolved style for a vertex.
///
/// `handle` is the engine handle (u32).
/// `vertex_id` is the vertex slotmap index (the `idx` field from SlotmapId).
///
/// Returns a JSON string of the resolved `ResolvedStyle` with typed effect fields,
/// or an error string if the vertex is not found.
///
/// If the vertex has no style assigned (`style_id: None`), returns the default
/// `ResolvedStyle` (all-null typed fields) — draw.io treats absence of style
/// as "use defaults" rather than an error. Returning `VertexHasNoStyle` here
/// surfaced a spurious error banner every time a user selected a bare vertex
/// loaded from a minimal `.drawio` fixture (e.g. `simple-rect.drawio`).
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `VertexNotFound` if the vertex ID does not exist in the model
/// - `StyleNotFound` if the vertex has a `style_id` pointing to a missing style
#[wasm_bindgen]
pub fn get_resolved_style(handle: u32, vertex_id: u32) -> Result<JsValue, JsValue> {
    let result = with_engine(handle, |e| {
        // Find the vertex by its slotmap index
        let vid = match find_vertex_by_idx(e.editor.model(), vertex_id) {
            Some(v) => v,
            None => {
                return Err("VertexNotFound");
            }
        };

        // Look up the vertex in the store
        let vertex = match e.editor.model().store.vertex(vid) {
            Some(v) => v,
            None => {
                return Err("VertexNotFound");
            }
        };

        // No style assigned: return the default ResolvedStyle (all-null typed
        // fields). draw.io treats absence of style as "use defaults" rather than
        // an error; the TS UI relies on this when selecting bare vertices
        // loaded from minimal `.drawio` fixtures (e.g. `simple-rect.drawio`).
        // Returning an error here surfaced a spurious `VertexHasNoStyle`
        // banner every time a user selected such a shape.
        let style_id = match vertex.style_id {
            Some(sid) => sid,
            None => return Ok(serialize_resolved_style(&ResolvedStyle::default())),
        };

        // Look up the StyleMap
        let style = match e.editor.model().store.style(style_id) {
            Some(s) => s,
            None => {
                return Err("StyleNotFound");
            }
        };

        // Resolve the style
        let resolver = StyleResolver::new();
        let resolved = resolver.resolve(style);

        // Serialize to JSON
        Ok(serialize_resolved_style(&resolved))
    });

    // Flatten the nested Result: Result<Result<String, &str>, &'static str>
    match result {
        Ok(Ok(json)) => Ok(JsValue::from_str(&json)),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Group selected vertices into a new container group.
///
/// `vertex_indices_json` is a JSON array of vertex slotmap index values (the `idx` field from SlotmapId).
///
/// Computes the bounding box of all vertices, creates a group with that geometry,
/// and sets each vertex's parent to the new group.
///
/// Two undo steps: first undo clears parent links, second undo removes the group.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `GroupVertices: <reason>` on other errors
#[wasm_bindgen]
pub fn group_vertices(handle: u32, vertex_indices_json: &str) -> Result<(), JsValue> {
    let result = with_engine_mut(handle, |e| {
        // Parse vertex indices
        let indices: Vec<u32> = serde_json::from_str(vertex_indices_json)
            .map_err(|_| "GroupVertices: invalid indices JSON")?;

        if indices.len() < 2 {
            return Err("GroupVertices: need at least 2 vertices");
        }

        // Find VertexIds from indices
        let vids: Vec<VertexId> = indices
            .iter()
            .filter_map(|&idx| find_vertex_by_idx(e.editor.model(), idx))
            .collect();

        if vids.len() < 2 {
            return Err("GroupVertices: not enough valid vertices found");
        }

        let store = &e.editor.model().store;

        // Compute bounding box from all vertices' geometry
        let (min_x, min_y, max_x, max_y) = vids
            .iter()
            .filter_map(|vid| store.vertex(*vid).and_then(|v| v.geometry))
            .fold(
                (f64::MAX, f64::MAX, f64::MIN, f64::MIN),
                |(minx, miny, maxx, maxy), g| {
                    (
                        minx.min(g.x),
                        miny.min(g.y),
                        maxx.max(g.x + g.width),
                        maxy.max(g.y + g.height),
                    )
                },
            );

        let page_id = store.vertex(vids[0]).and_then(|v| v.page_id);
        let z_order = store.max_z_order(page_id.unwrap_or_default()) + 1;

        // Create group with bounding box geometry
        let group = Group {
            label: None,
            style_id: None,
            page_id,
            geometry: Some(CellGeometry {
                x: min_x,
                y: min_y,
                width: (max_x - min_x).max(1.0),
                height: (max_y - min_y).max(1.0),
                relative: false,
                ..Default::default()
            }),
            z_order,
            locked: false,
            visible: true,
            parent: None,
            layer_id: None,
        };

        // Step 1: Insert group imperatively to get the GroupId
        let gid = e.editor.model_mut().store.insert_group(group.clone());

        // Step 2: Build transaction with SetVertexParent for each vertex
        let mut tx = Transaction::new();
        for vid in &vids {
            tx = tx.set_vertex_parent(*vid, Some(gid));
        }

        tx.commit(&mut e.editor)
            .map_err(|err| Box::leak(format!("GroupVertices: {}", err).into_boxed_str()) as &str)
    });

    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Ungroup a vertex by removing it from its parent group.
///
/// `vertex_idx` is the vertex's slotmap index value (the `idx` field from SlotmapId).
///
/// Finds the parent group of the vertex, clears the parent link for all vertices
/// in that group, and removes the group itself.
///
/// Single undo step removes the group and restores parent links.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `UngroupVertices: <reason>` on other errors
#[wasm_bindgen]
pub fn ungroup_vertices(handle: u32, vertex_idx: u32) -> Result<(), JsValue> {
    let result = with_engine_mut(handle, |e| {
        // Find the vertex
        let vid = find_vertex_by_idx(e.editor.model(), vertex_idx)
            .ok_or("UngroupVertices: vertex not found")?;

        // Get its parent group
        let parent_gid = {
            let vertex = e
                .editor
                .model()
                .store
                .vertex(vid)
                .ok_or("UngroupVertices: vertex not found")?;
            vertex
                .parent
                .ok_or("UngroupVertices: vertex has no parent group")?
        };

        // Find all vertices with that parent
        let siblings: Vec<VertexId> = e
            .editor
            .model()
            .store
            .vertices_with_ids()
            .filter(|(_, v)| v.parent == Some(parent_gid))
            .map(|(vid, _)| vid)
            .collect();

        if siblings.is_empty() {
            return Err("UngroupVertices: no siblings found in group");
        }

        // Build transaction: clear parent for all siblings, then remove group
        let mut tx = Transaction::new();
        for sibling_vid in &siblings {
            tx = tx.set_vertex_parent(*sibling_vid, None);
        }
        tx = tx.remove_group(parent_gid);

        tx.commit(&mut e.editor)
            .map_err(|err| Box::leak(format!("UngroupVertices: {}", err).into_boxed_str()) as &str)
    });

    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Set an edge's label offset, allowing labels to be repositioned along the edge.
///
/// `handle` is the engine handle (u32).
/// `edge_idx` is the edge's slotmap index (the `idx` field from SlotmapId).
/// `dx` and `dy` are the offset from the edge midpoint.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `SetEdgeLabelOffset: edge not found` if the edge ID does not exist
#[wasm_bindgen]
pub fn set_edge_label_offset(handle: u32, edge_idx: u32, dx: f64, dy: f64) -> Result<(), JsValue> {
    let result = with_engine_mut(handle, |e| {
        let eid = match find_edge_by_idx(e.editor.model(), edge_idx) {
            Some(id) => id,
            None => {
                return Err("SetEdgeLabelOffset: edge not found");
            }
        };
        let tx = Transaction::new().set_edge_label_offset(eid, Some((dx, dy)));
        tx.commit(&mut e.editor)
            .map_err(|err| Box::leak(format!("{err}").into_boxed_str()) as &str)
    });

    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Clear an edge's label offset, resetting the label to the edge midpoint.
///
/// `handle` is the engine handle (u32).
/// `edge_idx` is the edge's slotmap index (the `idx` field from SlotmapId).
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `ClearEdgeLabelOffset: edge not found` if the edge ID does not exist
#[wasm_bindgen]
pub fn clear_edge_label_offset(handle: u32, edge_idx: u32) -> Result<(), JsValue> {
    let result = with_engine_mut(handle, |e| {
        let eid = match find_edge_by_idx(e.editor.model(), edge_idx) {
            Some(id) => id,
            None => {
                return Err("ClearEdgeLabelOffset: edge not found");
            }
        };
        let tx = Transaction::new().set_edge_label_offset(eid, None);
        tx.commit(&mut e.editor)
            .map_err(|err| Box::leak(format!("{err}").into_boxed_str()) as &str)
    });

    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Set whether math typesetting is enabled on a page.
///
/// `handle` is the engine handle (u32).
/// `page_idx` is the page's slotmap index (the `idx` field from SlotmapId).
/// `enabled` is true to enable math rendering, false to disable.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `SetPageMathEnabled: page not found` if the page ID does not exist
#[wasm_bindgen]
pub fn set_page_math_enabled(handle: u32, page_idx: u32, enabled: bool) -> Result<(), JsValue> {
    let result = with_engine_mut(handle, |e| {
        let pid = match find_page_by_idx(e.editor.model(), page_idx) {
            Some(id) => id,
            None => {
                return Err("SetPageMathEnabled: page not found");
            }
        };
        let tx = Transaction::new().set_page_math_enabled(pid, enabled);
        tx.commit(&mut e.editor)
            .map_err(|err| Box::leak(format!("{err}").into_boxed_str()) as &str)
    });

    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

// =============================================================================
// Connection Points — Anchor WASM Commands
// =============================================================================

use crate::types::EdgeAnchorsDto;
use diagram_core::style::{StyleMap, StyleValue};
use diagram_routing::{Anchor, AnchorEnd, Direction, anchor_to_style_keys, style_keys_to_anchor};

#[allow(clippy::too_many_arguments)]
/// Connect two vertices with an edge, using the specified anchors for source and target.
///
/// `from` and `to` are the source and target vertex slotmap index values (the `idx` field from SlotmapId).
/// `source_kind` and `target_kind` are anchor kind strings: "auto", "north", "south", "east", "west", or "normalized".
/// For "normalized" kind, provide the nx/ny coordinates; for other kinds, nx/ny are ignored.
///
/// Returns the new edge ID on success.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `ConnectError: <reason>` if the connection could not be made
#[wasm_bindgen]
pub fn connect_vertices_anchored(
    handle: u32,
    from: u32,
    to: u32,
    source_kind: String,
    source_nx: f64,
    source_ny: f64,
    target_kind: String,
    target_nx: f64,
    target_ny: f64,
) -> Result<u32, JsValue> {
    let result = with_engine_mut(handle, |e| {
        let from_id = match find_vertex_by_idx(e.editor.model(), from) {
            Some(id) => id,
            None => {
                return Err("ConnectError: source vertex not found");
            }
        };
        let to_id = match find_vertex_by_idx(e.editor.model(), to) {
            Some(id) => id,
            None => {
                return Err("ConnectError: target vertex not found");
            }
        };

        // Parse source anchor
        let source_anchor = parse_anchor_from_strings(&source_kind, source_nx, source_ny)?;
        let target_anchor = parse_anchor_from_strings(&target_kind, target_nx, target_ny)?;

        // Create the edge first using the editor's connect_vertices
        let edge_id = e
            .editor
            .connect_vertices(from_id, to_id, diagram_commands::RoutingKind::Orthogonal)
            .map_err(|err| Box::leak(format!("ConnectError: {}", err).into_boxed_str()) as &str)?;

        // Now set the anchor style on the edge
        set_edge_anchor_style(
            e.editor.model_mut(),
            edge_id,
            AnchorEnd::Source,
            &source_anchor,
        )?;
        set_edge_anchor_style(
            e.editor.model_mut(),
            edge_id,
            AnchorEnd::Target,
            &target_anchor,
        )?;

        // Return the edge index
        let json = match serde_json::to_value(edge_id) {
            Ok(v) => v,
            Err(_) => return Err("ConnectError: failed to serialize edge ID"),
        };
        match json.get("idx") {
            Some(v) => Ok(v.as_u64().map(|n| n as u32).unwrap_or(0)),
            None => Ok(0),
        }
    });

    match result {
        Ok(Ok(edge_idx)) => Ok(edge_idx),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Parse anchor from string kind and normalized coordinates.
fn parse_anchor_from_strings(kind: &str, nx: f64, ny: f64) -> Result<Anchor, &'static str> {
    match kind.trim().to_lowercase().as_str() {
        "auto" => Ok(Anchor::Auto),
        "north" => Ok(Anchor::Cardinal(Direction::North)),
        "south" => Ok(Anchor::Cardinal(Direction::South)),
        "east" => Ok(Anchor::Cardinal(Direction::East)),
        "west" => Ok(Anchor::Cardinal(Direction::West)),
        "normalized" => Ok(Anchor::Normalized { nx, ny }),
        _ => Err("ConnectError: invalid source_anchor_kind"),
    }
}

/// Set anchor style keys on an edge's style.
fn set_edge_anchor_style(
    model: &mut diagram_core::DiagramModel,
    edge_id: diagram_core::EdgeId,
    end: AnchorEnd,
    anchor: &Anchor,
) -> Result<(), &'static str> {
    // Get the current style_id for the edge
    let style_id = {
        let edge = model.store.edge(edge_id).ok_or("EdgeNotFound")?;
        edge.style_id
    };

    // Clone the existing style or create a new one
    let mut style = style_id
        .and_then(|sid| model.store.style(sid).cloned())
        .unwrap_or_default();

    // For the anchor end we're setting, remove any existing anchor keys
    let (exit_prefix, entry_prefix) = match end {
        AnchorEnd::Source => ("exit", "entry"),
        AnchorEnd::Target => ("exit", "entry"),
    };

    // Remove existing exit/entry keys for this end
    style.remove(exit_prefix);
    style.remove(&format!("{}X", exit_prefix));
    style.remove(&format!("{}Y", exit_prefix));
    style.remove(&format!("{}Perimeter", exit_prefix));
    style.remove(entry_prefix);
    style.remove(&format!("{}X", entry_prefix));
    style.remove(&format!("{}Y", entry_prefix));
    style.remove(&format!("{}Perimeter", entry_prefix));

    // Add the new anchor keys
    let keys = anchor_to_style_keys(anchor, end);
    for (key, value) in keys {
        style.insert(key, StyleValue(value));
    }

    // Insert the modified style
    let new_style_id = model.store.insert_style(style);

    // Now update the edge with the new style_id
    let edge = model.store.edge_mut(edge_id).ok_or("EdgeNotFound")?;
    edge.style_id = Some(new_style_id);

    Ok(())
}

/// Set an edge's anchor on a specific end (source or target).
///
/// `edge_idx` is the edge's slotmap index (the `idx` field from SlotmapId).
/// `end` is 0 for source, 1 for target.
/// `anchor_kind` is "auto", "north", "south", "east", "west", or "normalized".
/// For "normalized", nx and ny specify the position; otherwise they are ignored.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `EdgeNotFound` if the edge does not exist
#[wasm_bindgen]
pub fn set_edge_anchor(
    handle: u32,
    edge_idx: u32,
    end: u32,
    anchor_kind: String,
    nx: f64,
    ny: f64,
) -> Result<(), JsValue> {
    let anchor_end = match end {
        0 => AnchorEnd::Source,
        1 => AnchorEnd::Target,
        _ => {
            return Err(JsValue::from_str(
                "set_edge_anchor: end must be 0 (source) or 1 (target)",
            ));
        }
    };

    let result = with_engine_mut(handle, |e| {
        let eid = match find_edge_by_idx(e.editor.model(), edge_idx) {
            Some(id) => id,
            None => {
                return Err("EdgeNotFound");
            }
        };

        let anchor = parse_anchor_from_strings(&anchor_kind, nx, ny)?;
        set_edge_anchor_style(e.editor.model_mut(), eid, anchor_end, &anchor)
            .map_err(|err| Box::leak(err.to_string().into_boxed_str()) as &str)
    });

    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Clear an edge's anchor on a specific end (source or target), resetting it to Auto.
///
/// `edge_idx` is the edge's slotmap index (the `idx` field from SlotmapId).
/// `end` is 0 for source, 1 for target.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `EdgeNotFound` if the edge does not exist
#[wasm_bindgen]
pub fn clear_edge_anchor(handle: u32, edge_idx: u32, end: u32) -> Result<(), JsValue> {
    let anchor_end = match end {
        0 => AnchorEnd::Source,
        1 => AnchorEnd::Target,
        _ => {
            return Err(JsValue::from_str(
                "clear_edge_anchor: end must be 0 (source) or 1 (target)",
            ));
        }
    };

    let result = with_engine_mut(handle, |e| {
        let eid = match find_edge_by_idx(e.editor.model(), edge_idx) {
            Some(id) => id,
            None => {
                return Err("EdgeNotFound");
            }
        };

        set_edge_anchor_style(e.editor.model_mut(), eid, anchor_end, &Anchor::Auto)
            .map_err(|err| Box::leak(err.to_string().into_boxed_str()) as &str)
    });

    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Get the anchor information for an edge.
///
/// `edge_idx` is the edge's slotmap index (the `idx` field from SlotmapId).
///
/// Returns an `EdgeAnchorsDto` with the source and target anchor information.
/// Anchor kind is "auto", "north", "south", "east", "west", or "normalized".
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `EdgeNotFound` if the edge does not exist
#[wasm_bindgen]
pub fn get_edge_anchors(handle: u32, edge_idx: u32) -> Result<JsValue, JsValue> {
    let result = with_engine(handle, |e| {
        let eid = match find_edge_by_idx(e.editor.model(), edge_idx) {
            Some(id) => id,
            None => {
                return Err("EdgeNotFound");
            }
        };

        let edge = e.editor.model().store.edge(eid).ok_or("EdgeNotFound")?;

        // Get or create style
        let style = match edge.style_id {
            Some(sid) => e
                .editor
                .model()
                .store
                .style(sid)
                .cloned()
                .unwrap_or_default(),
            None => StyleMap::new(),
        };

        // Resolve source and target anchors
        let source_anchor = style_keys_to_anchor(&style, AnchorEnd::Source);
        let target_anchor = style_keys_to_anchor(&style, AnchorEnd::Target);

        // Convert to DTO strings
        let (source_kind, source_nx, source_ny) = anchor_to_dto_parts(&source_anchor);
        let (target_kind, target_nx, target_ny) = anchor_to_dto_parts(&target_anchor);

        let dto = EdgeAnchorsDto {
            source_anchor_kind: source_kind,
            source_nx,
            source_ny,
            target_anchor_kind: target_kind,
            target_nx,
            target_ny,
        };

        serde_json::to_string(&dto)
            .map_err(|err| Box::leak(format!("Serialize: {}", err).into_boxed_str()) as &str)
    });

    match result {
        Ok(Ok(json)) => Ok(JsValue::from_str(&json)),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Convert an anchor to kind string and normalized coordinates.
fn anchor_to_dto_parts(anchor: &Anchor) -> (String, f64, f64) {
    match anchor {
        Anchor::Auto => ("auto".to_string(), 0.0, 0.0),
        Anchor::Cardinal(dir) => {
            let kind = match dir {
                Direction::North => "north",
                Direction::South => "south",
                Direction::East => "east",
                Direction::West => "west",
            };
            (kind.to_string(), 0.0, 0.0)
        }
        Anchor::Normalized { nx, ny } => ("normalized".to_string(), *nx, *ny),
    }
}

// ─── Zero-copy command buffer (Phase 2 / P2-3 Phase B) ─────────────────────
//
// JS writes postcard-encoded `Vec<Command>` bytes to a pre-allocated
// slab in WASM linear memory. Rust deserializes via postcard and applies
// as a single atomic transaction. JS reads via Uint8Array view (no copy,
// no JSON.parse on the Rust side).
//
// Safety contract: never hold a view across a WASM call.

/// Get the raw pointer to the command buffer data. JS writes via
/// `new Uint8Array(wasm.memory.buffer, ptr, capacity)`.
#[wasm_bindgen]
pub fn command_buffer_ptr(handle: u32) -> usize {
    with_engine(handle, |e| e.buffers.command.as_ptr() as usize).unwrap_or(0)
}

/// Get the current capacity of the command buffer in bytes.
#[wasm_bindgen]
pub fn command_buffer_capacity(handle: u32) -> usize {
    with_engine(handle, |e| e.buffers.command.capacity()).unwrap_or(0)
}

/// Read commands from the command buffer (offset 0..written_len), apply
/// them as a single atomic transaction, and clear the buffer.
///
/// Returns an error if the bytes are not a valid postcard `Vec<Command>`.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `Postcard: <error>` if deserialization fails
/// - `Apply: <error>` if any command fails (transaction rolled back)
#[wasm_bindgen]
pub fn flush_commands(handle: u32, written_len: usize) -> Result<(), JsValue> {
    with_engine_mut(handle, |e| {
        // Read the bytes JS wrote into the buffer
        let bytes = e.buffers.command.as_bytes();
        if written_len > bytes.len() {
            return Err(Box::leak(
                format!("BufferLen: written={written_len} > cap={}", bytes.len()).into_boxed_str(),
            ) as &str);
        }
        let payload = &bytes[..written_len];

        // Deserialize the postcard-encoded Vec<Command>
        let cmds: Vec<Command> = postcard::from_bytes(payload)
            .map_err(|e| Box::leak(format!("Postcard: {e}").into_boxed_str()) as &str)?;

        // Apply as a single atomic batch (one undo reverses the whole batch).
        e.editor
            .execute_batch(cmds)
            .map_err(|err| Box::leak(format!("Apply: {err}").into_boxed_str()) as &str)?;
        e.buffers.command.clear();
        Ok(())
    })
    .and_then(|r| r)
    .map_err(JsValue::from_str)
}

/// Select a target by parsing a JSON serialized SelectionTarget.
///
/// JSON format: `{"type":"Vertex","id":{"idx":1,"version":1}}`
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `InvalidTarget: <json_error>` if the JSON is malformed
#[wasm_bindgen]
pub fn select_target(handle: u32, target_json: &str) -> Result<(), JsValue> {
    let target: SelectionTarget = serde_json::from_str(target_json)
        .map_err(|e| JsValue::from_str(&format!("InvalidTarget: {e}")))?;

    with_engine_mut(handle, |e| {
        e.editor.model_mut().selection_mut().select(target);
        Ok(())
    })
    .and_then(|r| r)
    .map_err(JsValue::from_str)
}

/// Clear all selections on an engine.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
#[wasm_bindgen]
pub fn clear_selection(handle: u32) -> Result<(), JsValue> {
    with_engine_mut(handle, |e| {
        e.editor.model_mut().selection_mut().clear();
        Ok(())
    })
    .and_then(|r| r)
    .map_err(JsValue::from_str)
}

/// Get the current selection as a JSON array of SelectionTarget.
///
/// Returns a JSON array like:
/// `[{"type":"Vertex","id":{"idx":1,"version":1}}]`
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
#[wasm_bindgen]
pub fn get_selection(handle: u32) -> Result<String, JsValue> {
    with_engine(handle, |e| {
        let selection = e.editor.model().selection();
        let targets: Vec<_> = selection.all().cloned().collect();
        serde_json::to_string(&targets)
            .map_err(|e| Box::leak(format!("Serialize: {e}").into_boxed_str()) as &str)
    })
    .and_then(|r| r)
    .map_err(JsValue::from_str)
}

/// Resolve a click at (x, y) with keyboard modifiers into a SelectionTarget.
///
/// Uses the engine's scene (built from the current model) as the hit tester,
/// combined with `SelectionService` to apply the engine's selection semantics
/// (SEL-015, SEL-016).
///
/// # Arguments
/// - `x`: X coordinate in page space
/// - `y`: Y coordinate in page space
/// - `alt`: Alt key pressed (bypass group — SEL-016)
/// - `shift`: Shift key pressed
/// - `ctrl`: Ctrl key pressed
/// - `meta`: Meta (Command on Mac) key pressed
///
/// Returns a JSON `SelectionTarget` object.
#[wasm_bindgen]
pub fn resolve_selection(
    handle: u32,
    x: f64,
    y: f64,
    alt: bool,
    shift: bool,
    ctrl: bool,
    meta: bool,
) -> Result<String, JsValue> {
    let result = with_engine(handle, |e| {
        // Build scene from model for hit testing
        let provider = WasmStencilProvider::new(e.stencil_libraries.clone());
        let scene = SceneBuilder::new()
            .with_stencil_provider(Box::new(provider))
            .build(e.editor.model())
            .map_err(|err| Box::leak(format!("SceneError: {err:?}").into_boxed_str()) as &str)?;

        // Scene implements HitTester, so use it directly
        let hit_tester: &dyn HitTester = &scene;
        let service = SelectionService::new(hit_tester, e.editor.model());

        let modifiers = SelectionModifiers {
            alt,
            shift,
            ctrl,
            meta,
        };

        let target = service.resolve(x, y, &modifiers);
        Ok::<_, &'static str>(target)
    });

    match result {
        Ok(Ok(target)) => serde_json::to_string(&target)
            .map_err(|e| JsValue::from_str(&format!("Serialize: {e}"))),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}
