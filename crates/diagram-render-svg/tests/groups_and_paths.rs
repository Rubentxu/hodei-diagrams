//! Golden tests for groups and paths.

use diagram_core::geometry::{Point, Rect, Size};
use diagram_core::{EdgeId, GroupId, VertexId};
use diagram_scene::ResolvedStyle;
use diagram_scene::{GroupElement, LineElement, PathElement, RectElement, VisualElement};

use diagram_render_svg::SvgRenderer;
use diagram_scene::{PageId, PageScene, Scene};

fn empty_style() -> ResolvedStyle {
    ResolvedStyle::default()
}

fn make_rect(x: f64, y: f64, w: f64, h: f64) -> Rect {
    Rect {
        origin: Point { x, y },
        size: Size {
            width: w,
            height: h,
        },
    }
}

#[test]
fn group_with_clip_emits_defs_and_clip_path() {
    let child_rect = VisualElement::Rect(RectElement {
        id: VertexId::default(),
        bounds: make_rect(60.0, 60.0, 80.0, 40.0),
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
        style: empty_style(),
    });
    let group = VisualElement::Group(GroupElement {
        id: GroupId::default(),
        bounds: make_rect(50.0, 50.0, 200.0, 150.0),
        style: empty_style(),
        children: vec![child_rect],
        clip: true,
        header: None,
    });
    let page = PageScene {
        page_id: PageId::default(),
        name: "Test".to_owned(),
        width: 300.0,
        height: 300.0,
        display_list: vec![group],
        background: None,
    };
    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();
    let result = renderer.render(&scene, PageId::default()).unwrap();

    // Should contain defs block
    assert!(result.contains("<defs>"), "Expected <defs> in output");
    assert!(result.contains("</defs>"), "Expected </defs> in output");

    // Should contain clipPath definition
    assert!(
        result.contains("<clipPath id=\"clip_0\">"),
        "Expected clip_0 definition"
    );
    assert!(
        result.contains("<rect x=\"50\" y=\"50\" width=\"200\" height=\"150\"/>"),
        "Expected clip rect bounds"
    );

    // Should contain group with clip-path attribute
    assert!(
        result.contains("<g clip-path=\"url(#clip_0)\">"),
        "Expected clip-path attribute on group"
    );
}

#[test]
fn group_without_clip_no_defs() {
    let child_rect = VisualElement::Rect(RectElement {
        id: VertexId::default(),
        bounds: make_rect(10.0, 10.0, 80.0, 40.0),
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
        style: empty_style(),
    });
    let group = VisualElement::Group(GroupElement {
        id: GroupId::default(),
        bounds: make_rect(0.0, 0.0, 200.0, 200.0),
        style: empty_style(),
        children: vec![child_rect],
        clip: false,
        header: None,
    });
    let page = PageScene {
        page_id: PageId::default(),
        name: "Test".to_owned(),
        width: 300.0,
        height: 300.0,
        display_list: vec![group],
        background: None,
    };
    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();
    let result = renderer.render(&scene, PageId::default()).unwrap();

    // Should contain group tag without clip-path
    assert!(result.contains("<g>"), "Expected <g> tag");
    assert!(
        !result.contains("clip-path"),
        "Should not contain clip-path attribute"
    );

    // Should NOT contain defs when no clipping groups
    assert!(!result.contains("<defs>"), "Should not contain <defs>");
}

#[test]
fn path_element_emits_m_l_format() {
    let path = VisualElement::Path(PathElement {
        id: EdgeId::default(),
        points: vec![
            Point { x: 10.0, y: 10.0 },
            Point { x: 50.0, y: 30.0 },
            Point { x: 90.0, y: 10.0 },
        ],
        style: empty_style(),
    });
    let page = PageScene {
        page_id: PageId::default(),
        name: "Test".to_owned(),
        width: 100.0,
        height: 100.0,
        display_list: vec![path],
        background: None,
    };
    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();
    let result = renderer.render(&scene, PageId::default()).unwrap();

    // Should contain path with M and L commands
    assert!(
        result.contains("<path d=\"M 10 10 L 50 30 L 90 10\""),
        "Expected path d attribute"
    );
    // Line elements should have fill="none"
    assert!(
        result.contains("fill=\"none\""),
        "Path should have fill=\"none\""
    );
}

#[test]
fn two_clip_groups_get_incrementing_ids() {
    let group1 = VisualElement::Group(GroupElement {
        id: GroupId::default(),
        bounds: make_rect(0.0, 0.0, 100.0, 100.0),
        style: empty_style(),
        children: vec![],
        clip: true,
        header: None,
    });
    let group2 = VisualElement::Group(GroupElement {
        id: GroupId::default(),
        bounds: make_rect(0.0, 0.0, 200.0, 200.0),
        style: empty_style(),
        children: vec![],
        clip: true,
        header: None,
    });
    let page = PageScene {
        page_id: PageId::default(),
        name: "Test".to_owned(),
        width: 300.0,
        height: 300.0,
        display_list: vec![group1, group2],
        background: None,
    };
    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();
    let result = renderer.render_pages(&scene).unwrap();

    // Both clip_0 and clip_1 should be present
    assert!(result[0].1.contains("clip_0"), "Expected clip_0");
    assert!(result[0].1.contains("clip_1"), "Expected clip_1");
    assert!(!result[0].1.contains("clip_2"), "Should not have clip_2");
}

#[test]
fn edge_connect_line_between_vertices() {
    // This tests that Line (used for edge connections) has fill="none"
    let line = VisualElement::Line(LineElement {
        id: EdgeId::default(),
        from: Point { x: 0.0, y: 0.0 },
        to: Point { x: 100.0, y: 100.0 },
        style: empty_style(),
    });
    let page = PageScene {
        page_id: PageId::default(),
        name: "Test".to_owned(),
        width: 100.0,
        height: 100.0,
        display_list: vec![line],
        background: None,
    };
    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();
    let result = renderer.render(&scene, PageId::default()).unwrap();

    assert!(
        result.contains("<line x1=\"0\" y1=\"0\" x2=\"100\" y2=\"100\""),
        "Expected line element"
    );
    assert!(
        result.contains("fill=\"none\""),
        "Line should have fill=\"none\""
    );
}

#[test]
fn empty_defs_when_no_clipping() {
    let rect = VisualElement::Rect(RectElement {
        id: VertexId::default(),
        bounds: make_rect(10.0, 20.0, 80.0, 40.0),
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
        style: empty_style(),
    });
    let page = PageScene {
        page_id: PageId::default(),
        name: "Test".to_owned(),
        width: 100.0,
        height: 100.0,
        display_list: vec![rect],
        background: None,
    };
    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();
    let result = renderer.render(&scene, PageId::default()).unwrap();

    // Should NOT contain defs when no clipping groups exist
    assert!(!result.contains("<defs>"), "Should not contain <defs>");
}

#[test]
fn nested_group_with_child_vertex() {
    let child_rect = VisualElement::Rect(RectElement {
        id: VertexId::default(),
        bounds: make_rect(10.0, 10.0, 80.0, 40.0),
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
        style: ResolvedStyle {
            fill_color: Some("#dae8fc".to_owned()),
            stroke_color: Some("#6c8ebf".to_owned()),
            ..Default::default()
        },
    });
    let group = VisualElement::Group(GroupElement {
        id: GroupId::default(),
        bounds: make_rect(0.0, 0.0, 200.0, 200.0),
        style: empty_style(),
        children: vec![child_rect],
        clip: false,
        header: None,
    });
    let page = PageScene {
        page_id: PageId::default(),
        name: "Test".to_owned(),
        width: 200.0,
        height: 200.0,
        display_list: vec![group],
        background: None,
    };
    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();
    let result = renderer.render(&scene, PageId::default()).unwrap();

    // Outer group
    assert!(result.contains("<g>"), "Expected outer <g>");
    assert!(result.contains("</g>"), "Expected closing </g>");
    // Child rect within group
    assert!(result.contains("<rect x=\"10\" y=\"10\" width=\"80\" height=\"40\""));
    // Fill and stroke on child
    assert!(result.contains("fill=\"#dae8fc\""));
    assert!(result.contains("stroke=\"#6c8ebf\""));
}
