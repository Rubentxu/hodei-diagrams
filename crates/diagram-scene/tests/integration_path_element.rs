//! Integration tests for v0.39 (PathElement via project_edge) and v0.53 (edge label offset).
//!
//! Tests cover:
//! - Edge with no waypoints → LineElement
//! - Edge with waypoints → PathElement (routing engine provides full path)
//! - PathElement does NOT prepend/append vertex centers
//! - Edge label offset applies to midpoint anchor
//! - Edge label offset None uses pure midpoint
//!
//! Run with:
//!   cargo test -p diagram-scene --test integration_path_element

use diagram_core::geometry::{CellGeometry, Point};
use diagram_core::label::Label;
use diagram_core::{DiagramModel, Edge, Page, PageId, Vertex};
use diagram_scene::{SceneBuilder, VisualElement};

fn make_model_with_page() -> (DiagramModel, PageId) {
    let mut model = DiagramModel::new();
    let page = Page::new(PageId::default());
    let pid = model.store.insert_page(page.clone());
    let mut p = page;
    p.id = pid;
    model.store.replace_page(pid, p);
    (model, pid)
}

fn make_vertex(model: &mut DiagramModel, pid: PageId, x: f64, y: f64) -> diagram_core::VertexId {
    let vertex = Vertex {
        geometry: Some(CellGeometry {
            x,
            y,
            width: 100.0,
            height: 60.0,
            relative: false,
            ..Default::default()
        }),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_vertex(vertex)
}

// ─── Edge → LineElement vs PathElement ────────────────────────────────────────

#[test]
fn edge_with_empty_waypoints_produces_line_element() {
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, 300.0, 0.0);

    // Create edge with NO waypoints
    let edge = Edge {
        source: v1,
        target: v2,
        page_id: Some(pid),
        waypoints: Vec::new(),
        ..Default::default()
    };
    model.store.insert_edge(edge);

    // Build scene
    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();

    // Should have exactly 1 page
    assert_eq!(scene.pages.len(), 1, "scene should have exactly 1 page");
    let page = &scene.pages[0];

    // Should have a LineElement for the edge
    let has_line = page
        .display_list
        .iter()
        .any(|e| matches!(e, VisualElement::Line(_)));
    assert!(
        has_line,
        "should have a LineElement for edge with no waypoints"
    );

    // Should NOT have a PathElement for this edge
    let has_path = page
        .display_list
        .iter()
        .any(|e| matches!(e, VisualElement::Path(_)));
    assert!(
        !has_path,
        "should NOT have a PathElement for edge with no waypoints"
    );
}

#[test]
fn edge_with_waypoints_produces_path_element() {
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, 300.0, 0.0);

    // Create edge WITH waypoints (as if from routing engine)
    let waypoints = vec![
        Point { x: 100.0, y: 30.0 }, // First waypoint on source perimeter
        Point { x: 150.0, y: 30.0 },
        Point { x: 200.0, y: 30.0 }, // Last waypoint on target perimeter
    ];
    let edge = Edge {
        source: v1,
        target: v2,
        page_id: Some(pid),
        waypoints,
        ..Default::default()
    };
    model.store.insert_edge(edge);

    // Build scene
    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();
    let page = &scene.pages[0];

    // Should have a PathElement (not LineElement)
    let has_path = page
        .display_list
        .iter()
        .any(|e| matches!(e, VisualElement::Path(_)));
    assert!(has_path, "edge with waypoints should produce PathElement");

    // Should NOT have a LineElement for the edge (since it has waypoints)
    let has_line = page
        .display_list
        .iter()
        .any(|e| matches!(e, VisualElement::Line(_)));
    assert!(
        !has_line,
        "edge with waypoints should NOT produce LineElement"
    );
}

#[test]
fn edge_path_does_not_prepend_append_centers() {
    // Critical test: scene builder should NOT add center points to path
    // because routing engine waypoints already include perimeter endpoints
    // (fix from v0.50.0)
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, 300.0, 0.0);

    // Create edge with known waypoints
    let waypoints = vec![
        Point { x: 100.0, y: 30.0 }, // Only these 3 waypoints
        Point { x: 150.0, y: 30.0 },
        Point { x: 200.0, y: 30.0 },
    ];
    let edge = Edge {
        source: v1,
        target: v2,
        page_id: Some(pid),
        waypoints: waypoints.clone(),
        ..Default::default()
    };
    model.store.insert_edge(edge);

    // Build scene
    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();
    let page = &scene.pages[0];

    // Find the PathElement
    let path_elem = page
        .display_list
        .iter()
        .filter_map(|e| match e {
            VisualElement::Path(p) => Some(p),
            _ => None,
        })
        .next()
        .expect("should have a PathElement");

    // Path points should be EXACTLY the waypoints - no centers prepended or appended
    assert_eq!(
        path_elem.points.len(),
        waypoints.len(),
        "PathElement should have exactly {} points (same as waypoints, no centers added)",
        waypoints.len()
    );
    for (i, (path_pt, wp)) in path_elem.points.iter().zip(waypoints.iter()).enumerate() {
        assert_eq!(
            path_pt.x, wp.x,
            "point[{}].x should equal waypoint[{}].x (no center prepend)",
            i, i
        );
        assert_eq!(
            path_pt.y, wp.y,
            "point[{}].y should equal waypoint[{}].y",
            i, i
        );
    }
}

#[test]
fn edge_with_single_waypoint_produces_path_element() {
    // Single waypoint should still produce PathElement
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, 300.0, 0.0);

    let waypoints = vec![Point { x: 150.0, y: 50.0 }];
    let edge = Edge {
        source: v1,
        target: v2,
        page_id: Some(pid),
        waypoints,
        ..Default::default()
    };
    model.store.insert_edge(edge);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();
    let page = &scene.pages[0];

    let path_elem = page
        .display_list
        .iter()
        .filter_map(|e| match e {
            VisualElement::Path(p) => Some(p),
            _ => None,
        })
        .next()
        .expect("should have a PathElement");

    assert_eq!(
        path_elem.points.len(),
        1,
        "PathElement should have exactly 1 point"
    );
}

// ─── Edge Label Offset ─────────────────────────────────────────────────────────

#[test]
fn edge_label_offset_applies_to_midpoint_anchor() {
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, 200.0, 0.0);

    // Edge with label and offset
    let edge = Edge {
        source: v1,
        target: v2,
        page_id: Some(pid),
        label: Some(Label::new("Test Label")),
        label_offset: Some((10.0, 20.0)),
        ..Default::default()
    };
    model.store.insert_edge(edge);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();
    let page = &scene.pages[0];

    // Find the TextElement
    let text_elem = page
        .display_list
        .iter()
        .filter_map(|e| match e {
            VisualElement::Text(t) => Some(t),
            _ => None,
        })
        .next()
        .expect("should have a TextElement for the label");

    // v1 center: (0 + 100/2, 0 + 60/2) = (50, 30)
    // v2 center: (200 + 100/2, 0 + 60/2) = (250, 30)
    // Midpoint: ((50+250)/2, (30+30)/2) = (150, 30)
    // With offset (10, 20): (160, 50)
    assert_eq!(
        text_elem.anchor.x, 160.0,
        "anchor.x should be midpoint.x + offset.x = 150 + 10 = 160"
    );
    assert_eq!(
        text_elem.anchor.y, 50.0,
        "anchor.y should be midpoint.y + offset.y = 30 + 20 = 50"
    );
}

#[test]
fn edge_label_offset_none_uses_pure_midpoint() {
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, 200.0, 0.0);

    // Edge with label but NO offset
    let edge = Edge {
        source: v1,
        target: v2,
        page_id: Some(pid),
        label: Some(Label::new("Test Label")),
        label_offset: None,
        ..Default::default()
    };
    model.store.insert_edge(edge);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();
    let page = &scene.pages[0];

    // Find the TextElement
    let text_elem = page
        .display_list
        .iter()
        .filter_map(|e| match e {
            VisualElement::Text(t) => Some(t),
            _ => None,
        })
        .next()
        .expect("should have a TextElement for the label");

    // v1 center: (50, 30), v2 center: (250, 30)
    // Pure midpoint: (150, 30)
    assert_eq!(
        text_elem.anchor.x, 150.0,
        "anchor.x should be pure midpoint.x = 150"
    );
    assert_eq!(
        text_elem.anchor.y, 30.0,
        "anchor.y should be pure midpoint.y = 30"
    );
}

#[test]
fn edge_label_offset_zero_offset_differs_from_none() {
    // Zero offset should still apply offset (producing pure midpoint)
    // vs None which also produces pure midpoint - behavior is same
    // This test documents that zero is a valid offset value
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, 200.0, 0.0);

    // Edge with zero offset
    let edge = Edge {
        source: v1,
        target: v2,
        page_id: Some(pid),
        label: Some(Label::new("Label")),
        label_offset: Some((0.0, 0.0)),
        ..Default::default()
    };
    model.store.insert_edge(edge);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();
    let page = &scene.pages[0];

    let text_elem = page
        .display_list
        .iter()
        .filter_map(|e| match e {
            VisualElement::Text(t) => Some(t),
            _ => None,
        })
        .next()
        .expect("should have a TextElement");

    // Midpoint: (150, 30), zero offset: still (150, 30)
    assert_eq!(text_elem.anchor.x, 150.0);
    assert_eq!(text_elem.anchor.y, 30.0);
}

#[test]
fn edge_without_label_has_no_text_element() {
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, 200.0, 0.0);

    // Edge WITHOUT label
    let edge = Edge {
        source: v1,
        target: v2,
        page_id: Some(pid),
        label: None,
        label_offset: Some((10.0, 20.0)),
        ..Default::default()
    };
    model.store.insert_edge(edge);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();
    let page = &scene.pages[0];

    // No TextElement should exist for this edge
    let has_text = page
        .display_list
        .iter()
        .any(|e| matches!(e, VisualElement::Text(_)));
    assert!(
        !has_text,
        "edge without label should not produce TextElement"
    );
}

#[test]
fn edge_with_waypoints_and_label_offset() {
    // Waypoints + label offset should work together
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, 300.0, 0.0);

    let waypoints = vec![Point { x: 100.0, y: 30.0 }, Point { x: 200.0, y: 30.0 }];
    let edge = Edge {
        source: v1,
        target: v2,
        page_id: Some(pid),
        waypoints,
        label: Some(Label::new("Edge Label")),
        label_offset: Some((5.0, -10.0)),
        ..Default::default()
    };
    model.store.insert_edge(edge);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();
    let page = &scene.pages[0];

    // Should have both PathElement and TextElement
    let has_path = page
        .display_list
        .iter()
        .any(|e| matches!(e, VisualElement::Path(_)));
    let has_text = page
        .display_list
        .iter()
        .any(|e| matches!(e, VisualElement::Text(_)));
    assert!(has_path, "edge with waypoints should produce PathElement");
    assert!(has_text, "edge with label should produce TextElement");
}

// ─── Perimeter-Inclusive PathElement (r110) ─────────────────────────────────────

/// RED test: PathElement.points must be perimeter-inclusive:
///   [from.center, ...edge.waypoints, to.center]
/// This test FAILS on the v0.50.0 contract (interior-only) and turns GREEN
/// after the project_edge fix in C02.
#[test]
fn path_element_includes_vertex_centers() {
    let (mut model, pid) = make_model_with_page();
    // v1 at (0,0) size 100×60 → center (50, 30)
    let v1 = make_vertex(&mut model, pid, 0.0, 0.0);
    // v2 at (300,0) size 100×60 → center (350, 30)
    let v2 = make_vertex(&mut model, pid, 300.0, 0.0);

    // 1 interior waypoint
    let waypoints = vec![Point { x: 150.0, y: 30.0 }];
    let edge = Edge {
        source: v1,
        target: v2,
        page_id: Some(pid),
        waypoints,
        ..Default::default()
    };
    model.store.insert_edge(edge);

    let scene = SceneBuilder::new().build(&model).unwrap();
    let path_elem = scene.pages[0]
        .display_list
        .iter()
        .filter_map(|e| match e {
            VisualElement::Path(p) => Some(p),
            _ => None,
        })
        .next()
        .expect("should have a PathElement");

    // Perimeter-inclusive: from + 1 waypoint + to = 3 points
    assert_eq!(
        path_elem.points.len(),
        3,
        "perimeter-inclusive: from + 1 waypoint + to"
    );
    assert_eq!(
        path_elem.points[0],
        Point { x: 50.0, y: 30.0 },
        "from = v1 center"
    );
    assert_eq!(
        path_elem.points[1],
        Point { x: 150.0, y: 30.0 },
        "interior waypoint preserved"
    );
    assert_eq!(
        path_elem.points[2],
        Point { x: 350.0, y: 30.0 },
        "to = v2 center"
    );
}
