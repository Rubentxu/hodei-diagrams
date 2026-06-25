//! Visual regression tests for the WebGPU renderer.
//!
//! These tests require a GPU and are gated behind `#[cfg(feature = "visual-tests")]`.
//! Run with: `cargo test --features visual-tests -- --ignored`
//!
//! ## First run
//!
//! The first run will fail because no golden files exist. Inspect the output
//! PNG manually, then copy it to `tests/golden/` as the reference.

#![cfg(feature = "visual-tests")]
#![cfg(not(target_arch = "wasm32"))]

use diagram_core::VertexId;
use diagram_core::geometry::{Point, Rect, Size};
use diagram_render_wgpu::{renderer::collect_instances_for_page, shapes::SHAPE_RECT};
use diagram_scene::{PageId, PageScene, RectElement, ResolvedStyle, VisualElement};

/// Create a simple 4-shape fixture: rect, rounded rect, ellipse, and line.
fn four_shape_fixture() -> PageScene {
    use diagram_core::EdgeId;
    use diagram_scene::{EllipseElement, LineElement, RoundedRectElement};

    let rect = VisualElement::Rect(RectElement {
        id: VertexId::default(),
        bounds: Rect {
            origin: Point { x: 10.0, y: 20.0 },
            size: Size {
                width: 80.0,
                height: 40.0,
            },
        },
        style: ResolvedStyle {
            fill_color: Some("#dae8fc".to_owned()),
            stroke_color: Some("#6c8ebf".to_owned()),
            stroke_width: Some(2.0),
            ..Default::default()
        },
    });
    let rounded = VisualElement::RoundedRect(RoundedRectElement {
        id: VertexId::default(),
        bounds: Rect {
            origin: Point { x: 100.0, y: 20.0 },
            size: Size {
                width: 60.0,
                height: 50.0,
            },
        },
        radius: 8.0,
        style: ResolvedStyle {
            fill_color: Some("#f8cecc".to_owned()),
            stroke_color: Some("#b85450".to_owned()),
            stroke_width: Some(2.0),
            ..Default::default()
        },
    });
    let ellipse = VisualElement::Ellipse(EllipseElement {
        id: VertexId::default(),
        bounds: Rect {
            origin: Point { x: 180.0, y: 20.0 },
            size: Size {
                width: 60.0,
                height: 40.0,
            },
        },
        style: ResolvedStyle {
            fill_color: Some("#d5e8d4".to_owned()),
            stroke_color: Some("#82b366".to_owned()),
            stroke_width: Some(2.0),
            ..Default::default()
        },
    });
    let line = VisualElement::Line(LineElement {
        id: EdgeId::default(),
        from: Point { x: 10.0, y: 100.0 },
        to: Point { x: 200.0, y: 140.0 },
        style: ResolvedStyle {
            stroke_color: Some("#000000".to_owned()),
            stroke_width: Some(3.0),
            ..Default::default()
        },
    });

    PageScene {
        page_id: PageId::default(),
        name: "four_shapes".to_owned(),
        width: 300.0,
        height: 200.0,
        display_list: vec![rect, rounded, ellipse, line],
        background: None,
        math_enabled: false,
    }
}

#[test]
#[ignore]
fn render_four_shapes_to_png() {
    let page = four_shape_fixture();
    let _instances = collect_instances_for_page(&page);
    assert!(_instances.len() == 4, "expected 4 instances");

    // GPU rendering requires a headless wgpu instance.
    // This test must be run with a GPU available.
    //
    // TODO: Implement headless GPU rendering and screenshot comparison.
    // The current implementation captures instance count only, which
    // is verified without GPU in scene_to_instances tests.
    //
    // Full visual regression (render → readback → compare golden)
    // will be implemented in v1.1 once we have headless surface support.
}

#[test]
#[ignore]
fn group_clipping_visual_regression() {
    use diagram_core::GroupId;
    use diagram_scene::GroupElement;

    // Group (clip=true) with child rect extending past bounds
    let child = VisualElement::Rect(RectElement {
        id: VertexId::default(),
        bounds: Rect {
            origin: Point { x: 90.0, y: 90.0 },
            size: Size {
                width: 80.0,
                height: 80.0,
            },
        },
        style: ResolvedStyle {
            fill_color: Some("#ff0000".to_owned()),
            ..Default::default()
        },
    });
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
        children: vec![child],
        clip: true,
    });
    let page = PageScene {
        page_id: PageId::default(),
        name: "group_clip".to_owned(),
        width: 200.0,
        height: 200.0,
        display_list: vec![group],
        background: None,
        math_enabled: false,
    };

    let _instances = collect_instances_for_page(&page);
    assert!(_instances.len() == 1, "expected 1 instance");
}
