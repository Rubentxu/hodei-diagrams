//! Grid layout (Hodei-original algorithm).
//!
//! A cumulative-offset two-pass grid layout that places vertices in rows and columns.
//! Unlike naive per-vertex cell formulas, this algorithm tracks per-column and
//! per-row maximum dimensions to avoid overlap when vertices have heterogeneous sizes.
//!
//! `Rect.origin` is the **top-left** corner — a deliberate Hodei-original choice
//! that differs from circular/organic (which store center coordinates).

#![forbid(unsafe_code)]

use std::collections::HashMap;

use diagram_core::geometry::{Point, Rect, Size};
use diagram_core::id::{EdgeId, PageId, VertexId};
use diagram_core::store::ModelStore;

use crate::config::GridLayoutConfig;
use crate::error::{LayoutError, LayoutResult};
use crate::tree::{TreeLayoutResult, compute_group_bboxes};

/// Group padding constant (matches tree.rs and circular.rs).
const GROUP_PADDING: f64 = 10.0;

/// Grid layout engine.
///
/// Construct with [`GridLayout::new`], then call [`layout`](GridLayout::layout)
/// to compute positions for a page. Returns a [`TreeLayoutResult`] which must
/// be mapped into a transaction for atomic commit.
#[derive(Debug, Clone)]
pub struct GridLayout {
    config: GridLayoutConfig,
}

impl GridLayout {
    /// Create a new grid layout engine with the given configuration.
    pub fn new(config: GridLayoutConfig) -> Self {
        Self { config }
    }

    /// Run the grid layout algorithm on a page in the store.
    ///
    /// Returns `Ok(TreeLayoutResult)` with vertex positions, edge waypoints
    /// (empty in v1), and group bounding boxes.
    ///
    /// # Algorithm
    ///
    /// Two-pass cumulative-offset placement:
    /// - Pass 1: Collect vertices, compute `cols` (auto `ceil(sqrt(n))` or fixed),
    ///   build `col_max_w` and `row_max_h` arrays.
    /// - Pass 1b: Compute cumulative `col_x_offset` and `row_y_offset`.
    /// - Pass 2: Place each vertex at `(col_x_offset[col], row_y_offset[row])`
    ///   as `Rect.origin = top-left`.
    ///
    /// # Errors
    ///
    /// Returns [`LayoutError::NoVertices`] if the page has no vertices.
    pub fn layout(&self, store: &ModelStore, page_id: PageId) -> LayoutResult<TreeLayoutResult> {
        // ── Setup pass ─────────────────────────────────────────────────────────
        let page_vertices: Vec<_> = store
            .vertices_with_ids()
            .filter(|(_, v)| v.page_id == Some(page_id))
            .collect();

        if page_vertices.is_empty() {
            return Err(LayoutError::NoVertices);
        }

        let vertex_ids: Vec<VertexId> = page_vertices.iter().map(|(id, _)| *id).collect();
        let n = vertex_ids.len();

        // Collect page edges (unused for positioning in v1, kept for structural parity)
        let page_edges: Vec<_> = store
            .edges_with_ids()
            .filter(|(_, e)| e.page_id == Some(page_id))
            .collect();

        // Build adjacency list (structural parity with organic; unused for v1 positioning)
        let mut adjacency: HashMap<VertexId, Vec<VertexId>> = HashMap::new();
        for vid in &vertex_ids {
            adjacency.insert(*vid, Vec::new());
        }
        for (_, edge) in &page_edges {
            adjacency.entry(edge.source).or_default().push(edge.target);
            adjacency.entry(edge.target).or_default().push(edge.source);
        }

        // ── Pass 1: Collect (id, w, h) and compute col/row dimensions ────────
        let mut vertex_dims: Vec<(VertexId, f64, f64)> = Vec::new();
        for vid in &vertex_ids {
            let (w, h) = store
                .vertex(*vid)
                .and_then(|v| v.geometry.as_ref())
                .map(|g| (g.width, g.height))
                .unwrap_or((120.0, 60.0));
            vertex_dims.push((*vid, w, h));
        }

        // Compute cols
        let cols = match self.config.num_columns {
            Some(k) => k.max(1), // defensive clamp: 0 → 1
            None => {
                let sqrt_n = (n as f64).sqrt();
                let ceil_sqrt = sqrt_n.ceil() as usize;
                ceil_sqrt.max(1)
            }
        };
        let rows = (n as f64 / cols as f64).ceil() as usize;

        // Build col_max_w and row_max_h
        let mut col_max_w: Vec<f64> = vec![0.0; cols];
        let mut row_max_h: Vec<f64> = vec![0.0; rows];

        for (i, (_, w, h)) in vertex_dims.iter().enumerate() {
            let col = i % cols;
            let row = i / cols;
            col_max_w[col] = col_max_w[col].max(*w);
            row_max_h[row] = row_max_h[row].max(*h);
        }

        // ── Pass 1b: Cumulative offsets ────────────────────────────────────────
        let mut col_x_offset: Vec<f64> = vec![0.0; cols];
        let mut row_y_offset: Vec<f64> = vec![0.0; rows];

        col_x_offset[0] = self.config.margin_x;
        for c in 1..cols {
            col_x_offset[c] = col_x_offset[c - 1] + col_max_w[c - 1] + self.config.spacing_x;
        }

        row_y_offset[0] = self.config.margin_y;
        for r in 1..rows {
            row_y_offset[r] = row_y_offset[r - 1] + row_max_h[r - 1] + self.config.spacing_y;
        }

        // ── Pass 2: Place vertices ─────────────────────────────────────────────
        let mut positions: HashMap<VertexId, (f64, f64)> = HashMap::new();
        let mut vertices = Vec::new();

        for (i, (vid, w, h)) in vertex_dims.iter().enumerate() {
            let col = i % cols;
            let row = i / cols;
            let x = col_x_offset[col];
            let y = row_y_offset[row];

            debug_assert!(
                x.is_finite() && y.is_finite(),
                "grid layout produced non-finite coordinate for vertex {:?}",
                vid
            );

            positions.insert(*vid, (x, y));

            // Top-left origin — deliberate Hodei-original choice.
            // This differs from circular/organic which store center coords.
            vertices.push((
                *vid,
                Rect {
                    origin: Point { x, y },
                    size: Size {
                        width: *w,
                        height: *h,
                    },
                },
            ));
        }

        // ── Write-back ──────────────────────────────────────────────────────────
        // Edge waypoints: always empty in v1 (no reset_edges flag)
        let edge_waypoints: Vec<(EdgeId, Vec<Point>)> = page_edges
            .iter()
            .map(|(eid, _)| (*eid, Vec::new()))
            .collect();

        // Group bounding boxes (4th caller of compute_group_bboxes)
        let group_rects = compute_group_bboxes(store, page_id, &positions, GROUP_PADDING);

        Ok(TreeLayoutResult {
            vertices,
            edge_waypoints,
            group_rects,
        })
    }
}
