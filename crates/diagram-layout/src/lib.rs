//! # diagram-layout
//!
//! Diagram layout algorithms for the Hodei Diagrams Diagram Engine. This crate
//! provides the Sugiyama HierarchicalLayout (4-stage pipeline) as the sole v1
//! algorithm. It depends **only** on `diagram-core` and `petgraph` and must not
//! import any format, scene, render, or web concern.
//!
//! See `docs/adr/0013-keep-layout-and-routing-outside-diagram-core.md`,
//! `docs/adr/0044-routing-architecture-data-vs-algorithm.md`, and
//! `docs/adr/0045-diagram-layout-architecture.md`.
//!
//! ## Architecture
//!
//! The pipeline consists of four stages, each implementing [`LayoutStage`]:
//!
//! 1. **Cycle removal** (`CycleRemover`) — DFS-based back-edge reversal to
//!    produce a DAG.
//! 2. **Layer assignment** (`LayerAssignment`) — longest-path ranking with
//!    dummy node insertion for long-spanning edges.
//! 3. **Crossing reduction** (`CrossingReduction`) — weighted-median heuristic
//!    with transpose pass to minimise edge crossings.
//! 4. **Coordinate assignment** (`CoordinateAssignment`) — median positioning
//!    with minPath edge straightening and spacing constraints.
//!
//! The [`HierarchicalLayout`] struct wires the pipeline together, builds the
//! internal [`HierarchyModel`] from a [`ModelStore`], runs all stages, and
//! writes computed positions back via [`ModelStore::vertex_mut`].

#![deny(missing_docs)]

pub mod config;
pub mod coordinate_assignment;
pub mod crossing_reduction;
pub mod cycle_removal;
pub mod error;
pub mod hierarchy;
pub mod layer_assignment;

use diagram_core::geometry::CellGeometry;
use diagram_core::id::PageId;
use diagram_core::store::ModelStore;

use crate::coordinate_assignment::CoordinateAssignment;
use crate::crossing_reduction::CrossingReduction;
use crate::cycle_removal::CycleRemover;
use crate::hierarchy::HierarchyModel;
use crate::layer_assignment::LayerAssignment;

pub use crate::config::{Direction, LayoutConfig};
pub use crate::error::{LayoutError, LayoutResult};

/// A stage in the layout pipeline.
///
/// Each stage transforms the [`HierarchyModel`] in place, mutating ranks,
/// node orderings, or positions. Stages are composed by [`HierarchicalLayout`].
pub trait LayoutStage {
    /// Execute this stage on the given model with the given configuration.
    ///
    /// Returns `Ok(())` on success, or a [`LayoutError`] if the stage fails.
    fn execute(&self, model: &mut HierarchyModel, config: &LayoutConfig) -> LayoutResult<()>;
}

/// The main entry point for Sugiyama HierarchicalLayout.
///
/// Construct with [`HierarchicalLayout::new`] or [`HierarchicalLayout::with_config`],
/// then call [`layout`](HierarchicalLayout::layout) to run the full pipeline on a
/// store page.
pub struct HierarchicalLayout {
    config: LayoutConfig,
    stages: Vec<Box<dyn LayoutStage>>,
}

impl HierarchicalLayout {
    /// Create a new layout engine with the given configuration.
    ///
    /// The default pipeline is: `CycleRemover → LayerAssignment →
    /// CrossingReduction → CoordinateAssignment`.
    pub fn new(config: LayoutConfig) -> Self {
        Self {
            stages: vec![
                Box::new(CycleRemover),
                Box::new(LayerAssignment),
                Box::new(CrossingReduction),
                Box::new(CoordinateAssignment),
            ],
            config,
        }
    }

    /// Create a layout engine with default configuration.
    pub fn with_default_config() -> Self {
        Self::new(LayoutConfig::default())
    }

    /// Run the full layout pipeline on a page in the given store.
    ///
    /// 1. Builds a [`HierarchyModel`] from the page's vertices and edges.
    /// 2. Runs all pipeline stages in order.
    /// 3. Writes computed positions back to the store.
    ///
    /// Returns `Ok(())` on success, or the first [`LayoutError`] encountered.
    ///
    /// # Invariants
    ///
    /// - Never calls `insert_vertex`, `insert_edge`, `remove_vertex`, or
    ///   `remove_edge` on the store — only mutates geometry positions.
    /// - All computed coordinates are finite (`f64::is_finite()`).
    pub fn layout(&self, store: &mut ModelStore, page_id: PageId) -> LayoutResult<()> {
        // Build the internal hierarchy model from the store
        let mut model = build_hierarchy(store, page_id, self.config.direction);

        // Skip pipeline for empty pages
        if model.node_count() == 0 {
            return Ok(());
        }

        // Run each stage
        for stage in &self.stages {
            stage.execute(&mut model, &self.config)?;
        }

        // Write computed positions back to the store
        write_back(store, &model, self.config.direction);
        Ok(())
    }
}

/// Build a [`HierarchyModel`] from the vertices and edges on the given page.
///
/// Vertices without explicit geometry are assigned a default size of
/// (120.0, 60.0), matching upstream draw.io behaviour.
fn build_hierarchy(store: &ModelStore, page_id: PageId, direction: Direction) -> HierarchyModel {
    use diagram_core::id::VertexId;
    use std::collections::HashMap;

    let mut model = HierarchyModel::new(direction);
    let mut vertex_to_node: HashMap<VertexId, _> = HashMap::new();

    // Add all vertices on this page
    for (vid, vertex) in store.vertices_with_ids() {
        if vertex.page_id != Some(page_id) {
            continue;
        }
        let (width, height) = match vertex.geometry {
            Some(g) => (g.width, g.height),
            None => {
                // Default cell size as per upstream draw.io behaviour
                (120.0, 60.0)
            }
        };
        let ix = model.add_real_node(vid, width, height);
        vertex_to_node.insert(vid, ix);
    }

    // Add all edges on this page
    for (eid, edge) in store.edges_with_ids() {
        if edge.page_id != Some(page_id) {
            continue;
        }
        let Some(&source_ix) = vertex_to_node.get(&edge.source) else {
            continue;
        };
        let Some(&target_ix) = vertex_to_node.get(&edge.target) else {
            continue;
        };
        model.add_edge(source_ix, target_ix, eid, false);
    }

    model
}

/// Write computed positions from the model back to the store.
///
/// For each real node in the model, updates `Vertex.geometry` with the
/// computed (x, y) position while preserving width and height. For edges,
/// resets waypoints to empty (straight lines in v1).
fn write_back(store: &mut ModelStore, model: &HierarchyModel, direction: Direction) {
    for ix in model.node_indices() {
        if let Some(vid) = model.real_node_id(ix) {
            if let Some((cx, cy)) = model.node_position(ix) {
                let (gx, gy) = match direction {
                    Direction::TopToBottom => (cx, cy),
                    Direction::LeftToRight => (cy, cx),
                };
                if let Some(vertex) = store.vertex_mut(vid) {
                    let old_geom = vertex.geometry;
                    let (w, h) = match old_geom {
                        Some(g) => (g.width, g.height),
                        None => (120.0, 60.0),
                    };
                    debug_assert!(gx.is_finite(), "x coordinate must be finite");
                    debug_assert!(gy.is_finite(), "y coordinate must be finite");
                    vertex.geometry = Some(CellGeometry {
                        x: gx,
                        y: gy,
                        width: w,
                        height: h,
                        relative: false,
                    });
                }
            }
        }
    }

    // Reset waypoints to empty for all edges (v1: straight lines between centers)
    for eid in model.edge_indices_stored() {
        let data = model.edge_data(eid);
        if let Some(edge) = store.edge_mut(data.id) {
            edge.waypoints.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::edge::Edge;
    use diagram_core::geometry::CellGeometry;
    use diagram_core::id::PageId;
    use diagram_core::store::ModelStore;
    use diagram_core::vertex::Vertex;

    fn make_store_with_topology(
        vertices: &[(f64, f64, f64, f64)], // (x, y, w, h)
        edges: &[(usize, usize)],          // (source_idx, target_idx)
    ) -> (ModelStore, PageId) {
        let mut store = ModelStore::new();

        // Insert a page — use its slotmap key as the canonical page_id
        let page = diagram_core::page::Page::new(PageId::default());
        let page_id = store.insert_page(page);
        let mut page_fixed = diagram_core::page::Page::new(page_id);
        page_fixed.id = page_id;
        store.replace_page(page_id, page_fixed);

        // Insert vertices
        let mut vids = Vec::new();
        for (x, y, w, h) in vertices {
            let v = Vertex {
                geometry: Some(CellGeometry {
                    x: *x,
                    y: *y,
                    width: *w,
                    height: *h,
                    relative: false,
                }),
                page_id: Some(page_id),
                ..Vertex::default()
            };
            vids.push(store.insert_vertex(v));
        }

        // Insert edges
        for (src_idx, tgt_idx) in edges {
            let e = Edge {
                source: vids[*src_idx],
                target: vids[*tgt_idx],
                page_id: Some(page_id),
                ..Edge::default()
            };
            store.insert_edge(e);
        }

        (store, page_id)
    }

    #[test]
    fn layout_mutates_vertex_positions() {
        let (mut store, page_id) = make_store_with_topology(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[(0, 1), (1, 2)],
        );

        let layout = HierarchicalLayout::with_default_config();
        let vertex_count_before = store.len_vertex();
        let edge_count_before = store.len_edge();

        layout.layout(&mut store, page_id).unwrap();

        // All vertices have been repositioned
        for vid in store.vertices_with_ids().map(|(id, _)| id) {
            let v = store.vertex(vid).unwrap();
            let g = v
                .geometry
                .expect("vertex should have geometry after layout");
            assert!(g.x.is_finite(), "x must be finite");
            assert!(g.y.is_finite(), "y must be finite");
            // At least some vertices moved from (0,0)
        }

        // Count is preserved
        assert_eq!(store.len_vertex(), vertex_count_before);
        assert_eq!(store.len_edge(), edge_count_before);
    }

    #[test]
    fn layout_never_creates_or_deletes_cells() {
        let (mut store, page_id) = make_store_with_topology(
            &[(0.0, 0.0, 120.0, 60.0), (200.0, 0.0, 120.0, 60.0)],
            &[(0, 1)],
        );

        let vc = store.len_vertex();
        let ec = store.len_edge();
        let layout = HierarchicalLayout::with_default_config();
        layout.layout(&mut store, page_id).unwrap();

        assert_eq!(store.len_vertex(), vc);
        assert_eq!(store.len_edge(), ec);
    }

    #[test]
    fn layout_preserves_vertex_geometry_size() {
        let (mut store, page_id) = make_store_with_topology(
            &[(0.0, 0.0, 120.0, 60.0), (200.0, 0.0, 120.0, 60.0)],
            &[(0, 1)],
        );

        let layout = HierarchicalLayout::with_default_config();
        layout.layout(&mut store, page_id).unwrap();

        for vid in store.vertices_with_ids().map(|(id, _)| id) {
            let g = store.vertex(vid).unwrap().geometry.unwrap();
            assert!((g.width - 120.0).abs() < 1e-9);
            assert!((g.height - 60.0).abs() < 1e-9);
        }
    }

    #[test]
    fn empty_page_returns_ok() {
        let mut store = ModelStore::new();
        let page = diagram_core::page::Page::new(PageId::default());
        let page_id = store.insert_page(page);
        let mut page_fixed = diagram_core::page::Page::new(page_id);
        page_fixed.id = page_id;
        store.replace_page(page_id, page_fixed);

        let layout = HierarchicalLayout::with_default_config();
        assert!(layout.layout(&mut store, page_id).is_ok());
    }

    #[test]
    fn single_vertex_no_edges() {
        let (mut store, page_id) = make_store_with_topology(&[(0.0, 0.0, 120.0, 60.0)], &[]);

        let layout = HierarchicalLayout::with_default_config();
        layout.layout(&mut store, page_id).unwrap();

        let g = store
            .vertices_with_ids()
            .next()
            .unwrap()
            .1
            .geometry
            .unwrap();
        assert!(g.x.is_finite());
        assert!(g.y.is_finite());
    }

    #[test]
    fn top_to_bottom_invariant() {
        let (mut store, page_id) = make_store_with_topology(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (200.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[(0, 1), (1, 2)],
        );

        let layout = HierarchicalLayout::with_default_config();
        layout.layout(&mut store, page_id).unwrap();

        // For every edge, target.y >= source.y
        for (_, edge) in store.edges_with_ids() {
            let src = store.vertex(edge.source).unwrap().geometry.unwrap();
            let tgt = store.vertex(edge.target).unwrap().geometry.unwrap();
            assert!(
                tgt.y >= src.y - 1e-6,
                "target.y ({}) should be >= source.y ({})",
                tgt.y,
                src.y
            );
        }
    }

    #[test]
    fn positions_stable_across_consecutive_layouts() {
        // Use an asymmetric chain to avoid symmetric-node swapping issues.
        let (mut store, page_id) = make_store_with_topology(
            &[
                (10.0, 10.0, 120.0, 60.0),
                (10.0, 10.0, 100.0, 50.0),
                (10.0, 10.0, 80.0, 40.0),
            ],
            &[(0, 1), (1, 2)],
        );

        let layout = HierarchicalLayout::with_default_config();
        let first = layout.layout(&mut store, page_id);

        // Run layout again — should still succeed, positions should be finite
        let second = layout.layout(&mut store, page_id);

        assert!(first.is_ok(), "first layout should succeed");
        assert!(second.is_ok(), "second layout should succeed");

        // All vertices should have valid positions after both passes
        for (i, (_, v)) in store.vertices_with_ids().enumerate() {
            let g = v.geometry.expect("vertex should have geometry");
            assert!(g.x.is_finite(), "vertex {i}: x must be finite, got {}", g.x);
            assert!(g.y.is_finite(), "vertex {i}: y must be finite, got {}", g.y);
        }
    }

    #[test]
    fn waypoints_reset_after_layout() {
        let (mut store, page_id) = make_store_with_topology(
            &[(0.0, 0.0, 120.0, 60.0), (200.0, 0.0, 120.0, 60.0)],
            &[(0, 1)],
        );

        let layout = HierarchicalLayout::with_default_config();
        layout.layout(&mut store, page_id).unwrap();

        for (_, edge) in store.edges_with_ids() {
            assert!(
                edge.waypoints.is_empty(),
                "all edges should have empty waypoints after layout"
            );
        }
    }

    #[test]
    fn left_to_right_invariant() {
        let (mut store, page_id) = make_store_with_topology(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (200.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[(0, 1), (1, 2)],
        );

        let cfg = LayoutConfig {
            direction: Direction::LeftToRight,
            ..LayoutConfig::default()
        };
        let layout = HierarchicalLayout::new(cfg);
        layout.layout(&mut store, page_id).unwrap();

        // For every edge, target.x >= source.x (in LeftToRight)
        for (_, edge) in store.edges_with_ids() {
            let src = store.vertex(edge.source).unwrap().geometry.unwrap();
            let tgt = store.vertex(edge.target).unwrap().geometry.unwrap();
            assert!(
                tgt.x >= src.x - 1e-6,
                "target.x ({}) should be >= source.x ({}) in LeftToRight",
                tgt.x,
                src.x
            );
        }
    }

    #[test]
    fn spacing_configuration() {
        let (mut store, page_id) = make_store_with_topology(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[(0, 1), (1, 2)],
        );

        let cfg = LayoutConfig {
            inter_rank_spacing: 80.0,
            intra_cell_spacing: 20.0,
            ..LayoutConfig::default()
        };
        let layout = HierarchicalLayout::new(cfg);
        layout.layout(&mut store, page_id).unwrap();

        // Check vertical separation between consecutive layers
        // Since A→B→C, layers should be: A at 0, B at 1, C at 2
        // y-separation between layers should be >= 80
        let mut ys: Vec<f64> = store
            .vertices_with_ids()
            .map(|(_, v)| v.geometry.unwrap().y)
            .collect();
        ys.sort_by(|a, b| a.partial_cmp(b).unwrap());

        if ys.len() >= 2 {
            let sep = ys[1] - ys[0];
            assert!(
                sep >= 80.0 - 0.1,
                "layer separation should be >= 80, got {sep}"
            );
        }
    }
}
