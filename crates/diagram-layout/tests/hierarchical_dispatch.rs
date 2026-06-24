//! Hierarchical layout integration tests.
//!
//! These tests exercise the full `HierarchicalLayout` pipeline directly,
//! since it does not go through `apply_layout_kind` (which returns
//! `TreeLayoutResult`).

use diagram_core::edge::Edge;
use diagram_core::geometry::CellGeometry;
use diagram_core::id::PageId;
use diagram_core::page::Page;
use diagram_core::store::ModelStore;
use diagram_core::vertex::Vertex;

use diagram_layout::HierarchicalLayout;
use diagram_layout::config::LayoutConfig;

fn make_store(vertices: &[(f64, f64, f64, f64)], edges: &[(usize, usize)]) -> (ModelStore, PageId) {
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
fn apply_hierarchical_layout_end_to_end() {
    // 5 vertices, 4 edges — full pipeline: cycle removal → layering → crossing → coords
    let (mut store, page_id) = make_store(
        &[
            (0.0, 0.0, 120.0, 60.0),
            (0.0, 0.0, 120.0, 60.0),
            (0.0, 0.0, 120.0, 60.0),
            (0.0, 0.0, 120.0, 60.0),
            (0.0, 0.0, 120.0, 60.0),
        ],
        &[(0, 1), (1, 2), (2, 3), (3, 4)],
    );

    let layout = HierarchicalLayout::with_default_config();
    let result = layout.layout(&mut store, page_id);

    assert!(result.is_ok(), "layout should succeed");

    // All vertices should have finite positions after layout
    for vid in store.vertices_with_ids().map(|(id, _)| id) {
        let v = store.vertex(vid).unwrap();
        let g = v.geometry.expect("vertex should have geometry after layout");
        assert!(g.x.is_finite(), "x must be finite");
        assert!(g.y.is_finite(), "y must be finite");
    }
}

#[test]
fn hierarchical_top_to_bottom_invariant() {
    // Edges point from root to leaves: all targets should be below sources
    let (mut store, page_id) = make_store(
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
fn hierarchical_is_deterministic_on_identical_store() {
    let (mut store1, page_id1) = make_store(
        &[
            (10.0, 10.0, 120.0, 60.0),
            (10.0, 10.0, 100.0, 50.0),
            (10.0, 10.0, 80.0, 40.0),
        ],
        &[(0, 1), (1, 2)],
    );

    let (mut store2, page_id2) = make_store(
        &[
            (10.0, 10.0, 120.0, 60.0),
            (10.0, 10.0, 100.0, 50.0),
            (10.0, 10.0, 80.0, 40.0),
        ],
        &[(0, 1), (1, 2)],
    );

    let layout = HierarchicalLayout::with_default_config();

    layout.layout(&mut store1, page_id1).unwrap();
    layout.layout(&mut store2, page_id2).unwrap();

    // Collect positions from both stores
    let positions1: Vec<_> = store1
        .vertices_with_ids()
        .map(|(id, v)| {
            let g = v.geometry.unwrap();
            (id, g.x, g.y)
        })
        .collect();

    let positions2: Vec<_> = store2
        .vertices_with_ids()
        .map(|(id, v)| {
            let g = v.geometry.unwrap();
            (id, g.x, g.y)
        })
        .collect();

    assert_eq!(positions1.len(), positions2.len());
    for ((id1, x1, y1), (id2, x2, y2)) in positions1.iter().zip(positions2.iter()) {
        assert_eq!(id1, id2);
        assert!(
            (x1 - x2).abs() < 1e-9 && (y1 - y2).abs() < 1e-9,
            "position for vertex {:?} should be deterministic",
            id1
        );
    }
}

#[test]
fn hierarchical_empty_page_returns_ok() {
    let mut store = ModelStore::new();
    let page = Page::new(PageId::default());
    let page_id = store.insert_page(page);
    let mut page_fixed = Page::new(page_id);
    page_fixed.id = page_id;
    store.replace_page(page_id, page_fixed);

    let layout = HierarchicalLayout::with_default_config();
    assert!(layout.layout(&mut store, page_id).is_ok());
}

#[test]
fn hierarchical_single_vertex_no_edges() {
    let (mut store, page_id) = make_store(&[(0.0, 0.0, 120.0, 60.0)], &[]);

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
fn hierarchical_left_to_right_invariant() {
    let (mut store, page_id) = make_store(
        &[
            (0.0, 0.0, 120.0, 60.0),
            (200.0, 0.0, 120.0, 60.0),
            (0.0, 0.0, 120.0, 60.0),
        ],
        &[(0, 1), (1, 2)],
    );

    let cfg = LayoutConfig {
        direction: diagram_layout::config::Direction::LeftToRight,
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
