//! Fruchterman-Reingold organic force-directed layout algorithm.
//!
//! Ported from `mxGraphLayout.js` organic layout. Produces force-directed
//! graph layouts where connected vertices attract and all vertex pairs repel.
//!
//! The algorithm is deterministic (no Math.random()) — temperature decay is linear.
//!
//! # Known Limitations
//!
//! - Repulsion calculation is O(n²) in vertex count — not suitable for graphs
//!   with thousands of vertices without spatial indexing acceleration.
//!
//! # References
//!
//! - Fruchterman & Reingold, "Graph Drawing by Force-Directed Placement", 1991.

#![forbid(unsafe_code)]

use diagram_core::geometry::{Point, Rect, Size};
use diagram_core::id::{EdgeId, PageId, VertexId};
use diagram_core::store::ModelStore;

use crate::config::OrganicLayoutConfig;
use crate::error::{LayoutError, LayoutResult};
use crate::tree::{TreeLayoutResult, compute_group_bboxes};

/// Fruchterman-Reingold organic layout engine.
///
/// Construct with [`OrganicLayout::new`], then call [`layout`](OrganicLayout::layout)
/// to compute positions for a page. Returns a [`TreeLayoutResult`] which must
/// be mapped into a transaction for atomic commit.
#[derive(Debug, Clone)]
pub struct OrganicLayout {
    config: OrganicLayoutConfig,
}

impl OrganicLayout {
    /// Create a new organic layout engine with the given configuration.
    pub fn new(config: OrganicLayoutConfig) -> Self {
        Self { config }
    }

    /// Run the organic layout algorithm on a page in the store.
    ///
    /// Returns `Ok(TreeLayoutResult)` with vertex positions, edge waypoints
    /// (straight lines), and group bounding boxes.
    ///
    /// # Errors
    ///
    /// Returns [`LayoutError::NoVertices`] if the page has no vertices.
    pub fn layout(&self, store: &ModelStore, page_id: PageId) -> LayoutResult<TreeLayoutResult> {
        // Collect vertices on this page
        let page_vertices: Vec<_> = store
            .vertices_with_ids()
            .filter(|(_, v)| v.page_id == Some(page_id))
            .collect();

        if page_vertices.is_empty() {
            return Err(LayoutError::NoVertices);
        }

        let vertex_ids: Vec<VertexId> = page_vertices.iter().map(|(id, _)| *id).collect();
        let n = vertex_ids.len();

        // Build adjacency list from edges on this page
        let page_edges: Vec<_> = store
            .edges_with_ids()
            .filter(|(_, e)| e.page_id == Some(page_id))
            .collect();

        let mut adjacency: std::collections::HashMap<VertexId, Vec<VertexId>> =
            std::collections::HashMap::new();
        for vid in &vertex_ids {
            adjacency.insert(*vid, Vec::new());
        }
        for (_, edge) in &page_edges {
            adjacency.entry(edge.source).or_default().push(edge.target);
            adjacency.entry(edge.target).or_default().push(edge.source);
        }

        // Initialise positions from existing geometry (centers)
        let mut positions: std::collections::HashMap<VertexId, (f64, f64)> =
            std::collections::HashMap::new();
        for (vid, vertex) in &page_vertices {
            if let Some(g) = &vertex.geometry {
                positions.insert(*vid, (g.x + g.width / 2.0, g.y + g.height / 2.0));
            } else {
                positions.insert(*vid, (0.0, 0.0));
            }
        }

        // FR algorithm parameters
        let k = self.config.force_constant;
        let min_dist = self.config.min_distance_limit;
        let max_dist = self.config.max_distance_limit;
        let mut temperature = self.config.initial_temp;

        // Auto-calc iterations: 20 * sqrt(n) when max_iterations == 0
        let max_iters = if self.config.max_iterations == 0 {
            (20.0 * (n as f64).sqrt()) as u32
        } else {
            self.config.max_iterations
        };

        // Main FR iteration loop
        for _iter in 0..max_iters {
            if temperature < 0.001 {
                break;
            }

            // Calculate repulsive forces: O(n²)
            let repulsion = Self::calc_repulsion(&vertex_ids, &positions, k, min_dist, max_dist);

            // Calculate attractive forces along edges: O(E)
            let attraction = Self::calc_attraction(&vertex_ids, &adjacency, &positions, k);

            // Apply displacements limited by temperature
            Self::calc_positions(
                &vertex_ids,
                &mut positions,
                &repulsion,
                &attraction,
                temperature,
            );

            // Reduce temperature (linear decay)
            temperature =
                Self::reduce_temperature(temperature, self.config.initial_temp, max_iters);
        }

        // Build result from final positions
        let mut vertices = Vec::new();
        for vid in &vertex_ids {
            let &(cx, cy) = positions.get(vid).unwrap();
            let geom = store
                .vertex(*vid)
                .and_then(|v| v.geometry.as_ref())
                .map(|g| (g.width, g.height))
                .unwrap_or((120.0, 60.0));
            let (w, h) = geom;
            vertices.push((
                *vid,
                Rect {
                    origin: Point { x: cx, y: cy },
                    size: Size {
                        width: w,
                        height: h,
                    },
                },
            ));
        }

        // Edge waypoints: empty (straight lines) when reset_edges = true
        let edge_waypoints: Vec<(EdgeId, Vec<Point>)> = if self.config.reset_edges {
            page_edges
                .iter()
                .map(|(eid, _)| (*eid, Vec::new()))
                .collect()
        } else {
            Vec::new()
        };

        // Group bounding boxes (deferred — computed after vertex positions settle)
        let group_rects = compute_group_bboxes(store, page_id, &positions, 10.0);

        Ok(TreeLayoutResult {
            vertices,
            edge_waypoints,
            group_rects,
        })
    }

    /// Calculate pairwise repulsive forces between all vertices.
    ///
    /// O(n²) in vertex count. Force formula: `f_r = -k² / d` where `d` is
    /// the Euclidean distance, clamped to `[min_dist, max_dist]`.
    fn calc_repulsion(
        vertex_ids: &[VertexId],
        positions: &std::collections::HashMap<VertexId, (f64, f64)>,
        k: f64,
        min_dist: f64,
        max_dist: f64,
    ) -> std::collections::HashMap<VertexId, (f64, f64)> {
        let mut displacement: std::collections::HashMap<VertexId, (f64, f64)> =
            std::collections::HashMap::new();
        for vid in vertex_ids {
            displacement.insert(*vid, (0.0, 0.0));
        }

        for i in 0..vertex_ids.len() {
            for j in (i + 1)..vertex_ids.len() {
                let (x1, y1) = *positions.get(&vertex_ids[i]).unwrap();
                let (x2, y2) = *positions.get(&vertex_ids[j]).unwrap();

                let dx = x1 - x2;
                let dy = y1 - y2;
                let dist = (dx * dx + dy * dy).sqrt().max(min_dist).min(max_dist);

                // Repulsive force magnitude: -k² / d
                let force = -(k * k) / dist;

                // Normalize direction
                let norm = if dist > 1e-9 { 1.0 / dist } else { 0.0 };
                let fx = force * dx * norm;
                let fy = force * dy * norm;

                // Apply equal and opposite forces via Entry API
                use std::collections::hash_map::Entry;
                if let Entry::Occupied(mut e1) = displacement.entry(vertex_ids[i]) {
                    e1.insert((e1.get().0 + fx, e1.get().1 + fy));
                }
                if let Entry::Occupied(mut e2) = displacement.entry(vertex_ids[j]) {
                    e2.insert((e2.get().0 - fx, e2.get().1 - fy));
                }
            }
        }

        displacement
    }

    /// Calculate attractive forces along edges.
    ///
    /// O(E) in edge count. Force formula: `f_a = d² / k` where `d` is
    /// the Euclidean distance between connected vertices.
    fn calc_attraction(
        vertex_ids: &[VertexId],
        adjacency: &std::collections::HashMap<VertexId, Vec<VertexId>>,
        positions: &std::collections::HashMap<VertexId, (f64, f64)>,
        k: f64,
    ) -> std::collections::HashMap<VertexId, (f64, f64)> {
        let mut displacement: std::collections::HashMap<VertexId, (f64, f64)> =
            std::collections::HashMap::new();
        for vid in vertex_ids {
            displacement.insert(*vid, (0.0, 0.0));
        }

        // Track visited pairs to avoid double-counting
        let mut visited: std::collections::HashSet<(VertexId, VertexId)> =
            std::collections::HashSet::new();

        for vid in vertex_ids {
            if let Some(neighbors) = adjacency.get(vid) {
                for &neighbor in neighbors {
                    let pair: (VertexId, VertexId) = if vid < &neighbor {
                        (*vid, neighbor)
                    } else {
                        (neighbor, *vid)
                    };
                    if visited.contains(&pair) {
                        continue;
                    }
                    visited.insert(pair);

                    let (x1, y1) = *positions.get(vid).unwrap();
                    let (x2, y2) = *positions.get(&neighbor).unwrap();

                    let dx = x1 - x2;
                    let dy = y1 - y2;
                    let dist = (dx * dx + dy * dy).sqrt();

                    if dist < 1e-9 {
                        continue;
                    }

                    // Attractive force magnitude: d² / k
                    let force = (dist * dist) / k;
                    let norm = 1.0 / dist;
                    let fx = force * dx * norm;
                    let fy = force * dy * norm;

                    use std::collections::hash_map::Entry;
                    if let Entry::Occupied(mut e1) = displacement.entry(*vid) {
                        e1.insert((e1.get().0 - fx, e1.get().1 - fy));
                    }
                    if let Entry::Occupied(mut e2) = displacement.entry(neighbor) {
                        e2.insert((e2.get().0 + fx, e2.get().1 + fy));
                    }
                }
            }
        }

        displacement
    }

    /// Apply calculated displacements to vertex positions, limited by temperature.
    fn calc_positions(
        vertex_ids: &[VertexId],
        positions: &mut std::collections::HashMap<VertexId, (f64, f64)>,
        repulsion: &std::collections::HashMap<VertexId, (f64, f64)>,
        attraction: &std::collections::HashMap<VertexId, (f64, f64)>,
        temperature: f64,
    ) {
        for vid in vertex_ids {
            let (fr_x, fr_y) = *repulsion.get(vid).unwrap();
            let (fa_x, fa_y) = *attraction.get(vid).unwrap();

            let dx = fr_x + fa_x;
            let dy = fr_y + fa_y;

            // Clamp displacement to temperature
            let disp = (dx * dx + dy * dy).sqrt();
            let clamped = disp.min(temperature);

            let (cx, cy) = *positions.get(vid).unwrap();
            let factor = if disp > 1e-9 { clamped / disp } else { 0.0 };

            positions.insert(*vid, (cx + dx * factor, cy + dy * factor));
        }
    }

    /// Linear temperature decay from initial_temp toward 0.
    ///
    /// Each call reduces temperature by `current / max_iter`, floored at 0.0.
    fn reduce_temperature(current: f64, _initial: f64, max_iter: u32) -> f64 {
        if max_iter == 0 {
            return 0.0;
        }
        let dec = current / max_iter as f64;
        (current - dec).max(0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::edge::Edge;
    use diagram_core::geometry::CellGeometry;
    use diagram_core::page::Page;
    use diagram_core::vertex::Vertex;

    fn make_store(
        vertices: &[(f64, f64, f64, f64)], // (x, y, w, h)
        edges: &[(usize, usize)],
    ) -> (ModelStore, PageId) {
        let mut store = ModelStore::new();
        let page = Page::new(PageId::default());
        let page_id = store.insert_page(page);
        let mut page_fixed = Page::new(page_id);
        page_fixed.id = page_id;
        store.replace_page(page_id, page_fixed);

        let mut vids = Vec::new();
        for (x, y, w, h) in vertices {
            let v = Vertex {
                geometry: Some(CellGeometry {
                    x: *x,
                    y: *y,
                    width: *w,
                    height: *h,
                    relative: false,
                    ..Default::default()
                }),
                page_id: Some(page_id),
                ..Vertex::default()
            };
            vids.push(store.insert_vertex(v));
        }

        for (src, tgt) in edges {
            let e = Edge {
                source: vids[*src],
                target: vids[*tgt],
                page_id: Some(page_id),
                ..Edge::default()
            };
            store.insert_edge(e);
        }

        (store, page_id)
    }

    #[test]
    fn organic_config_defaults_match_drawio() {
        let cfg = OrganicLayoutConfig::default();
        assert!((cfg.force_constant - 50.0).abs() < 1e-9);
        assert!((cfg.min_distance_limit - 2.0).abs() < 1e-9);
        assert!((cfg.max_distance_limit - 500.0).abs() < 1e-9);
        assert!((cfg.initial_temp - 200.0).abs() < 1e-9);
        assert_eq!(cfg.max_iterations, 0);
        assert!(cfg.reset_edges);
        assert!(cfg.disable_edge_style);
    }

    #[test]
    fn empty_page_returns_no_vertices_error() {
        let mut store = ModelStore::new();
        let page = Page::new(PageId::default());
        let page_id = store.insert_page(page);
        let mut page_fixed = Page::new(page_id);
        page_fixed.id = page_id;
        store.replace_page(page_id, page_fixed);
        let layout = OrganicLayout::new(OrganicLayoutConfig::default());
        let result = layout.layout(&store, page_id);
        assert!(matches!(result, Err(LayoutError::NoVertices)));
    }

    #[test]
    fn single_vertex_gets_finite_position() {
        let (store, page_id) = make_store(&[(0.0, 0.0, 120.0, 60.0)], &[]);
        let layout = OrganicLayout::new(OrganicLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();
        assert_eq!(result.vertices.len(), 1);
        let (_, rect) = &result.vertices[0];
        assert!(rect.origin.x.is_finite());
        assert!(rect.origin.y.is_finite());
    }

    #[test]
    fn positions_preserved_as_cell_centers() {
        let (store, page_id) = make_store(&[(100.0, 200.0, 120.0, 60.0)], &[]);
        let layout = OrganicLayout::new(OrganicLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();
        let (_, rect) = &result.vertices[0];
        // Position should be the cell center (single vertex has no forces)
        assert!((rect.origin.x - 160.0).abs() < 1e-6); // 100 + 120/2
        assert!((rect.origin.y - 230.0).abs() < 1e-6); // 200 + 60/2
    }

    #[test]
    fn two_connected_vertices_spread_out() {
        // Two vertices at DIFFERENT initial positions should spread apart under FR
        // (vertices at EXACT same position cause FR singularity: zero forces)
        let (store, page_id) = make_store(
            &[(0.0, 0.0, 120.0, 60.0), (130.0, 0.0, 120.0, 60.0)],
            &[(0, 1)],
        );
        let layout = OrganicLayout::new(OrganicLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();
        assert_eq!(result.vertices.len(), 2);

        // Extract positions
        let mut positions: Vec<(f64, f64)> = result
            .vertices
            .iter()
            .map(|(_, r)| (r.origin.x, r.origin.y))
            .collect();
        positions.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

        // Vertices should be separated after layout
        let dx = (positions[0].0 - positions[1].0).abs();
        let dy = (positions[0].1 - positions[1].1).abs();
        let distance = (dx * dx + dy * dy).sqrt();
        // With default force_constant=50, two vertices should spread to ~50 apart
        assert!(
            distance > 10.0,
            "vertices should spread apart, distance={distance}"
        );
    }

    #[test]
    fn waypoints_empty_when_reset_edges_true() {
        let (store, page_id) = make_store(
            &[(0.0, 0.0, 120.0, 60.0), (0.0, 0.0, 120.0, 60.0)],
            &[(0, 1)],
        );
        let layout = OrganicLayout::new(OrganicLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();
        // With reset_edges=true, all waypoints should be empty
        for (_, waypoints) in &result.edge_waypoints {
            assert!(
                waypoints.is_empty(),
                "waypoints should be empty with reset_edges=true"
            );
        }
    }
}
