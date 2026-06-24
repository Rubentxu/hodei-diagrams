//! Grid layout (Hodei-original algorithm).
//!
//! A cumulative-offset two-pass grid layout that places vertices in rows and columns.
//! Unlike naive per-vertex cell formulas, this algorithm tracks per-column and
//! per-row maximum dimensions to avoid overlap when vertices have heterogeneous sizes.
//!
//! `Rect.origin` is the **top-left** corner — a deliberate Hodei-original choice
//! that differs from circular/organic (which store center coordinates).

#![forbid(unsafe_code)]
#![allow(dead_code, unused_imports)]

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
    pub fn layout(&self, _store: &ModelStore, _page_id: PageId) -> LayoutResult<TreeLayoutResult> {
        // Stub: returns empty result until algorithm is implemented
        Ok(TreeLayoutResult {
            vertices: Vec::new(),
            edge_waypoints: Vec::new(),
            group_rects: Vec::new(),
        })
    }
}
