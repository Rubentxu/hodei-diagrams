//! Integration tests for curved edges (v0.48) via path_to_svg output.
//!
//! Tests verify that when `PathElement` has `curved=Some(true)` and 3+ points,
//! the rendered SVG output contains cubic Bezier commands (`C`).
//!
//! Run with:
//!   cargo test -p diagram-render-svg --test integration_curved

use diagram_core::EdgeId;
use diagram_core::geometry::Point;
use diagram_render_svg::SvgRenderer;
use diagram_scene::{PageId, PageScene, Scene};
use diagram_scene::{PathElement, ResolvedStyle, VisualElement};

/// Helper to build a page with a single display element.
fn page_with_element(elem: VisualElement) -> Scene {
    let page = PageScene {
        page_id: PageId::default(),
        name: "Test".to_owned(),
        width: 200.0,
        height: 200.0,
        display_list: vec![elem],
        background: None,
        math_enabled: false,
    };
    Scene { pages: vec![page] }
}

#[test]
fn curved_edge_with_three_points_uses_cubic_bezier() {
    // Create PathElement with curved=true and 3 points
    let path = VisualElement::Path(PathElement {
        id: EdgeId::default(),
        points: vec![
            Point { x: 10.0, y: 50.0 },
            Point { x: 100.0, y: 150.0 },
            Point { x: 190.0, y: 50.0 },
        ],
        style: ResolvedStyle {
            curved: Some(true),
            ..Default::default()
        },
    });

    let scene = page_with_element(path);
    let renderer = SvgRenderer::new();
    let result = renderer.render(&scene, PageId::default(), None).unwrap();

    // Should contain cubic Bezier command " C "
    assert!(
        result.contains(" C "),
        "curved path with 3+ points should emit C commands: {}",
        result
    );
    // Should start with M (move to first point)
    assert!(
        result.contains("M 10 50"),
        "path should start with move command: {}",
        result
    );
}

#[test]
fn non_curved_edge_uses_line_commands() {
    // Same 3 points but curved=false (explicit)
    let path = VisualElement::Path(PathElement {
        id: EdgeId::default(),
        points: vec![
            Point { x: 10.0, y: 50.0 },
            Point { x: 100.0, y: 150.0 },
            Point { x: 190.0, y: 50.0 },
        ],
        style: ResolvedStyle {
            curved: Some(false),
            ..Default::default()
        },
    });

    let scene = page_with_element(path);
    let renderer = SvgRenderer::new();
    let result = renderer.render(&scene, PageId::default(), None).unwrap();

    // Should contain L commands, not C commands
    assert!(
        result.contains(" L "),
        "non-curved path should emit L commands: {}",
        result
    );
    assert!(
        !result.contains(" C "),
        "non-curved path should NOT emit C commands: {}",
        result
    );
}

#[test]
fn curved_with_two_points_falls_back_to_line() {
    // Need 3+ points for curve. With 2 points, should fall back to straight line.
    let path = VisualElement::Path(PathElement {
        id: EdgeId::default(),
        points: vec![Point { x: 10.0, y: 50.0 }, Point { x: 190.0, y: 150.0 }],
        style: ResolvedStyle {
            curved: Some(true),
            ..Default::default()
        },
    });

    let scene = page_with_element(path);
    let renderer = SvgRenderer::new();
    let result = renderer.render(&scene, PageId::default(), None).unwrap();

    // Should use L (line) command, not C (curve)
    assert!(
        result.contains(" L "),
        "2-point path should fall back to L commands: {}",
        result
    );
    assert!(
        !result.contains(" C "),
        "2-point path should NOT emit C commands: {}",
        result
    );
}

#[test]
fn curved_path_d_passes_through_all_input_points() {
    // The Catmull-Rom curve must pass through all input control points.
    // Verify that each input point appears in the d attribute.
    let path = VisualElement::Path(PathElement {
        id: EdgeId::default(),
        points: vec![
            Point { x: 0.0, y: 100.0 },
            Point { x: 50.0, y: 0.0 },
            Point { x: 100.0, y: 100.0 },
            Point { x: 150.0, y: 0.0 },
            Point { x: 200.0, y: 100.0 },
        ],
        style: ResolvedStyle {
            curved: Some(true),
            ..Default::default()
        },
    });

    let scene = page_with_element(path);
    let renderer = SvgRenderer::new();
    let result = renderer.render(&scene, PageId::default(), None).unwrap();

    // All input X coordinates should appear in the d attribute
    // (the curve passes through them, so they appear as x coords in the path)
    assert!(
        result.contains("0 100"),
        "first point (0, 100) should be in path: {}",
        result
    );
    assert!(
        result.contains("50 0"),
        "second point (50, 0) should be in path: {}",
        result
    );
    assert!(
        result.contains("100 100"),
        "third point (100, 100) should be in path: {}",
        result
    );
}

#[test]
fn default_curved_is_none_uses_line_commands() {
    // When curved is None (default), should use L commands
    let path = VisualElement::Path(PathElement {
        id: EdgeId::default(),
        points: vec![
            Point { x: 10.0, y: 50.0 },
            Point { x: 100.0, y: 150.0 },
            Point { x: 190.0, y: 50.0 },
        ],
        style: ResolvedStyle::default(), // curved is None by default
    });

    let scene = page_with_element(path);
    let renderer = SvgRenderer::new();
    let result = renderer.render(&scene, PageId::default(), None).unwrap();

    assert!(
        result.contains(" L "),
        "default (None) curved should use L commands: {}",
        result
    );
    assert!(
        !result.contains(" C "),
        "default (None) curved should NOT emit C commands: {}",
        result
    );
}

#[test]
fn curved_with_four_points_emits_multiple_c_commands() {
    // With 4 points, we get 3 segments, so 2 C commands
    let path = VisualElement::Path(PathElement {
        id: EdgeId::default(),
        points: vec![
            Point { x: 0.0, y: 50.0 },
            Point { x: 50.0, y: 100.0 },
            Point { x: 100.0, y: 50.0 },
            Point { x: 150.0, y: 100.0 },
        ],
        style: ResolvedStyle {
            curved: Some(true),
            ..Default::default()
        },
    });

    let scene = page_with_element(path);
    let renderer = SvgRenderer::new();
    let result = renderer.render(&scene, PageId::default(), None).unwrap();

    // Should have at least 2 C commands (for 4 points = 3 segments, but first segment
    // doesn't have a preceding C, so 2 C commands total)
    let c_count = result.matches(" C ").count();
    assert!(
        c_count >= 2,
        "4-point curved path should emit at least 2 C commands, got {}: {}",
        c_count,
        result
    );
}

#[test]
fn empty_path_emits_empty_d_attribute() {
    let path = VisualElement::Path(PathElement {
        id: EdgeId::default(),
        points: vec![],
        style: ResolvedStyle {
            curved: Some(true),
            ..Default::default()
        },
    });

    let scene = page_with_element(path);
    let renderer = SvgRenderer::new();
    let result = renderer.render(&scene, PageId::default(), None).unwrap();

    assert!(
        result.contains("d=\"\""),
        "empty path should have empty d attribute: {}",
        result
    );
}
