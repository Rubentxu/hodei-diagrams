//! Golden tests for multi-page output and remaining→style attribute.

use diagram_core::StyleMap;
use diagram_core::geometry::{Point, Rect, Size};
use diagram_core::{GroupId, VertexId};
use diagram_render_svg::SvgRenderer;
use diagram_scene::{
    GroupElement, PageId, PageScene, RectElement, ResolvedStyle, Scene, VisualElement,
};

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
fn render_pages_returns_all_pages_in_order() {
    let page_a = PageScene {
        page_id: PageId::default(),
        name: "First".to_owned(),
        width: 100.0,
        height: 100.0,
        display_list: vec![],
        background: None,
    };
    let page_b = PageScene {
        page_id: PageId::default(),
        name: "Second".to_owned(),
        width: 200.0,
        height: 200.0,
        display_list: vec![],
        background: None,
    };

    let scene = Scene {
        pages: vec![page_a.clone(), page_b.clone()],
    };
    let renderer = SvgRenderer::new();
    let result = renderer.render_pages(&scene).unwrap();

    assert_eq!(result.len(), 2);
    assert_eq!(result[0].0, page_a.page_id);
    assert_eq!(result[1].0, page_b.page_id);
}

#[test]
fn render_pages_contains_correct_titles() {
    let page_a = PageScene {
        page_id: PageId::default(),
        name: "First".to_owned(),
        width: 100.0,
        height: 100.0,
        display_list: vec![],
        background: None,
    };
    let page_b = PageScene {
        page_id: PageId::default(),
        name: "Second".to_owned(),
        width: 200.0,
        height: 200.0,
        display_list: vec![],
        background: None,
    };

    let scene = Scene {
        pages: vec![page_a, page_b],
    };
    let renderer = SvgRenderer::new();
    let result = renderer.render_pages(&scene).unwrap();

    assert!(result[0].1.contains("<title>First</title>"));
    assert!(result[1].1.contains("<title>Second</title>"));
}

#[test]
fn render_pages_clip_counter_resets_per_page() {
    let clip_group = VisualElement::Group(GroupElement {
        id: GroupId::default(),
        bounds: make_rect(0.0, 0.0, 100.0, 100.0),
        style: empty_style(),
        children: vec![],
        clip: true,
    });

    let page_a = PageScene {
        page_id: PageId::default(),
        name: "Page-A".to_owned(),
        width: 100.0,
        height: 100.0,
        display_list: vec![clip_group.clone()],
        background: None,
    };
    let page_b = PageScene {
        page_id: PageId::default(),
        name: "Page-B".to_owned(),
        width: 100.0,
        height: 100.0,
        display_list: vec![clip_group],
        background: None,
    };

    let scene = Scene {
        pages: vec![page_a, page_b],
    };
    let renderer = SvgRenderer::new();
    let result = renderer.render_pages(&scene).unwrap();

    // Both pages should have clip_0 (counter reset per page)
    assert!(result[0].1.contains("clip_0"), "Page A should have clip_0");
    assert!(result[1].1.contains("clip_0"), "Page B should have clip_0");
    // Neither should have clip_1
    assert!(
        !result[0].1.contains("clip_1"),
        "Page A should not have clip_1"
    );
    assert!(
        !result[1].1.contains("clip_1"),
        "Page B should not have clip_1"
    );
}

#[test]
fn remaining_style_emitted_in_lexicographic_order() {
    // Build a rect with remaining style entries that would be unsorted
    // if not using BTreeMap (glass < gradientColor alphabetically)
    let mut remaining = StyleMap::new();
    remaining.insert("glass", "0");
    remaining.insert("gradientColor", "#cccccc");

    let rect = VisualElement::Rect(RectElement {
        id: VertexId::default(),
        bounds: make_rect(0.0, 0.0, 100.0, 100.0),
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
        style: ResolvedStyle {
            fill_color: Some("#ffffff".to_owned()),
            remaining,
            ..Default::default()
        },
    });

    let page = PageScene {
        page_id: PageId::default(),
        name: "StyleTest".to_owned(),
        width: 100.0,
        height: 100.0,
        display_list: vec![rect],
        background: None,
    };

    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();
    let svg = renderer.render(&scene, PageId::default()).unwrap();

    // glass comes before gradientColor lexicographically
    assert!(
        svg.contains("style=\"glass=0;gradientColor=#cccccc\""),
        "Expected style attribute with glass before gradientColor"
    );
}

#[test]
fn render_pages_deterministic_same_scene_twice() {
    let page = PageScene {
        page_id: PageId::default(),
        name: "Determinism".to_owned(),
        width: 100.0,
        height: 100.0,
        display_list: vec![],
        background: None,
    };

    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();

    let result_a = renderer.render_pages(&scene).unwrap();
    let result_b = renderer.render_pages(&scene).unwrap();

    assert_eq!(result_a.len(), result_b.len());
    assert_eq!(result_a[0].1, result_b[0].1);
}

#[test]
fn render_pages_cross_instance_determinism() {
    let page_id = PageId::default();
    let page = PageScene {
        page_id,
        name: "CrossInstance".to_owned(),
        width: 100.0,
        height: 100.0,
        display_list: vec![],
        background: None,
    };

    let scene = Scene { pages: vec![page] };

    let r1 = SvgRenderer::new();
    let r2 = SvgRenderer::new();

    let svg1 = r1.render(&scene, page_id).unwrap();
    let svg2 = r2.render(&scene, page_id).unwrap();

    assert_eq!(svg1, svg2);
}

#[test]
fn empty_scene_render_pages_returns_empty_vec() {
    let scene = Scene { pages: vec![] };
    let renderer = SvgRenderer::new();
    let result = renderer.render_pages(&scene).unwrap();
    assert!(result.is_empty());
}
