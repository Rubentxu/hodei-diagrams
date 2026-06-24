//! Circular layout integration tests.
//!
//! These tests exercise the full dispatch path through `apply_layout_kind`.

use diagram_core::edge::Edge;
use diagram_core::geometry::CellGeometry;
use diagram_core::group::Group;
use diagram_core::id::PageId;
use diagram_core::page::Page;
use diagram_core::store::ModelStore;
use diagram_core::vertex::Vertex;

use diagram_layout::config::{CircularLayoutConfig, LayoutConfig};
use diagram_layout::tree::{apply_layout_kind, LayoutKind};
use diagram_layout::CircularLayout;

fn make_store(
    vertices: &[(f64, f64, f64, f64)],
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
fn apply_layout_kind_circular_end_to_end() {
    // 5 vertices, 3 edges — full dispatch path
    let (store, page_id) = make_store(
        &[
            (0.0, 0.0, 120.0, 60.0),
            (0.0, 0.0, 120.0, 60.0),
            (0.0, 0.0, 120.0, 60.0),
            (0.0, 0.0, 120.0, 60.0),
            (0.0, 0.0, 120.0, 60.0),
        ],
        &[(0, 1), (1, 2), (2, 3)],
    );

    let result = apply_layout_kind(LayoutKind::Circular, &LayoutConfig::default(), &store, page_id);

    assert!(result.is_ok(), "layout should succeed");
    let result = result.unwrap();
    assert_eq!(result.vertices.len(), 5, "all vertices should be positioned");

    // All coords should be finite
    for (_, rect) in &result.vertices {
        assert!(rect.origin.x.is_finite(), "x should be finite");
        assert!(rect.origin.y.is_finite(), "y should be finite");
    }

    // Default reset_edges=true means all waypoints empty
    assert!(
        result.edge_waypoints.iter().all(|(_, wp)| wp.is_empty()),
        "all waypoints should be empty with reset_edges=true"
    );
}

#[test]
fn circular_is_deterministic_on_identical_store() {
    // Run layout twice on identical store — positions should be bit-equal
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

#[test]
fn circular_with_groups_produces_group_rects() {
    // 1 group containing 2 vertices, 1 free vertex
    let mut store = ModelStore::new();
    let page = Page::new(PageId::default());
    let page_id = store.insert_page(page);
    let mut page_fixed = Page::new(page_id);
    page_fixed.id = page_id;
    store.replace_page(page_id, page_fixed);

    // Create vertices
    let v1 = store.insert_vertex(Vertex {
        geometry: Some(CellGeometry {
            x: 0.0,
            y: 0.0,
            width: 120.0,
            height: 60.0,
            relative: false,
            ..Default::default()
        }),
        page_id: Some(page_id),
        ..Vertex::default()
    });

    let v2 = store.insert_vertex(Vertex {
        geometry: Some(CellGeometry {
            x: 200.0,
            y: 0.0,
            width: 120.0,
            height: 60.0,
            relative: false,
            ..Default::default()
        }),
        page_id: Some(page_id),
        ..Vertex::default()
    });

    let _v3 = store.insert_vertex(Vertex {
        geometry: Some(CellGeometry {
            x: 400.0,
            y: 0.0,
            width: 120.0,
            height: 60.0,
            relative: false,
            ..Default::default()
        }),
        page_id: Some(page_id),
        ..Vertex::default()
    });

    // Create group with children v1 and v2
    let group = Group {
        page_id: Some(page_id),
        ..Group::default()
    };
    let gid = store.insert_group(group);

    // Assign v1 and v2 to group
    if let Some(vertex) = store.vertex_mut(v1) {
        vertex.parent = Some(gid);
    }
    if let Some(vertex) = store.vertex_mut(v2) {
        vertex.parent = Some(gid);
    }

    // Create edge
    store.insert_edge(Edge {
        source: v1,
        target: v2,
        page_id: Some(page_id),
        ..Edge::default()
    });

    let layout = CircularLayout::new(CircularLayoutConfig::default());
    let result = layout.layout(&store, page_id).unwrap();

    // Should have exactly 1 group rect (for group with children)
    assert_eq!(result.group_rects.len(), 1, "group with children should produce a rect");

    let (_, group_rect) = &result.group_rects[0];
    // Group rect should have positive dimensions (encloses children + padding)
    assert!(group_rect.size.width > 0.0);
    assert!(group_rect.size.height > 0.0);
}
