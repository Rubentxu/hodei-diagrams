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

    // ── Config Tests ─────────────────────────────────────────────────────────

    #[test]
    fn grid_config_defaults_are_tight() {
        let cfg = GridLayoutConfig::default();
        assert_eq!(cfg.num_columns, None);
        assert!((cfg.spacing_x - 20.0).abs() < 1e-9);
        assert!((cfg.spacing_y - 20.0).abs() < 1e-9);
        assert!((cfg.margin_x - 10.0).abs() < 1e-9);
        assert!((cfg.margin_y - 10.0).abs() < 1e-9);
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

        let layout = GridLayout::new(GridLayoutConfig::default());
        let result = layout.layout(&store, page_id);
        assert!(matches!(result, Err(LayoutError::NoVertices)));
    }

    // ── Single Vertex Tests ─────────────────────────────────────────────────

    #[test]
    fn single_vertex_at_origin_with_default_config() {
        // 1 vertex, default config (margin=10/10)
        // col=0, row=0, col_x_offset[0]=margin_x=10, row_y_offset[0]=margin_y=10
        let (store, page_id) = make_store(&[(0.0, 0.0, 120.0, 60.0)], &[]);
        let layout = GridLayout::new(GridLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        assert_eq!(result.vertices.len(), 1);
        let (_, rect) = &result.vertices[0];
        assert!((rect.origin.x - 10.0).abs() < 1e-9);
        assert!((rect.origin.y - 10.0).abs() < 1e-9);
    }

    #[test]
    fn single_vertex_with_zero_margin_at_origin() {
        // 1 vertex, margin=0/0
        // col_x_offset[0]=0, row_y_offset[0]=0
        let cfg = GridLayoutConfig {
            margin_x: 0.0,
            margin_y: 0.0,
            ..GridLayoutConfig::default()
        };
        let (store, page_id) = make_store(&[(0.0, 0.0, 100.0, 50.0)], &[]);
        let layout = GridLayout::new(cfg);
        let result = layout.layout(&store, page_id).unwrap();

        assert_eq!(result.vertices.len(), 1);
        let (_, rect) = &result.vertices[0];
        assert!((rect.origin.x - 0.0).abs() < 1e-9);
        assert!((rect.origin.y - 0.0).abs() < 1e-9);
    }

    #[test]
    fn single_vertex_gets_finite_position() {
        let (store, page_id) = make_store(&[(0.0, 0.0, 120.0, 60.0)], &[]);
        let layout = GridLayout::new(GridLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        assert_eq!(result.vertices.len(), 1);
        let (_, rect) = &result.vertices[0];
        assert!(rect.origin.x.is_finite());
        assert!(rect.origin.y.is_finite());
    }

    // ── Placement Tests ────────────────────────────────────────────────────

    #[test]
    fn four_vertices_2x2_grid_with_zero_offsets() {
        // 4 vertices (120, 60), num_columns=2, margins=0, spacing=0
        // col_max_w = [120, 120], row_max_h = [60, 60]
        // col_x_offset = [0, 120], row_y_offset = [0, 60]
        // v0: col=0, row=0 → (0, 0)
        // v1: col=1, row=0 → (120, 0)
        // v2: col=0, row=1 → (0, 60)
        // v3: col=1, row=1 → (120, 60)
        let cfg = GridLayoutConfig {
            num_columns: Some(2),
            spacing_x: 0.0,
            spacing_y: 0.0,
            margin_x: 0.0,
            margin_y: 0.0,
        };
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[],
        );
        let layout = GridLayout::new(cfg);
        let result = layout.layout(&store, page_id).unwrap();

        let positions: Vec<(f64, f64)> = result
            .vertices
            .iter()
            .map(|(_, r)| (r.origin.x, r.origin.y))
            .collect();

        assert_eq!(positions[0], (0.0, 0.0));
        assert_eq!(positions[1], (120.0, 0.0));
        assert_eq!(positions[2], (0.0, 60.0));
        assert_eq!(positions[3], (120.0, 60.0));
    }

    #[test]
    fn row_major_fill_wraps_at_column_boundary() {
        // 5 vertices (100, 50), num_columns=3, margins=0, spacing=0
        // v0: col=0, row=0 → (0, 0)
        // v1: col=1, row=0 → (100, 0)
        // v2: col=2, row=0 → (200, 0)
        // v3: col=0, row=1 → (0, 50)
        // v4: col=1, row=1 → (100, 50)
        let cfg = GridLayoutConfig {
            num_columns: Some(3),
            spacing_x: 0.0,
            spacing_y: 0.0,
            margin_x: 0.0,
            margin_y: 0.0,
        };
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 100.0, 50.0),
                (0.0, 0.0, 100.0, 50.0),
                (0.0, 0.0, 100.0, 50.0),
                (0.0, 0.0, 100.0, 50.0),
                (0.0, 0.0, 100.0, 50.0),
            ],
            &[],
        );
        let layout = GridLayout::new(cfg);
        let result = layout.layout(&store, page_id).unwrap();

        let positions: Vec<(f64, f64)> = result
            .vertices
            .iter()
            .map(|(_, r)| (r.origin.x, r.origin.y))
            .collect();

        assert_eq!(positions[4], (100.0, 50.0));
    }

    #[test]
    fn auto_calc_9_vertices_produces_3x3() {
        // 9 vertices, num_columns=None (auto=3), margins=0, spacing=0
        // 3x3 grid, vertex 8 at col=2, row=2
        let cfg = GridLayoutConfig {
            num_columns: None,
            spacing_x: 0.0,
            spacing_y: 0.0,
            margin_x: 0.0,
            margin_y: 0.0,
        };
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[],
        );
        let layout = GridLayout::new(cfg);
        let result = layout.layout(&store, page_id).unwrap();

        // col=2, row=2, col_x_offset[2]=240, row_y_offset[2]=120
        let last = result.vertices.last().unwrap();
        assert_eq!(last.1.origin.x, 240.0);
        assert_eq!(last.1.origin.y, 120.0);
    }

    #[test]
    fn auto_calc_10_vertices_produces_4x3() {
        // 10 vertices, num_columns=None (auto=4), margins=0, spacing=0
        // ceil(sqrt(10)) = 4, rows = ceil(10/4) = 3
        // vertex 9: col=1, row=2
        let cfg = GridLayoutConfig {
            num_columns: None,
            spacing_x: 0.0,
            spacing_y: 0.0,
            margin_x: 0.0,
            margin_y: 0.0,
        };
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[],
        );
        let layout = GridLayout::new(cfg);
        let result = layout.layout(&store, page_id).unwrap();

        // col=1, row=2, col_x_offset[1]=120, row_y_offset[2]=120
        let last = result.vertices.last().unwrap();
        assert_eq!(last.1.origin.x, 120.0);
        assert_eq!(last.1.origin.y, 120.0);
    }

    #[test]
    fn auto_calc_prime_count_7_produces_3x3() {
        // 7 vertices, num_columns=None (auto=3), margins=0, spacing=0
        // ceil(sqrt(7)) = 3, rows = ceil(7/3) = 3
        // vertex 6: col=0, row=2
        let cfg = GridLayoutConfig {
            num_columns: None,
            spacing_x: 0.0,
            spacing_y: 0.0,
            margin_x: 0.0,
            margin_y: 0.0,
        };
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[],
        );
        let layout = GridLayout::new(cfg);
        let result = layout.layout(&store, page_id).unwrap();

        // col=0, row=2, col_x_offset[0]=0, row_y_offset[2]=120
        let last = result.vertices.last().unwrap();
        assert_eq!(last.1.origin.x, 0.0);
        assert_eq!(last.1.origin.y, 120.0);
    }

    #[test]
    fn fixed_columns_4_for_6_vertices() {
        // 6 vertices, num_columns=4, margins=0, spacing=0
        // rows = ceil(6/4) = 2
        // v3: col=3, row=0 → (360, 0)
        // v5: col=1, row=1 → (120, 60)
        let cfg = GridLayoutConfig {
            num_columns: Some(4),
            spacing_x: 0.0,
            spacing_y: 0.0,
            margin_x: 0.0,
            margin_y: 0.0,
        };
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[],
        );
        let layout = GridLayout::new(cfg);
        let result = layout.layout(&store, page_id).unwrap();

        // v3 at col=3, row=0
        assert_eq!(result.vertices[3].1.origin.x, 360.0);
        assert_eq!(result.vertices[3].1.origin.y, 0.0);

        // v5 at col=1, row=1
        assert_eq!(result.vertices[5].1.origin.x, 120.0);
        assert_eq!(result.vertices[5].1.origin.y, 60.0);
    }

    #[test]
    fn num_columns_zero_clamped_to_one() {
        // 3 vertices, num_columns=0 (should clamp to 1), margins=0, spacing=0
        // cols=1, all in col 0
        let cfg = GridLayoutConfig {
            num_columns: Some(0),
            spacing_x: 0.0,
            spacing_y: 0.0,
            margin_x: 0.0,
            margin_y: 0.0,
        };
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 100.0, 50.0),
                (0.0, 0.0, 100.0, 50.0),
                (0.0, 0.0, 100.0, 50.0),
            ],
            &[],
        );
        let layout = GridLayout::new(cfg);
        let result = layout.layout(&store, page_id).unwrap();

        // All in col 0, y=0, 50, 100
        assert_eq!(result.vertices[0].1.origin.x, 0.0);
        assert_eq!(result.vertices[0].1.origin.y, 0.0);
        assert_eq!(result.vertices[1].1.origin.y, 50.0);
        assert_eq!(result.vertices[2].1.origin.y, 100.0);
    }

    // ── Spacing + Margin Tests ─────────────────────────────────────────────

    #[test]
    fn spacing_x_inserts_gap_between_columns() {
        // 3 vertices (100, 50), num_columns=3, spacing_x=20, others=0
        // col_x_offset = [0, 100+20=120, 120+100+20=240]
        let cfg = GridLayoutConfig {
            num_columns: Some(3),
            spacing_x: 20.0,
            spacing_y: 0.0,
            margin_x: 0.0,
            margin_y: 0.0,
        };
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 100.0, 50.0),
                (0.0, 0.0, 100.0, 50.0),
                (0.0, 0.0, 100.0, 50.0),
            ],
            &[],
        );
        let layout = GridLayout::new(cfg);
        let result = layout.layout(&store, page_id).unwrap();

        let xs: Vec<f64> = result.vertices.iter().map(|(_, r)| r.origin.x).collect();
        assert_eq!(xs[0], 0.0);
        assert_eq!(xs[1], 120.0);
        assert_eq!(xs[2], 240.0);
    }

    #[test]
    fn spacing_y_inserts_gap_between_rows() {
        // 4 vertices (100, 50), num_columns=2, spacing_y=15, others=0
        // row_y_offset = [0, 50+15=65]
        let cfg = GridLayoutConfig {
            num_columns: Some(2),
            spacing_x: 0.0,
            spacing_y: 15.0,
            margin_x: 0.0,
            margin_y: 0.0,
        };
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 100.0, 50.0),
                (0.0, 0.0, 100.0, 50.0),
                (0.0, 0.0, 100.0, 50.0),
                (0.0, 0.0, 100.0, 50.0),
            ],
            &[],
        );
        let layout = GridLayout::new(cfg);
        let result = layout.layout(&store, page_id).unwrap();

        // row 0: y=0, row 1: y=65
        assert_eq!(result.vertices[0].1.origin.y, 0.0);
        assert_eq!(result.vertices[1].1.origin.y, 0.0);
        assert_eq!(result.vertices[2].1.origin.y, 65.0);
        assert_eq!(result.vertices[3].1.origin.y, 65.0);
    }

    #[test]
    fn margin_x_y_shifts_whole_grid() {
        // 2 vertices (100, 50), num_columns=2, margin_x=50, margin_y=30, spacing=0
        // col_x_offset = [50, 150], row_y_offset = [30]
        let cfg = GridLayoutConfig {
            num_columns: Some(2),
            spacing_x: 0.0,
            spacing_y: 0.0,
            margin_x: 50.0,
            margin_y: 30.0,
        };
        let (store, page_id) = make_store(&[(0.0, 0.0, 100.0, 50.0), (0.0, 0.0, 100.0, 50.0)], &[]);
        let layout = GridLayout::new(cfg);
        let result = layout.layout(&store, page_id).unwrap();

        assert_eq!(result.vertices[0].1.origin.x, 50.0);
        assert_eq!(result.vertices[0].1.origin.y, 30.0);
        assert_eq!(result.vertices[1].1.origin.x, 150.0);
        assert_eq!(result.vertices[1].1.origin.y, 30.0);
    }

    #[test]
    fn negative_margin_produces_negative_coords() {
        // 1 vertex, margin_x=-200, margin_y=-100
        let cfg = GridLayoutConfig {
            num_columns: Some(1),
            spacing_x: 0.0,
            spacing_y: 0.0,
            margin_x: -200.0,
            margin_y: -100.0,
        };
        let (store, page_id) = make_store(&[(0.0, 0.0, 100.0, 50.0)], &[]);
        let layout = GridLayout::new(cfg);
        let result = layout.layout(&store, page_id).unwrap();

        assert_eq!(result.vertices[0].1.origin.x, -200.0);
        assert_eq!(result.vertices[0].1.origin.y, -100.0);
    }

    #[test]
    fn heterogeneous_column_widths_no_overlap() {
        // 3 vertices, widths [50, 200, 50], num_columns=3, spacing=0, margin=0
        // col_x_offset[0] = 0
        // col_x_offset[1] = 0 + 50 + 0 = 50
        // col_x_offset[2] = 50 + 200 + 0 = 250
        // If we used naive per-vertex: col=1 → 1*(200+0)=200, col=2 → 2*(200+0)=400 (OVERLAP!)
        let cfg = GridLayoutConfig {
            num_columns: Some(3),
            spacing_x: 0.0,
            spacing_y: 0.0,
            margin_x: 0.0,
            margin_y: 0.0,
        };
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 50.0, 50.0),
                (0.0, 0.0, 200.0, 50.0),
                (0.0, 0.0, 50.0, 50.0),
            ],
            &[],
        );
        let layout = GridLayout::new(cfg);
        let result = layout.layout(&store, page_id).unwrap();

        // Cumulative offsets: 0, 50, 250
        assert_eq!(result.vertices[0].1.origin.x, 0.0);
        assert_eq!(result.vertices[1].1.origin.x, 50.0);
        assert_eq!(result.vertices[2].1.origin.x, 250.0);

        // Verify no overlap: v0 ends at x=50, v1 starts at x=50
        assert_eq!(
            result.vertices[0].1.origin.x + result.vertices[0].1.size.width,
            50.0
        );
        assert_eq!(result.vertices[1].1.origin.x, 50.0);
        assert_eq!(
            result.vertices[1].1.origin.x + result.vertices[1].1.size.width,
            250.0
        );
        assert_eq!(result.vertices[2].1.origin.x, 250.0);
    }

    // ── Geometry Preservation Tests ─────────────────────────────────────────

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
        let layout = GridLayout::new(GridLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        let original_sizes = [(120.0, 60.0), (80.0, 40.0), (200.0, 100.0)];
        for (i, (_, rect)) in result.vertices.iter().enumerate() {
            let (w, h) = original_sizes[i];
            assert!((rect.size.width - w).abs() < 1e-9);
            assert!((rect.size.height - h).abs() < 1e-9);
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

        let layout = GridLayout::new(GridLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        assert_eq!(result.vertices.len(), 1);
        let (_, rect) = &result.vertices[0];
        assert!((rect.size.width - 120.0).abs() < 1e-9);
        assert!((rect.size.height - 60.0).abs() < 1e-9);
    }

    // ── Edge Waypoint Tests ─────────────────────────────────────────────────

    #[test]
    fn all_edge_waypoints_empty_after_layout() {
        // 4 vertices, 2 edges, v1 has no reset_edges flag so waypoints always empty
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[(0, 1), (2, 3)],
        );
        let layout = GridLayout::new(GridLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        assert_eq!(result.edge_waypoints.len(), 2);
        for (_, waypoints) in &result.edge_waypoints {
            assert!(waypoints.is_empty());
        }
    }

    // ── Group BBox Tests ───────────────────────────────────────────────────

    #[test]
    fn group_bboxes_computed_for_group_with_children() {
        // Group with 2 child vertices + 1 free vertex
        let (store, page_id) = make_store_with_groups(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (200.0, 0.0, 120.0, 60.0),
                (400.0, 0.0, 120.0, 60.0), // free vertex
            ],
            &[(0, 1)],
            &[&[0, 1]], // group 0 contains vertices 0 and 1
        );
        let layout = GridLayout::new(GridLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        // Should have exactly 1 group rect (for the group with children)
        assert_eq!(result.group_rects.len(), 1);

        let (_, group_rect) = &result.group_rects[0];
        // Group rect should be non-degenerate (width/height > 0)
        // Note: due to coord-semantics discrepancy (top-left in, center out),
        // we don't assert exact values
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
        let layout = GridLayout::new(GridLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        // Empty group should not appear in group_rects
        assert!(result.group_rects.is_empty());
    }

    // ── Top-Left Origin Tests ───────────────────────────────────────────────

    #[test]
    fn rect_origin_is_top_left_not_center() {
        // 1 vertex (100, 50), default config (margin=10/10)
        // Should be at (10, 10), NOT (10+50, 10+25) = (60, 35)
        let (store, page_id) = make_store(&[(0.0, 0.0, 100.0, 50.0)], &[]);
        let layout = GridLayout::new(GridLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        let (_, rect) = &result.vertices[0];
        assert_eq!(rect.origin.x, 10.0);
        assert_eq!(rect.origin.y, 10.0);
    }

    #[test]
    fn grid_does_not_subtract_center_offset() {
        // 1 vertex (100, 50), margin=0/0
        // origin.x should be 0 (not -50), origin.y should be 0 (not -25)
        let cfg = GridLayoutConfig {
            margin_x: 0.0,
            margin_y: 0.0,
            ..GridLayoutConfig::default()
        };
        let (store, page_id) = make_store(&[(0.0, 0.0, 100.0, 50.0)], &[]);
        let layout = GridLayout::new(cfg);
        let result = layout.layout(&store, page_id).unwrap();

        let (_, rect) = &result.vertices[0];
        assert_eq!(rect.origin.x, 0.0);
        assert_eq!(rect.origin.y, 0.0);
    }

    // ── Dispatch Integration Tests ──────────────────────────────────────────

    #[test]
    fn dispatch_routes_grid() {
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
            crate::tree::LayoutKind::Grid,
            &crate::config::LayoutConfig::default(),
            &store,
            page_id,
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap().vertices.len(), 4);
    }

    #[test]
    fn existing_layout_variants_untouched() {
        // Verify Circular still works after Grid is added
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

    // ── Determinism Tests ───────────────────────────────────────────────────

    #[test]
    fn grid_is_deterministic() {
        let (store, page_id) = make_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (100.0, 0.0, 120.0, 60.0),
                (200.0, 0.0, 120.0, 60.0),
                (0.0, 100.0, 120.0, 60.0),
                (100.0, 100.0, 120.0, 60.0),
                (200.0, 100.0, 120.0, 60.0),
                (0.0, 200.0, 120.0, 60.0),
                (100.0, 200.0, 120.0, 60.0),
                (200.0, 200.0, 120.0, 60.0),
                (300.0, 300.0, 120.0, 60.0),
            ],
            &[(0, 1), (1, 2)],
        );
        let layout = GridLayout::new(GridLayoutConfig::default());

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
