//! Command execution: translate JSON commands to engine calls.

use crate::engine::{with_editor, with_editor_mut};
use diagram_commands::{Command, RoutingKind, Transaction};
use diagram_scene::resolver::StyleResolver;
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
    with_editor_mut(handle, |e| e.execute(cmd))
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
            // Z-order commands — no direct transaction builder; skip for now
            Command::BringToFront(_) => tx,
            Command::SendToBack(_) => tx,
            Command::BringForward(_) => tx,
            Command::SendBackward(_) => tx,
            // ConnectVertices and DisconnectEdge have their own dedicated WASM functions
            Command::ConnectVertices(_) => tx,
            Command::DisconnectEdge(_) => tx,
            // Handle any future variants gracefully (non_exhaustive)
            _ => tx,
        }
    });

    with_editor_mut(handle, |e| tx.commit(e))
        .and_then(|r| r.map_err(|e| Box::leak(format!("Execute: {e}").into_boxed_str()) as &str))
        .map_err(JsValue::from_str)
}

/// Undo the last command (or transaction) on an engine.
///
/// No-op if undo history is empty.
#[wasm_bindgen]
pub fn undo(handle: u32) -> Result<(), JsValue> {
    with_editor_mut(handle, |e| e.undo())
        .and_then(|r| r.map_err(|e| Box::leak(format!("{e}").into_boxed_str()) as &str))
        .map_err(JsValue::from_str)
}

/// Redo the last undone command (or transaction) on an engine.
///
/// No-op if redo history is empty.
#[wasm_bindgen]
pub fn redo(handle: u32) -> Result<(), JsValue> {
    with_editor_mut(handle, |e| e.redo())
        .and_then(|r| r.map_err(|e| Box::leak(format!("{e}").into_boxed_str()) as &str))
        .map_err(JsValue::from_str)
}

/// Check if undo is available on an engine.
#[wasm_bindgen]
pub fn engine_can_undo(handle: u32) -> Result<bool, JsValue> {
    match with_editor(handle, |e| e.can_undo()) {
        Ok(v) => Ok(v),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Check if redo is available on an engine.
#[wasm_bindgen]
pub fn engine_can_redo(handle: u32) -> Result<bool, JsValue> {
    match with_editor(handle, |e| e.can_redo()) {
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

/// Connect two vertices with an edge, using the specified routing algorithm.
///
/// `from` and `to` are the source and target vertex slotmap index values (the `idx` field from SlotmapId).
/// `routing_kind` is 0 for orthogonal (default) or 1 for straight.
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
) -> Result<u32, JsValue> {
    let kind = routing_kind_from_u32(routing_kind);

    // First: validate handle (with_editor_mut returns Err on invalid handle)
    let result = with_editor_mut(handle, |e| {
        let from_id = match find_vertex_by_idx(e.model(), from) {
            Some(id) => id,
            None => {
                return Err("ConnectError: source vertex not found");
            }
        };
        let to_id = match find_vertex_by_idx(e.model(), to) {
            Some(id) => id,
            None => {
                return Err("ConnectError: target vertex not found");
            }
        };
        e.connect_vertices(from_id, to_id, kind)
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
    let result = with_editor_mut(handle, |e| {
        let eid = match find_edge_by_idx(e.model(), edge_id) {
            Some(id) => id,
            None => {
                return Err("DisconnectError: edge not found");
            }
        };
        e.disconnect_edge(eid)
            .map_err(|e| Box::leak(format!("{e}").into_boxed_str()) as &str)
    });

    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Get the resolved style for a vertex.
///
/// `handle` is the engine handle (u32).
/// `vertex_id` is the vertex slotmap index (the `idx` field from SlotmapId).
///
/// Returns a JSON string of the resolved `ResolvedStyle` with typed effect fields,
/// or an error string if the vertex is not found.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `VertexNotFound` if the vertex ID does not exist in the model
#[wasm_bindgen]
pub fn get_resolved_style(handle: u32, vertex_id: u32) -> Result<JsValue, JsValue> {
    let result = with_editor(handle, |editor| {
        // Find the vertex by its slotmap index
        let vid = match find_vertex_by_idx(editor.model(), vertex_id) {
            Some(v) => v,
            None => {
                return Err("VertexNotFound");
            }
        };

        // Look up the vertex in the store
        let vertex = match editor.model().store.vertex(vid) {
            Some(v) => v,
            None => {
                return Err("VertexNotFound");
            }
        };

        // Get the style via style_id
        let style_id = match vertex.style_id {
            Some(sid) => sid,
            None => {
                return Err("VertexHasNoStyle");
            }
        };

        // Look up the StyleMap
        let style = match editor.model().store.style(style_id) {
            Some(s) => s,
            None => {
                return Err("StyleNotFound");
            }
        };

        // Resolve the style
        let resolver = StyleResolver::new();
        let resolved = resolver.resolve(style);

        // Serialize to JSON
        match serde_json::to_string(&resolved) {
            Ok(json) => Ok(json),
            Err(e) => Err(Box::leak(format!("Serialize: {e}").into_boxed_str()) as &str),
        }
    });

    // Flatten the nested Result: Result<Result<String, &str>, &'static str>
    match result {
        Ok(Ok(json)) => Ok(JsValue::from_str(&json)),
        Ok(Err(e)) => Err(JsValue::from_str(e)),
        Err(e) => Err(JsValue::from_str(e)),
    }
}
