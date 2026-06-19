//! Integration tests for scene-to-instance mapping (no GPU required).
//!
//! These tests exercise `collect_instances_for_page()` with various display
//! list configurations, verifying that the scene walker produces correct
//! [`ShapeInstance`] vectors without any GPU hardware.

use diagram_core::geometry::{Point, Rect, Size};
use diagram_core::{EdgeId, GroupId, VertexId};
use diagram_render_wgpu::renderer::collect_instances_for_page;
use diagram_render_wgpu::shapes::{SHAPE_ELLIPSE, SHAPE_LINE, SHAPE_RECT, SHAPE_ROUNDED};
use diagram_scene::{
    EllipseElement, GroupElement, LineElement, PageId, PageScene, RectElement, ResolvedStyle,
    RoundedRectElement, VisualElement,
};

fn make_rect(
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    fill: Option<&str>,
    stroke: Option<&str>,
    sw: Option<f64>,
) -> VisualElement {
    VisualElement::Rect(RectElement {
        id: VertexId::default(),
        bounds: Rect {
            origin: Point { x, y },
            size: Size {
                width: w,
                height: h,
            },
        },
        style: ResolvedStyle {
            fill_color: fill.map(String::from),
            stroke_color: stroke.map(String::from),
            stroke_width: sw,
            ..Default::default()
        },
    })
}

fn make_page(display_list: Vec<VisualElement>) -> PageScene {
    PageScene {
        page_id: PageId::default(),
        name: "test".to_owned(),
        width: 800.0,
        height: 600.0,
        display_list,
    }
}

#[test]
fn four_elements_produce_4_instances() {
    let rect = make_rect(
        10.0,
        20.0,
        80.0,
        40.0,
        Some("#dae8fc"),
        Some("#6c8ebf"),
        Some(2.0),
    );
    let rounded = VisualElement::RoundedRect(RoundedRectElement {
        id: VertexId::default(),
        bounds: Rect {
            origin: Point { x: 100.0, y: 50.0 },
            size: Size {
                width: 60.0,
                height: 60.0,
            },
        },
        radius: 8.0,
        style: ResolvedStyle {
            fill_color: Some("#ffffff".to_owned()),
            ..Default::default()
        },
    });
    let ellipse = VisualElement::Ellipse(EllipseElement {
        id: VertexId::default(),
        bounds: Rect {
            origin: Point { x: 200.0, y: 100.0 },
            size: Size {
                width: 50.0,
                height: 50.0,
            },
        },
        style: ResolvedStyle {
            fill_color: Some("#dae8fc".to_owned()),
            ..Default::default()
        },
    });
    let line = VisualElement::Line(LineElement {
        id: EdgeId::default(),
        from: Point { x: 80.0, y: 40.0 },
        to: Point { x: 160.0, y: 100.0 },
        style: ResolvedStyle {
            stroke_color: Some("#000000".to_owned()),
            stroke_width: Some(2.0),
            ..Default::default()
        },
    });

    let page = make_page(vec![rect, rounded, ellipse, line]);
    let instances = collect_instances_for_page(&page);
    assert_eq!(instances.len(), 4);

    // Verify each instance's shape_type
    assert_eq!(instances[0].shape_type, SHAPE_RECT);
    assert_eq!(instances[1].shape_type, SHAPE_ROUNDED);
    assert_eq!(instances[1].corner_radius, 8.0);
    assert_eq!(instances[2].shape_type, SHAPE_ELLIPSE);
    assert_eq!(instances[2].corner_radius, -1.0);
    assert_eq!(instances[3].shape_type, SHAPE_LINE);
}

#[test]
fn nested_groups_flatten_children() {
    let inner_rect = make_rect(0.0, 0.0, 50.0, 50.0, None, None, None);
    let inner_group = VisualElement::Group(GroupElement {
        id: GroupId::default(),
        bounds: Rect {
            origin: Point { x: 0.0, y: 0.0 },
            size: Size {
                width: 100.0,
                height: 100.0,
            },
        },
        style: ResolvedStyle::default(),
        children: vec![inner_rect],
        clip: false,
    });
    let outer_group = VisualElement::Group(GroupElement {
        id: GroupId::default(),
        bounds: Rect {
            origin: Point { x: 0.0, y: 0.0 },
            size: Size {
                width: 200.0,
                height: 200.0,
            },
        },
        style: ResolvedStyle::default(),
        children: vec![inner_group],
        clip: true,
    });
    let page = make_page(vec![outer_group]);
    let instances = collect_instances_for_page(&page);
    assert_eq!(instances.len(), 1);
    assert_eq!(instances[0].shape_type, SHAPE_RECT);
}

#[test]
fn empty_scene_produces_zero_instances() {
    let page = make_page(vec![]);
    let instances = collect_instances_for_page(&page);
    assert_eq!(instances.len(), 0);
}

#[test]
fn scissor_group_with_child_rect() {
    // Group (clip=true, bounds 50,50,100,100) containing a rect that extends
    // past group bounds (bounds 90,90,80,80). The instance should still be
    // collected (scissoring is handled at draw time, not during collection).
    let child_rect = make_rect(90.0, 90.0, 80.0, 80.0, None, None, None);
    let group = VisualElement::Group(GroupElement {
        id: GroupId::default(),
        bounds: Rect {
            origin: Point { x: 50.0, y: 50.0 },
            size: Size {
                width: 100.0,
                height: 100.0,
            },
        },
        style: ResolvedStyle::default(),
        children: vec![child_rect],
        clip: true,
    });
    let page = make_page(vec![group]);
    let instances = collect_instances_for_page(&page);
    assert_eq!(instances.len(), 1);
    assert_eq!(instances[0].bounds, [90.0, 90.0, 80.0, 80.0]);
}

#[test]
fn line_instance_encodes_from_to_offset() {
    let line = VisualElement::Line(LineElement {
        id: EdgeId::default(),
        from: Point { x: 0.0, y: 0.0 },
        to: Point { x: 100.0, y: 200.0 },
        style: ResolvedStyle {
            stroke_color: Some("#ff0000".to_owned()),
            stroke_width: Some(3.0),
            ..Default::default()
        },
    });
    let page = make_page(vec![line]);
    let instances = collect_instances_for_page(&page);
    assert_eq!(instances.len(), 1);
    assert_eq!(instances[0].bounds, [0.0, 0.0, 100.0, 200.0]);
    assert_eq!(instances[0].stroke_width, 3.0);
    assert_eq!(instances[0].shape_type, SHAPE_LINE);
}
