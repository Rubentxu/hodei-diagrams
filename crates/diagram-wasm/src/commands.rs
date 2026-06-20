//! Command execution: translate JSON commands to engine calls.

use crate::engine::{with_editor, with_editor_mut};
use diagram_commands::{Command, RoutingKind};
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
