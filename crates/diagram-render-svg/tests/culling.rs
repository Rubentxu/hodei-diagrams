//! Integration tests for viewport culling in SVG rendering.

use diagram_core::VertexId;
use diagram_core::geometry::{Point, Rect, Size};
use diagram_render_svg::SvgRenderer;
use diagram_scene::{GroupElement, PageId, RectElement, ResolvedStyle, Scene, VisualElement};

fn make_rect(x: f64, y: f64, w: f64, h: f64) -> Rect {
    Rect {
        origin: Point { x, y },
        size: Size {
            width: w,
            height: h,
        },
    }
}

fn make_rect_elem(x: f64, y: f64, w: f64, h: f64) -> VisualElement {
    VisualElement::Rect(RectElement {
        id: VertexId::default(),
        bounds: make_rect(x, y, w, h),
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
        style: ResolvedStyle::default(),
    })
}

fn make_page(display_list: Vec<VisualElement>) -> diagram_scene::PageScene {
    diagram_scene::PageScene {
        page_id: PageId::default(),
        name: "Test".to_owned(),
        width: 1000.0,
        height: 1000.0,
        display_list,
        background: None,
        math_enabled: false,
    }
}

fn make_scene(page: diagram_scene::PageScene) -> Scene {
    Scene { pages: vec![page] }
}

/// REQ-CULL-001: Offscreen elements are excluded from the rendered SVG.
#[test]
fn cull_excludes_offscreen() {
    let page = make_page(vec![
        make_rect_elem(10.0, 10.0, 50.0, 50.0),   // inside viewport
        make_rect_elem(900.0, 900.0, 50.0, 50.0), // far outside viewport
    ]);
    let scene = make_scene(page);

    let renderer = SvgRenderer::new();
    // Viewport (0,0,200,200) — the second rect is outside
    let viewport = make_rect(0.0, 0.0, 200.0, 200.0);
    let svg = renderer
        .render(&scene, PageId::default(), Some(viewport))
        .unwrap();

    // Should contain the first rect
    assert!(svg.contains("x=\"10\""), "inside rect should be present");
    // Should NOT contain the second rect's position
    assert!(
        !svg.contains("x=\"900\""),
        "offscreen rect should be culled"
    );
}

/// REQ-CULL-004 / REQ-CULL-003: Elements crossing the viewport boundary are included.
#[test]
fn cull_includes_edge_crossing() {
    let page = make_page(vec![
        make_rect_elem(180.0, 180.0, 50.0, 50.0), // partially overlaps viewport
    ]);
    let scene = make_scene(page);

    let renderer = SvgRenderer::new();
    let viewport = make_rect(0.0, 0.0, 200.0, 200.0);
    let svg = renderer
        .render(&scene, PageId::default(), Some(viewport))
        .unwrap();

    // Partial overlap → included
    assert!(
        svg.contains("x=\"180\""),
        "edge-crossing rect should be included"
    );
}

/// REQ-CULL-003: Group structure is preserved — group container renders but culled children do not.
#[test]
fn cull_preserves_group_structure() {
    // Group with two children: one inside viewport, one outside
    let child_inside = make_rect_elem(50.0, 50.0, 30.0, 30.0);
    let child_outside = make_rect_elem(500.0, 500.0, 30.0, 30.0);

    let group = VisualElement::Group(GroupElement {
        id: diagram_core::GroupId::default(),
        bounds: make_rect(50.0, 50.0, 480.0, 480.0), // covers both children
        style: ResolvedStyle::default(),
        children: vec![child_inside, child_outside],
        clip: false,
        header: None,
    });

    let page = make_page(vec![group]);
    let scene = make_scene(page);

    let renderer = SvgRenderer::new();
    let viewport = make_rect(0.0, 0.0, 200.0, 200.0);
    let svg = renderer
        .render(&scene, PageId::default(), Some(viewport))
        .unwrap();

    // Group <g> tag should be present (data-group-id not emitted for default GroupId)
    assert!(svg.contains("<g>"), "group container should be present");
    // Inside child should be present
    assert!(svg.contains("x=\"50\""), "inside child should be rendered");
    // Outside child should NOT be present
    assert!(!svg.contains("x=\"500\""), "outside child should be culled");
}

/// REQ-CULL-006: Sentinel viewport (0,0,0,0) produces same output as None.
#[test]
fn sentinel_viewport_equiv_none() {
    let page = make_page(vec![make_rect_elem(50.0, 50.0, 50.0, 50.0)]);
    let scene = make_scene(page);

    let renderer = SvgRenderer::new();
    let svg_none = renderer.render(&scene, PageId::default(), None).unwrap();
    let svg_sentinel = renderer
        .render(
            &scene,
            PageId::default(),
            Some(make_rect(0.0, 0.0, 0.0, 0.0)),
        )
        .unwrap();

    assert_eq!(
        svg_none, svg_sentinel,
        "sentinel viewport should produce full render"
    );
}
