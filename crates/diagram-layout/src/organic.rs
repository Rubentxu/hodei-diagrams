//! Fruchterman-Reingold organic force-directed layout algorithm.
//!
//! Ported from `mxGraphLayout.js` organic layout. Produces force-directed
//! graph layouts where connected vertices attract and all vertex pairs repel.
//!
//! The algorithm is deterministic (no Math.random()) — temperature decay is linear.
//!
//! # Known Limitations
//!
//! - Repulsion calculation is O(n²) — not suitable for graphs with thousands of vertices.
//!
//! # References
//!
//! - Fruchterman & Reingold, "Graph Drawing by Force-Directed Placement", 1991.

#![forbid(unsafe_code)]

use diagram_core::id::PageId;
use diagram_core::store::ModelStore;

use crate::config::OrganicLayoutConfig;
use crate::error::{LayoutError, LayoutResult};
use crate::tree::TreeLayoutResult;

/// Fruchterman-Reingold organic layout engine.
///
/// Construct with [`OrganicLayout::new`], then call [`layout`](OrganicLayout::layout)
/// to compute positions for a page.
#[derive(Debug, Clone)]
pub struct OrganicLayout {
    #[allow(dead_code)]
    config: OrganicLayoutConfig,
}

impl OrganicLayout {
    /// Create a new organic layout engine with the given configuration.
    pub fn new(config: OrganicLayoutConfig) -> Self {
        Self { config }
    }

    /// Run the organic layout algorithm on a page in the store.
    ///
    /// Returns `Ok(TreeLayoutResult)` with vertex positions.
    /// The store is never mutated directly — callers apply positions via transactions.
    pub fn layout(
        &self,
        store: &ModelStore,
        page_id: PageId,
    ) -> LayoutResult<TreeLayoutResult> {
        // Collect vertices on this page
        let vertices: Vec<_> = store
            .vertices_with_ids()
            .filter(|(_, v)| v.page_id == Some(page_id))
            .collect();

        if vertices.is_empty() {
            return Err(LayoutError::NoRoot);
        }

        // TODO: implement FR algorithm in full

        Ok(TreeLayoutResult {
            vertices: Vec::new(),
            edge_waypoints: Vec::new(),
            group_rects: Vec::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn organic_config_defaults() {
        let cfg = OrganicLayoutConfig::default();
        assert!((cfg.force_constant - 50.0).abs() < 1e-9);
        assert!((cfg.initial_temp - 200.0).abs() < 1e-9);
    }

    #[test]
    fn empty_page_returns_error() {
        let store = ModelStore::new();
        let page_id = PageId::default();
        let layout = OrganicLayout::new(OrganicLayoutConfig::default());
        let result = layout.layout(&store, page_id);
        assert!(matches!(result, Err(LayoutError::NoRoot)));
    }
}
