//! Layout WASM bindings: dispatch layout algorithm and commit results as a transaction.

use diagram_commands::Transaction;
use diagram_core::geometry::CellGeometry;
use diagram_core::id::PageId;
use diagram_layout::{LayoutConfig, LayoutKind, TreeLayoutResult, apply_layout_kind};
use wasm_bindgen::prelude::*;

use crate::engine::with_engine_mut;

/// Convert a [`Rect`](diagram_core::geometry::Rect) to a [`CellGeometry`] for use in
/// move commands.
///
/// The `relative` flag is set to `false` (absolute positioning), and rotation/flip
/// fields are set to their defaults.
fn rect_to_cell_geometry(r: &diagram_core::geometry::Rect) -> CellGeometry {
    CellGeometry {
        x: r.origin.x,
        y: r.origin.y,
        width: r.size.width,
        height: r.size.height,
        relative: false,
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
    }
}

/// Convert a [`TreeLayoutResult`] into a [`Transaction`] that moves vertices,
/// updates edge waypoints, and resizes groups atomically.
fn result_to_transaction(_page_id: PageId, result: &TreeLayoutResult) -> Transaction {
    let mut tx = Transaction::new();

    // vertices → MoveVertex commands
    for (vid, rect) in &result.vertices {
        let geom = rect_to_cell_geometry(rect);
        tx = tx.move_vertex(*vid, geom);
    }

    // edge_waypoints → SetEdgeWaypoints commands
    for (eid, waypoints) in &result.edge_waypoints {
        tx = tx.set_edge_waypoints(*eid, waypoints.clone());
    }

    // group_rects → MoveGroup commands
    for (gid, rect) in &result.group_rects {
        let geom = rect_to_cell_geometry(rect);
        tx = tx.move_group(*gid, geom);
    }

    tx
}

/// Apply a layout algorithm to the current page and commit the results as a
/// single atomic transaction.
///
/// `handle` is the engine handle returned by [`create_engine`](crate::create_engine).
/// `kind_json` is a JSON string encoding the [`LayoutKind`] (e.g. `"Tree"` or
/// `"Hierarchical"`).
/// `config_json` is a JSON string encoding the [`LayoutConfig`].
///
/// On success the affected vertices, edge waypoints, and groups are updated and
/// one history entry is pushed (one undo reverts all). On failure the store is
/// unchanged.
///
/// # Errors
///
/// - `"InvalidHandle"` if the engine handle is not valid
/// - `"ApplyLayout: invalid kind: <json_error>"` if `kind_json` is malformed
/// - `"ApplyLayout: invalid config: <json_error>"` if `config_json` is malformed
/// - `"ApplyLayout: <LayoutError>"` if the layout algorithm fails (e.g.
///   `MultipleRoots`, `CycleDetected`, `NoRoot`)
#[wasm_bindgen]
pub fn apply_layout(handle: u32, kind_json: &str, config_json: &str) -> Result<(), JsValue> {
    // Parse layout kind
    let kind: LayoutKind = match serde_json::from_str(kind_json) {
        Ok(k) => k,
        Err(e) => {
            return Err(JsValue::from_str(&format!(
                "ApplyLayout: invalid kind: {e}"
            )));
        }
    };

    // Parse layout config
    let config: LayoutConfig = match serde_json::from_str(config_json) {
        Ok(c) => c,
        Err(e) => {
            return Err(JsValue::from_str(&format!(
                "ApplyLayout: invalid config: {e}"
            )));
        }
    };

    // Look up engine and get current page
    with_engine_mut(handle, |e| {
        // Use the first page as the layout target.
        // Multi-page diagrams require the caller to iterate explicitly.
        let page_id = e
            .editor
            .model()
            .store
            .pages_with_ids()
            .next()
            .map(|(pid, _)| pid)
            .ok_or_else(|| {
                let msg = "ApplyLayout: no pages in diagram".to_string();
                Box::leak(msg.into_boxed_str()) as &str
            })?;

        let store = &e.editor.model().store;

        // Dispatch to layout algorithm
        let result = match apply_layout_kind(kind, &config, store, page_id) {
            Ok(r) => r,
            Err(le) => {
                return Err(Box::leak(format!("ApplyLayout: {}", le).into_boxed_str()) as &str);
            }
        };

        // Convert result to transaction and commit atomically
        let tx = result_to_transaction(page_id, &result);
        tx.commit(&mut e.editor).map_err(|ce| {
            Box::leak(format!("ApplyLayout: commit: {}", ce).into_boxed_str()) as &str
        })
    })
    .map_err(|_| JsValue::from_str("InvalidHandle"))?
    .map_err(JsValue::from_str)
}
