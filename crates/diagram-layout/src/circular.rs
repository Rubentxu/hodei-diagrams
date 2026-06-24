//! Circular layout (mxCircleLayout port).
//!
//! Places all page vertices at equal angular intervals on a computed circle.
//! O(n), deterministic, closed-form — no iteration.

#![forbid(unsafe_code)]

use diagram_core::id::PageId;
use diagram_core::store::ModelStore;

use crate::config::CircularLayoutConfig;
use crate::error::{LayoutError, LayoutResult};
use crate::tree::TreeLayoutResult;

/// Circular layout engine.
///
/// Construct with [`CircularLayout::new`], then call [`layout`](CircularLayout::layout)
/// to compute positions for a page. Returns a [`TreeLayoutResult`] which must
/// be mapped into a transaction for atomic commit.
#[derive(Debug, Clone)]
pub struct CircularLayout {
    #[allow(dead_code)]
    config: CircularLayoutConfig,
}

impl CircularLayout {
    /// Create a new circular layout engine with the given configuration.
    pub fn new(config: CircularLayoutConfig) -> Self {
        Self { config }
    }

    /// Run the circular layout algorithm on a page in the store.
    ///
    /// Returns `Ok(TreeLayoutResult)` with vertex positions, edge waypoints
    /// (straight lines), and group bounding boxes.
    ///
    /// # Errors
    ///
    /// Returns [`LayoutError::NoVertices`] if the page has no vertices.
    ///
    /// NOTE: This is a stub — real algorithm added in commit 2.
    #[allow(dead_code)]
    pub fn layout(
        &self,
        store: &ModelStore,
        page_id: PageId,
    ) -> LayoutResult<TreeLayoutResult> {
        let page_vertices: Vec<_> = store
            .vertices_with_ids()
            .filter(|(_, v)| v.page_id == Some(page_id))
            .collect();

        if page_vertices.is_empty() {
            return Err(LayoutError::NoVertices);
        }

        Ok(TreeLayoutResult {
            vertices: Vec::new(),
            edge_waypoints: Vec::new(),
            group_rects: Vec::new(),
        })
    }
}
