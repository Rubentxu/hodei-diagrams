//! Layout WASM bindings: dispatch layout algorithm and commit results as a transaction.

use diagram_commands::Transaction;
use diagram_core::geometry::CellGeometry;
use diagram_core::id::{EdgeId, PageId, VertexId};
use diagram_layout::{
    HierarchicalLayout, LayoutConfig, LayoutKind, TreeLayoutResult, apply_layout_kind,
};
use diagram_routing::{EdgeStyle, RoutingRequest, route};
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

/// Apply the Hierarchical layout algorithm to the current page.
///
/// `handle` is the engine handle returned by [`create_engine`](crate::create_engine).
/// `config_json` is a JSON string encoding the [`LayoutConfig`].
///
/// This function is separate from [`apply_layout`] because `HierarchicalLayout`
/// mutates the store in-place (unlike Tree/Organic/Circular/Grid which return
/// `TreeLayoutResult`). On success the affected vertices are updated and one
/// history entry is pushed (one undo reverts all). On failure the store is unchanged.
///
/// # Errors
///
/// - `"InvalidHandle"` if the engine handle is not valid
/// - `"ApplyHierarchical: invalid config: <json_error>"` if `config_json` is malformed
/// - `"ApplyHierarchical: <LayoutError>"` if the layout algorithm fails
#[wasm_bindgen]
pub fn apply_hierarchical_layout(handle: u32, config_json: &str) -> Result<(), JsValue> {
    // Parse layout config
    let config: LayoutConfig = match serde_json::from_str(config_json) {
        Ok(c) => c,
        Err(e) => {
            return Err(JsValue::from_str(&format!(
                "ApplyHierarchical: invalid config: {e}"
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
                let msg = "ApplyHierarchical: no pages in diagram".to_string();
                Box::leak(msg.into_boxed_str()) as &str
            })?;

        // HierarchicalLayout mutates the store in-place
        let layout = HierarchicalLayout::new(config);
        layout
            .layout(&mut e.editor.model_mut().store, page_id)
            .map_err(|le| {
                Box::leak(format!("ApplyHierarchical: {}", le).into_boxed_str()) as &str
            })?;

        // Commit an empty transaction to push a history entry (one undo reverts all)
        let tx = Transaction::new();
        tx.commit(&mut e.editor).map_err(|ce| {
            Box::leak(format!("ApplyHierarchical: commit: {}", ce).into_boxed_str()) as &str
        })
    })
    .map_err(|_| JsValue::from_str("InvalidHandle"))?
    .map_err(JsValue::from_str)
}

/// Re-route all edges on the current page using orthogonal routing.
///
/// After moving vertices, edges retain their old waypoints. This function recomputes
/// orthogonal routes for all edges on the first page and commits the results as a
/// single atomic transaction (one undo reverts all).
///
/// `handle` is the engine handle returned by [`create_engine`](crate::create_engine).
///
/// # Errors
///
/// - `"InvalidHandle"` if the engine handle is not valid
/// - `"RouteAllEdges: no pages in diagram"` if the diagram has no pages
/// - `"RouteAllEdges: commit: <error>"` if the transaction commit fails
#[wasm_bindgen]
pub fn route_all_edges(handle: u32) -> Result<(), JsValue> {
    with_engine_mut(handle, |e| {
        // Use the first page as the routing target.
        // Multi-page diagrams require the caller to iterate explicitly.
        let page_id = e
            .editor
            .model()
            .store
            .pages_with_ids()
            .next()
            .map(|(pid, _)| pid)
            .ok_or_else(|| {
                let msg = "RouteAllEdges: no pages in diagram".to_string();
                Box::leak(msg.into_boxed_str()) as &str
            })?;

        let store = &e.editor.model().store;

        // Collect all edges on this page with their source/target vertex IDs
        let edge_data: Vec<(EdgeId, VertexId, VertexId)> = store
            .edges_with_ids()
            .filter(|(_, edge)| edge.page_id == Some(page_id))
            .map(|(eid, edge)| (eid, edge.source, edge.target))
            .collect();

        // For each edge, compute routing and accumulate SetEdgeWaypoints commands
        let mut tx = Transaction::new();
        let mut any_routed = false;

        for (eid, src_id, tgt_id) in edge_data {
            let Some(source) = store.vertex(src_id) else {
                continue;
            };
            let Some(target) = store.vertex(tgt_id) else {
                continue;
            };

            let req = RoutingRequest {
                source,
                target,
                style: EdgeStyle::Orthogonal,
                ports: (None, None),
                waypoints: &[],
            };

            if let Ok(path) = route(&req) {
                tx = tx.set_edge_waypoints(eid, path.0);
                any_routed = true;
            }
            // If routing fails, skip this edge (leave existing waypoints)
        }

        if !any_routed {
            return Ok(()); // Nothing to do
        }

        // Commit as single transaction (one undo reverts all)
        tx.commit(&mut e.editor).map_err(|ce| {
            Box::leak(format!("RouteAllEdges: commit: {}", ce).into_boxed_str()) as &str
        })
    })
    .map_err(|_| JsValue::from_str("InvalidHandle"))?
    .map_err(JsValue::from_str)
}
