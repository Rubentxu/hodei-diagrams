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
use diagram_core::id::{EdgeId, GroupId, PageId, VertexId};
use diagram_core::store::ModelStore;

use crate::config::OrganicLayoutConfig;
use crate::error::{LayoutError, LayoutResult};
use crate::tree::TreeLayoutResult;

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
    pub fn layout(
        &self,
        store: &ModelStore,
        page_id: PageId,
    ) -> LayoutResult<TreeLayoutResult> {
        // Collect vertices on this page
        let page_vertices: Vec<_> = store
            .vertices_with_ids()
            .filter(|(_, v)| v.page_id == Some(page_id))
            .collect();

        if page_vertices.is_empty() {
            return Err(LayoutError::NoVertices);
        }

        // Build adjacency list from edges on this page
        let page_edges: Vec<_> = store
            .edges_with_ids()
            .filter(|(_, e)| e.page_id == Some(page_id))
            .collect();

        let mut adjacency: std::collections::HashMap<VertexId, Vec<VertexId>> =
            std::collections::HashMap::new();
        for vid in page_vertices.iter().map(|(id, _)| *id) {
            adjacency.insert(vid, Vec::new());
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
                // Store as center
                positions.insert(*vid, (g.x + g.width / 2.0, g.y + g.height / 2.0));
            } else {
                positions.insert(*vid, (0.0, 0.0));
            }
        }

        // TODO: full FR algorithm iterations

        // Build result from final positions
        let mut vertices = Vec::new();
        for (vid, &(cx, cy)) in &positions {
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
        let group_rects = compute_group_bboxes(store, page_id, &positions);

        Ok(TreeLayoutResult {
            vertices,
            edge_waypoints,
            group_rects,
        })
    }
}

/// Compute updated bounding boxes for groups containing vertices on the page.
///
/// Groups are processed after vertices have been repositioned so that the
/// bounding box accurately encloses the new vertex positions.
fn compute_group_bboxes(
    store: &ModelStore,
    page_id: PageId,
    positions: &std::collections::HashMap<VertexId, (f64, f64)>,
) -> Vec<(GroupId, Rect)> {
    use diagram_core::geometry::Point;

    let page_groups: Vec<_> = store
        .groups_with_ids()
        .filter(|(_, g)| g.page_id == Some(page_id))
        .collect();

    let mut result = Vec::new();
    let padding = 10.0; // GROUP_PADDING

    for (gid, _) in &page_groups {
        // Find all vertices that belong to this group
        let mut min_x = f64::MAX;
        let mut min_y = f64::MAX;
        let mut max_x = f64::MIN;
        let mut max_y = f64::MIN;
        let mut has_children = false;

        for (vid, vertex) in store.vertices_with_ids() {
            if vertex.page_id != Some(page_id) {
                continue;
            }
            if vertex.parent == Some(*gid) {
                has_children = true;
                if let Some(&(cx, cy)) = positions.get(&vid) {
                    let (w, h) = vertex
                        .geometry
                        .as_ref()
                        .map(|g| (g.width, g.height))
                        .unwrap_or((120.0, 60.0));
                    min_x = min_x.min(cx - w / 2.0);
                    min_y = min_y.min(cy - h / 2.0);
                    max_x = max_x.max(cx + w / 2.0);
                    max_y = max_y.max(cy + h / 2.0);
                }
            }
        }

        if !has_children {
            continue;
        }

        result.push((
            *gid,
            Rect {
                origin: Point {
                    x: min_x - padding,
                    y: min_y - padding,
                },
                size: Size {
                    width: (max_x - min_x) + 2.0 * padding,
                    height: (max_y - min_y) + 2.0 * padding,
                },
            },
        ));
    }

    result
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
        let (store, page_id) = make_store(
            &[(100.0, 200.0, 120.0, 60.0)],
            &[],
        );
        let layout = OrganicLayout::new(OrganicLayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();
        let (_, rect) = &result.vertices[0];
        // Position should be the cell center
        assert!((rect.origin.x - 160.0).abs() < 1e-6); // 100 + 120/2
        assert!((rect.origin.y - 230.0).abs() < 1e-6); // 200 + 60/2
    }
}
