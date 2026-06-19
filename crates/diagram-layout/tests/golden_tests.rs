//! Golden fixture tests for diagram-layout.
//!
//! Parses real `.drawio` files from `tests/fixtures/`, runs the Sugiyama
//! layout pipeline, and asserts position invariants. These are integration
//! tests that exercise the full parse → layout → write cycle.

use diagram_core::store::ModelStore;
use diagram_format_drawio::{DrawioMapping, parse_drawio};

use diagram_layout::{Direction, HierarchicalLayout, LayoutConfig};

/// Helper: parse a `.drawio` fixture, map to domain model, return the store
/// and first page's ID.
fn load_fixture(path: &str) -> (ModelStore, diagram_core::id::PageId) {
    let xml = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("failed to read fixture {path}: {e}"));
    let raw = parse_drawio(&xml).unwrap_or_else(|e| panic!("failed to parse {path}: {e}"));
    let mapping = DrawioMapping;
    let (model, _id_map) = mapping
        .to_domain(&raw)
        .unwrap_or_else(|e| panic!("failed to map {path}: {e}"));

    // Get the first page ID
    let page_id = model
        .store
        .pages_with_ids()
        .next()
        .map(|(pid, _)| pid)
        .expect("fixture should have at least one page");

    (model.store, page_id)
}

#[test]
fn simple_hierarchy_gets_valid_positions() {
    let (mut store, page_id) = load_fixture("tests/fixtures/simple-hierarchy.drawio");
    let layout = HierarchicalLayout::with_default_config();
    layout.layout(&mut store, page_id).unwrap();

    // All 3 vertices have non-NaN finite positions, distinct from each other
    let positions: Vec<_> = store
        .vertices_with_ids()
        .map(|(_, v)| {
            let g = v.geometry.expect("vertex should have geometry");
            (g.x, g.y)
        })
        .collect();

    assert_eq!(positions.len(), 3);
    for (i, (x, y)) in positions.iter().enumerate() {
        assert!(x.is_finite(), "vertex {i}: x must be finite, got {x}");
        assert!(y.is_finite(), "vertex {i}: y must be finite, got {y}");
    }

    // Positions should be distinct (different layers)
    let mut ys: Vec<f64> = positions.iter().map(|&(_, y)| y).collect();
    ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
    assert!(
        ys[2] - ys[0] > 0.0,
        "vertices should be at different y positions"
    );
}

#[test]
fn top_to_bottom_edges_point_downward() {
    let (mut store, page_id) = load_fixture("tests/fixtures/diamond.drawio");
    let layout = HierarchicalLayout::with_default_config();
    layout.layout(&mut store, page_id).unwrap();

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
fn left_to_right_edges_point_rightward() {
    let (mut store, page_id) = load_fixture("tests/fixtures/simple-hierarchy.drawio");
    let cfg = LayoutConfig {
        direction: Direction::LeftToRight,
        ..LayoutConfig::default()
    };
    let layout = HierarchicalLayout::new(cfg);
    layout.layout(&mut store, page_id).unwrap();

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
fn deterministic_output() {
    // Load fixture once, run layout twice on the same store.
    // The pipeline may swap symmetric nodes (B and C in a diamond
    // have identical connectivity), so we check that positions are
    // stable within a tolerance and that y-ordering is preserved.
    let (mut store, page_id) = load_fixture("tests/fixtures/diamond.drawio");
    let layout = HierarchicalLayout::with_default_config();

    // Run layout once
    layout.layout(&mut store, page_id).unwrap();

    let first_positions: Vec<(f64, f64)> = store
        .vertices_with_ids()
        .map(|(_, v)| {
            let g = v.geometry.unwrap();
            (g.x, g.y)
        })
        .collect();

    // Run layout a second time
    layout.layout(&mut store, page_id).unwrap();

    // Check that all y-positions are stable (layers don't change)
    for ((_, v), (_, y1)) in store.vertices_with_ids().zip(first_positions.iter()) {
        let g = v.geometry.unwrap();
        assert!(
            (g.y - y1).abs() < 0.1,
            "determinism: y changed from {y1} to {} — ranks should be stable",
            g.y
        );
    }

    // Check that the MULTISET of x-positions per layer is the same
    // (nodes in the same layer may swap but their x coordinates
    // should be from the same stable set)
    let second_positions: Vec<(f64, f64)> = store
        .vertices_with_ids()
        .map(|(_, v)| {
            let g = v.geometry.unwrap();
            (g.x, g.y)
        })
        .collect();

    // Sort positions by y then x for comparison
    let mut first_sorted = first_positions.clone();
    first_sorted.sort_by(|a, b| {
        a.1.partial_cmp(&b.1)
            .unwrap()
            .then(a.0.partial_cmp(&b.0).unwrap())
    });
    let mut second_sorted = second_positions.clone();
    second_sorted.sort_by(|a, b| {
        a.1.partial_cmp(&b.1)
            .unwrap()
            .then(a.0.partial_cmp(&b.0).unwrap())
    });

    for (i, ((x1, y1), (x2, y2))) in first_sorted.iter().zip(second_sorted.iter()).enumerate() {
        assert!(
            (x1 - x2).abs() < 1.0,
            "determinism: sorted x differs at index {i}: {x1} vs {x2}"
        );
        assert!(
            (y1 - y2).abs() < 0.1,
            "determinism: sorted y differs at index {i}: {y1} vs {y2}"
        );
    }
}

#[test]
fn single_vertex_gets_position() {
    let (mut store, page_id) = load_fixture("tests/fixtures/single-vertex.drawio");
    let layout = HierarchicalLayout::with_default_config();
    layout.layout(&mut store, page_id).unwrap();

    let g = store
        .vertices_with_ids()
        .next()
        .expect("should have one vertex")
        .1
        .geometry
        .expect("vertex should have geometry after layout");
    assert!(g.x.is_finite(), "x must be finite: {}", g.x);
    assert!(g.y.is_finite(), "y must be finite: {}", g.y);
}

#[test]
fn empty_page_no_panic() {
    let (mut store, page_id) = load_fixture("tests/fixtures/empty-page.drawio");
    let layout = HierarchicalLayout::with_default_config();
    let result = layout.layout(&mut store, page_id);
    assert!(result.is_ok(), "layout should return Ok(()) for empty page");
}

#[test]
fn cycle_removal_produces_dag() {
    let (mut store, page_id) = load_fixture("tests/fixtures/cycle.drawio");
    let layout = HierarchicalLayout::with_default_config();
    layout.layout(&mut store, page_id).unwrap();

    // All vertices should have valid positions
    for (_, v) in store.vertices_with_ids() {
        let g = v.geometry.expect("vertex should have geometry");
        assert!(g.x.is_finite());
        assert!(g.y.is_finite());
    }

    // After cycle removal + layout, vertices should be in different layers
    // (proving the cycle was broken and a DAG was created).
    // NOTE: The store's edge directions are the ORIGINAL directions (cycle
    // removal reverses edges internally in the HierarchyModel but does NOT
    // swap store Edge.source/Edge.target). So we cannot assert all store edges
    // satisfy target.y >= source.y — the reversed edge still has original
    // source/target in the store.
    //
    // Instead, verify that vertices have y positions consistent with the
    // cycle having been broken: at least one vertex has a distinct y value.
    let ys: Vec<f64> = store
        .vertices_with_ids()
        .map(|(_, v)| v.geometry.unwrap().y)
        .collect();
    assert!(
        ys.iter().any(|&y| (y - ys[0]).abs() > 1.0),
        "vertices should be in different layers after cycle removal (cycle broken)"
    );
}

#[test]
fn disconnected_components_stacked() {
    let (mut store, page_id) = load_fixture("tests/fixtures/disconnected.drawio");
    let layout = HierarchicalLayout::with_default_config();
    layout.layout(&mut store, page_id).unwrap();

    // Collect vertex positions with their IDs
    // G1: A→B, G2: C→D — all on same page, disconnected
    // After layout, G2 vertices should have y > G1 vertices (component stacking)
    let mut pos_by_id: Vec<(diagram_core::id::VertexId, f64)> = store
        .vertices_with_ids()
        .map(|(vid, v)| {
            let g = v.geometry.unwrap();
            (vid, g.y)
        })
        .collect();

    // Sort by y position
    pos_by_id.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

    // First two should be G1 (A, B), last two should be G2 (C, D)
    // Verify that there's a gap between the two components
    assert!(
        pos_by_id.len() >= 4,
        "should have 4 vertices, got {}",
        pos_by_id.len()
    );
    let gap = pos_by_id[2].1 - pos_by_id[1].1;
    assert!(gap > 0.0, "G2 should start above G1 (gap {gap})");
}
