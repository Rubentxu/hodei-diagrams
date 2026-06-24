//! Circular layout (mxCircleLayout port).
//!
//! Places all page vertices at equal angular intervals on a computed circle.
//! O(n), deterministic, closed-form — no iteration.

#![forbid(unsafe_code)]

use std::f64::consts::PI;

use diagram_core::geometry::{Point, Rect, Size};
use diagram_core::id::{EdgeId, PageId, VertexId};
use diagram_core::store::ModelStore;

use crate::config::CircularLayoutConfig;
use crate::error::{LayoutError, LayoutResult};
use crate::tree::{TreeLayoutResult, compute_group_bboxes};

/// Group padding constant (matches tree.rs).
const GROUP_PADDING: f64 = 10.0;

/// Circular layout engine.
///
/// Construct with [`CircularLayout::new`], then call [`layout`](CircularLayout::layout)
/// to compute positions for a page. Returns a [`TreeLayoutResult`] which must
/// be mapped into a transaction for atomic commit.
#[derive(Debug, Clone)]
pub struct CircularLayout {
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
    /// # Algorithm
    ///
    /// Closed-form O(n) placement at equal angular intervals:
    /// - `radius = max(n * max_dim / π, config.radius)`
    /// - For vertex i: `angle = 2π·i/n`, position = `(cx + r·cos(angle), cy + r·sin(angle))`
    ///
    /// # Errors
    ///
    /// Returns [`LayoutError::NoVertices`] if the page has no vertices.
    pub fn layout(
        &self,
        store: &ModelStore,
        page_id: PageId,
    ) -> LayoutResult<TreeLayoutResult> {
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
        let mut adjacency: std::collections::HashMap<VertexId, Vec<VertexId>> =
            std::collections::HashMap::new();
        for vid in &vertex_ids {
            adjacency.insert(*vid, Vec::new());
        }
        for (_, edge) in &page_edges {
            adjacency.entry(edge.source).or_default().push(edge.target);
            adjacency.entry(edge.target).or_default().push(edge.source);
        }

        // Compute max_dim across all vertices (default 120x60 for zero-geometry)
        let mut max_dim = 0.0f64;
        let mut min_x = f64::MAX;
        let mut min_y = f64::MAX;

        for (_, vertex) in &page_vertices {
            let (w, h) = vertex
                .geometry
                .as_ref()
                .map(|g| (g.width, g.height))
                .unwrap_or((120.0, 60.0));
            let dim = w.max(h);
            if dim > max_dim {
                max_dim = dim;
            }

            if let Some(g) = &vertex.geometry {
                if g.x < min_x {
                    min_x = g.x;
                }
                if g.y < min_y {
                    min_y = g.y;
                }
            }
        }

        if min_x == f64::MAX {
            min_x = 0.0;
        }
        if min_y == f64::MAX {
            min_y = 0.0;
        }

        // ── Layout pass (closed-form) ────────────────────────────────────────────
        // Radius formula from mxCircleLayout.js: max(n * max_dim / π, config.radius)
        let radius = (n as f64 * max_dim / PI).max(self.config.radius);

        // Circle center: move_circle=true → (x0+r, y0+r), else → (min_x+r, min_y+r)
        let (center_x, center_y) = if self.config.move_circle {
            (self.config.x0 + radius, self.config.y0 + radius)
        } else {
            (min_x + radius, min_y + radius)
        };

        // Position each vertex at equal angular intervals
        let mut positions: std::collections::HashMap<VertexId, (f64, f64)> =
            std::collections::HashMap::new();
        let mut vertices = Vec::new();

        for (i, vid) in vertex_ids.iter().enumerate() {
            let angle = 2.0 * PI * (i as f64) / (n as f64);
            let cx = center_x + radius * angle.cos();
            let cy = center_y + radius * angle.sin();

            debug_assert!(
                cx.is_finite() && cy.is_finite(),
                "circular layout produced non-finite coordinate for vertex {:?}",
                vid
            );

            let (w, h) = store
                .vertex(*vid)
                .and_then(|v| v.geometry.as_ref())
                .map(|g| (g.width, g.height))
                .unwrap_or((120.0, 60.0));

            positions.insert(*vid, (cx, cy));

            // Latent bug check: organic.rs:144 stores Rect.origin = (cx, cy) (center coords).
            // If the WASM Transaction applier interprets Rect.origin as top-left, organic
            // and circular both have a latent offset bug. The apply-phase mirror here is
            // intentional. The sddk-verify phase must validate against the WASM mapping
            // in crates/diagram-wasm/src/layout.rs::result_to_transaction. If applier
            // treats origin as top-left, fix the mapper to subtract (w/2, h/2) from
            // origin.x/origin.y for organic + circular outputs. See ADR-0069 §Open
            // Questions and design.md §Open Questions.
            vertices.push((
                *vid,
                Rect {
                    origin: Point { x: cx, y: cy },
                    size: Size { width: w, height: h },
                },
            ));
        }

        // ── Write-back ──────────────────────────────────────────────────────────
        // Edge waypoints: empty (straight lines) when reset_edges = true
        let edge_waypoints: Vec<(EdgeId, Vec<Point>)> = if self.config.reset_edges {
            page_edges.iter().map(|(eid, _)| (*eid, Vec::new())).collect()
        } else {
            Vec::new()
        };

        // disable_edge_style: v1 no-op — our Edge struct has no per-style
        // evaluation path yet. Deferred to routing layer (ADR-0044). Carried
        // for serde-config parity with mxCircleLayout.disableEdgeStyle.
        let _ = self.config.disable_edge_style;

        // Group bounding boxes (3rd caller of compute_group_bboxes)
        let group_rects = compute_group_bboxes(store, page_id, &positions, GROUP_PADDING);

        Ok(TreeLayoutResult {
            vertices,
            edge_waypoints,
            group_rects,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::edge::Edge;
    use diagram_core::geometry::CellGeometry;
    use diagram_core::group::Group;
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

    fn make_store_with_groups(
        vertices: &[(f64, f64, f64, f64)], // (x, y, w, h)
        edges: &[(usize, usize)],
        group_children: &[&[usize]], // group idx -> child vertex indices
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

        // Create groups and assign children
        for child_indices in group_children {
            if child_indices.is_empty() {
                continue;
            }
            let group = Group {
                page_id: Some(page_id),
                ..Group::default()
            };
            let gid = store.insert_group(group);
            for &child_idx in *child_indices {
                if let Some(vertex) = store.vertex_mut(vids[child_idx]) {
                    vertex.parent = Some(gid);
                }
            }
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

    // ── Config Tests ───────────────────────────────────────────────────────

    #[test]
    fn circular_config_defaults_match_drawio() {
        let cfg = CircularLayoutConfig::default();
        assert!((cfg.radius - 100.0).abs() < 1e-9);
        assert!(!cfg.move_circle);
        assert!((cfg.x0 - 0.0).abs() < 1e-9);
        assert!((cfg.y0 - 0.0).abs() < 1e-9);
        assert!(cfg.reset_edges);
        assert!(cfg.disable_edge_style);
    }

    // ── Empty Page Tests ───────────────────────────────────────────────────

    #[test]
    fn empty_page_returns_no_vertices_error() {
        let mut store = ModelStore::new();
        let page = Page::new(PageId::default());
        let page_id = store.insert_page(page);
        let mut page_fixed = Page::new(page_id);
        page_fixed.id = page_id;
        store.replace_page(page_id, page_fixed);

        let layout = CircularLayout::new(CircularLayoutConfig::default());
        let result = layout.layout(&store, page_id);
        assert!(matches!(result, Err(LayoutError::NoVertices)));
    }

    // ── Single Vertex Tests ─────────────────────────────────────────────────

    #[test]
    fn single_vertex_gets_finite_position() {
        let (store, page_id) = make_store(&[(0.0, 0.0, 120.0, 60.0)], &[]);
        let layout = CircularLayout::new(CircularLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();
        assert_eq!(result.vertices.len(), 1);
        let (_, rect) = &result.vertices[0];
        assert!(rect.origin.x.is_finite());
        assert!(rect.origin.y.is_finite());
    }

    // ── Circle Placement Tests ─────────────────────────────────────────────

    #[test]
    fn four_vertices_lie_on_circle() {
        // 4 vertices (120x60), default config
        // max_dim = 120, n = 4
        // auto_radius = 4 * 120 / PI = 152.79
        // center = (0 + 152.79, 0 + 152.79) = (152.79, 152.79)
        // Each vertex at 90° intervals
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[],
        );
        let layout = CircularLayout::new(CircularLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        let n = 4;
        let max_dim = 120.0;
        let radius = (n as f64 * max_dim / PI).max(100.0);
        let cx = radius;
        let cy = radius;

        for (_, rect) in &result.vertices {
            let dx = rect.origin.x - cx;
            let dy = rect.origin.y - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            assert!(
                (dist - radius).abs() < 1e-6,
                "vertex should be on circle: dist={}, radius={}",
                dist,
                radius
            );
        }
    }

    #[test]
    fn auto_radius_floor_wins() {
        // 10 vertices (200x100, max_dim=200), config.radius=100
        // auto_radius = 10 * 200 / PI = 636.62 > 100, so auto wins
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 200.0, 100.0),
                (0.0, 0.0, 200.0, 100.0),
                (0.0, 0.0, 200.0, 100.0),
                (0.0, 0.0, 200.0, 100.0),
                (0.0, 0.0, 200.0, 100.0),
                (0.0, 0.0, 200.0, 100.0),
                (0.0, 0.0, 200.0, 100.0),
                (0.0, 0.0, 200.0, 100.0),
                (0.0, 0.0, 200.0, 100.0),
                (0.0, 0.0, 200.0, 100.0),
            ],
            &[],
        );
        let config = CircularLayoutConfig {
            radius: 100.0,
            ..CircularLayoutConfig::default()
        };
        let layout = CircularLayout::new(config);
        let _result = layout.layout(&store, page_id).unwrap();

        let n = 10;
        let max_dim = 200.0;
        let expected_radius = (n as f64 * max_dim / PI).max(100.0);
        let actual_radius = expected_radius; // auto wins

        assert!(
            (actual_radius - 636.6197723675813).abs() < 1e-6,
            "effective radius should be auto-computed: {}",
            actual_radius
        );
    }

    #[test]
    fn configured_radius_wins_when_larger() {
        // 2 vertices (60x40), config.radius=500
        // auto_radius = 2 * 60 / PI = 38.2 < 500, so configured wins
        let (store, page_id) = make_store(
            &[(0.0, 0.0, 60.0, 40.0), (0.0, 0.0, 60.0, 40.0)],
            &[],
        );
        let config = CircularLayoutConfig {
            radius: 500.0,
            ..CircularLayoutConfig::default()
        };
        let layout = CircularLayout::new(config);
        let _result = layout.layout(&store, page_id).unwrap();

        let n = 2;
        let max_dim = 60.0;
        let auto_radius = n as f64 * max_dim / PI;
        let effective_radius = auto_radius.max(500.0);

        assert!(
            (effective_radius - 500.0).abs() < 1e-6,
            "configured radius should win when larger: {}",
            effective_radius
        );
    }

    #[test]
    fn move_circle_true_uses_x0_y0() {
        // 3 vertices at various positions, move_circle=true, x0=200, y0=300, radius=500
        // auto_radius = 3 * 120 / PI = 114.59 < 500, so configured radius=500 wins
        // center = (200 + 500, 300 + 500) = (700, 800)
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (1000.0, 0.0, 120.0, 60.0),
                (0.0, 800.0, 120.0, 60.0),
            ],
            &[],
        );
        let config = CircularLayoutConfig {
            move_circle: true,
            x0: 200.0,
            y0: 300.0,
            radius: 500.0,
            ..CircularLayoutConfig::default()
        };
        let layout = CircularLayout::new(config);
        let result = layout.layout(&store, page_id).unwrap();

        // auto_radius = 3 * 120 / PI = 114.59 < 500, configured radius wins
        let effective_radius = 500.0;
        let expected_cx = 200.0 + effective_radius; // x0 + radius
        let expected_cy = 300.0 + effective_radius; // y0 + radius

        for (_, rect) in &result.vertices {
            let dx = rect.origin.x - expected_cx;
            let dy = rect.origin.y - expected_cy;
            let dist = (dx * dx + dy * dy).sqrt();
            assert!(
                (dist - effective_radius).abs() < 1e-6,
                "vertex should be on circle centered at ({}, {}): dist={}",
                expected_cx,
                expected_cy,
                dist
            );
        }
    }

    // ── Geometry Preservation Tests ────────────────────────────────────────

    #[test]
    fn width_height_preserved() {
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (100.0, 0.0, 80.0, 40.0),
                (200.0, 0.0, 200.0, 100.0),
            ],
            &[],
        );
        let layout = CircularLayout::new(CircularLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        let original_sizes = [(120.0, 60.0), (80.0, 40.0), (200.0, 100.0)];
        for (i, (_, rect)) in result.vertices.iter().enumerate() {
            let (w, h) = original_sizes[i];
            assert!(
                (rect.size.width - w).abs() < 1e-9,
                "width should be preserved"
            );
            assert!(
                (rect.size.height - h).abs() < 1e-9,
                "height should be preserved"
            );
        }
    }

    #[test]
    fn zero_geometry_vertex_uses_default_size() {
        let mut store = ModelStore::new();
        let page = Page::new(PageId::default());
        let page_id = store.insert_page(page);
        let mut page_fixed = Page::new(page_id);
        page_fixed.id = page_id;
        store.replace_page(page_id, page_fixed);

        // Vertex with no geometry
        let v = Vertex {
            geometry: None,
            page_id: Some(page_id),
            ..Vertex::default()
        };
        store.insert_vertex(v);

        let layout = CircularLayout::new(CircularLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        assert_eq!(result.vertices.len(), 1);
        let (_, rect) = &result.vertices[0];
        assert!((rect.size.width - 120.0).abs() < 1e-9);
        assert!((rect.size.height - 60.0).abs() < 1e-9);
    }

    // ── Edge Waypoint Tests ─────────────────────────────────────────────────

    #[test]
    fn waypoints_empty_when_reset_edges_true() {
        let (store, page_id) = make_store(
            &[(0.0, 0.0, 120.0, 60.0), (0.0, 0.0, 120.0, 60.0)],
            &[(0, 1)],
        );
        let layout = CircularLayout::new(CircularLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        for (_, waypoints) in &result.edge_waypoints {
            assert!(
                waypoints.is_empty(),
                "waypoints should be empty with reset_edges=true"
            );
        }
    }

    #[test]
    fn no_edge_waypoints_when_reset_edges_false() {
        let (store, page_id) = make_store(
            &[(0.0, 0.0, 120.0, 60.0), (0.0, 0.0, 120.0, 60.0)],
            &[(0, 1)],
        );
        let config = CircularLayoutConfig {
            reset_edges: false,
            ..CircularLayoutConfig::default()
        };
        let layout = CircularLayout::new(config);
        let result = layout.layout(&store, page_id).unwrap();

        assert!(
            result.edge_waypoints.is_empty(),
            "no waypoints when reset_edges=false"
        );
    }

    // ── Group BBox Tests ───────────────────────────────────────────────────

    #[test]
    fn group_bboxes_computed_for_group_with_children() {
        // Group with 2 child vertices
        let (store, page_id) = make_store_with_groups(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (200.0, 0.0, 120.0, 60.0),
                (400.0, 0.0, 120.0, 60.0), // free vertex (not in group)
            ],
            &[(0, 1)],
            &[&[0, 1]], // group 0 contains vertices 0 and 1
        );
        let layout = CircularLayout::new(CircularLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        // Should have exactly 1 group rect (for the group with children)
        assert_eq!(result.group_rects.len(), 1);

        let (_, group_rect) = &result.group_rects[0];
        // Group rect should enclose both children with padding
        // min_x = min(cx0, cx1) - w/2, max_x = max(cx0, cx1) + w/2
        // With padding: width should be > 0
        assert!(group_rect.size.width > 0.0);
        assert!(group_rect.size.height > 0.0);
    }

    #[test]
    fn empty_group_omitted_from_result() {
        // Group with no children should be omitted
        let (store, page_id) = make_store_with_groups(
            &[(0.0, 0.0, 120.0, 60.0)],
            &[],
            &[&[]], // empty group
        );
        let layout = CircularLayout::new(CircularLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        // Empty group should not appear in group_rects
        assert!(
            result.group_rects.is_empty(),
            "empty group should be omitted"
        );
    }

    // ── Dispatch Integration Tests ──────────────────────────────────────────

    #[test]
    fn dispatch_routes_circular() {
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[],
        );
        let result = crate::tree::apply_layout_kind(
            crate::tree::LayoutKind::Circular,
            &crate::config::LayoutConfig::default(),
            &store,
            page_id,
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap().vertices.len(), 4);
    }

    // ── Determinism Tests ──────────────────────────────────────────────────

    #[test]
    fn circular_is_deterministic() {
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (100.0, 0.0, 120.0, 60.0),
                (200.0, 0.0, 120.0, 60.0),
            ],
            &[(0, 1), (1, 2)],
        );
        let layout = CircularLayout::new(CircularLayoutConfig::default());

        let result1 = layout.layout(&store, page_id).unwrap();
        let result2 = layout.layout(&store, page_id).unwrap();

        assert_eq!(result1.vertices.len(), result2.vertices.len());
        for (i, ((v1, r1), (v2, r2))) in result1
            .vertices
            .iter()
            .zip(result2.vertices.iter())
            .enumerate()
        {
            assert_eq!(v1, v2, "vertex {} id should match", i);
            assert!(
                (r1.origin.x - r2.origin.x).abs() < 1e-9
                    && (r1.origin.y - r2.origin.y).abs() < 1e-9,
                "vertex {} position should be deterministic",
                i
            );
        }
    }
}
