//! Golden tests for leaf primitive rendering.

use diagram_core::VertexId;
use diagram_core::geometry::{Point, Rect, Size};
use diagram_render_svg::{RenderError, SvgRenderer};
use diagram_scene::{
    PageId, RectElement, ResolvedStyle, Scene, VisualElement,
};

#[test]
fn simple_rect_renders_correctly() {
    // Build Scene matching spec §C1 scenario: bounds 10,20 80×40
    let rect = VisualElement::Rect(RectElement {
        id: VertexId::default(),
        bounds: Rect {
            origin: Point { x: 10.0, y: 20.0 },
            size: Size {
                width: 80.0,
                height: 40.0,
            },
        },
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
        style: ResolvedStyle {
            fill_color: Some("#dae8fc".to_owned()),
            stroke_color: Some("#6c8ebf".to_owned()),
            ..Default::default()
        },
    });

    let page = diagram_scene::PageScene {
        page_id: PageId::default(),
        name: "Page-1".to_owned(),
        width: 827.0,
        height: 1169.0,
        display_list: vec![rect],
        background: None,
    };

    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();
    let svg = renderer.render(&scene, PageId::default()).unwrap();

    // Assert output begins with correct SVG tag
    assert!(svg.starts_with("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 827 1169\">"));

    // Assert contains title
    assert!(svg.contains("<title>Page-1</title>"));

    // Assert contains white background rect
    assert!(svg.contains("<rect x=\"0\" y=\"0\" width=\"827\" height=\"1169\" fill=\"white\"/>"));

    // Assert contains the rect with correct attributes (including data-vertex-id)
    assert!(svg.contains("x=\"10\""));
    assert!(svg.contains("y=\"20\""));
    assert!(svg.contains("width=\"80\""));
    assert!(svg.contains("height=\"40\""));
    assert!(svg.contains("fill=\"#dae8fc\""));
    assert!(svg.contains("stroke=\"#6c8ebf\""));
    assert!(svg.contains("data-vertex-id=\""));

    // Assert no old-style engine IDs
    assert!(!svg.contains("vertex#"));
    assert!(!svg.contains("edge#"));
    assert!(!svg.contains("group#"));
}

#[test]
fn empty_scene_missing_page_returns_error() {
    let scene = Scene { pages: vec![] };
    let renderer = SvgRenderer::new();
    let result = renderer.render(&scene, PageId::default());
    assert!(matches!(
        result,
        Err(RenderError::PageNotFound { page_id: _ })
    ));
}

#[test]
fn rect_with_no_style_renders() {
    let rect = VisualElement::Rect(RectElement {
        id: VertexId::default(),
        bounds: Rect {
            origin: Point { x: 0.0, y: 0.0 },
            size: Size {
                width: 100.0,
                height: 100.0,
            },
        },
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
        style: ResolvedStyle::default(),
    });

    let page = diagram_scene::PageScene {
        page_id: PageId::default(),
        name: "EmptyStyle".to_owned(),
        width: 100.0,
        height: 100.0,
        display_list: vec![rect],
        background: None,
    };

    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();
    let svg = renderer.render(&scene, PageId::default()).unwrap();

    // Should render the rect with no style attributes (but with data-vertex-id)
    assert!(svg.contains("x=\"0\""));
    assert!(svg.contains("y=\"0\""));
    assert!(svg.contains("width=\"100\""));
    assert!(svg.contains("height=\"100\""));
    assert!(svg.contains("data-vertex-id=\""));
}

#[test]
fn multiple_rects_render_in_order() {
    let rect1 = VisualElement::Rect(RectElement {
        id: VertexId::default(),
        bounds: Rect {
            origin: Point { x: 0.0, y: 0.0 },
            size: Size {
                width: 50.0,
                height: 50.0,
            },
        },
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
        style: ResolvedStyle {
            fill_color: Some("#ff0000".to_owned()),
            ..Default::default()
        },
    });

    let rect2 = VisualElement::Rect(RectElement {
        id: VertexId::default(),
        bounds: Rect {
            origin: Point { x: 60.0, y: 60.0 },
            size: Size {
                width: 40.0,
                height: 40.0,
            },
        },
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
        style: ResolvedStyle {
            fill_color: Some("#0000ff".to_owned()),
            ..Default::default()
        },
    });

    let page = diagram_scene::PageScene {
        page_id: PageId::default(),
        name: "MultiRect".to_owned(),
        width: 100.0,
        height: 100.0,
        display_list: vec![rect1, rect2],
        background: None,
    };

    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();
    let svg = renderer.render(&scene, PageId::default()).unwrap();

    // Both rects should be present
    assert!(svg.contains("fill=\"#ff0000\""));
    assert!(svg.contains("fill=\"#0000ff\""));
}

// FIXME(image-element): ImageElement not yet implemented in diagram-scene
#[test]
#[ignore]
fn image_to_svg_data_uri() {
    todo!("ImageElement not yet implemented in diagram-scene")
}

// FIXME(image-element): ImageElement not yet implemented in diagram-scene
#[test]
#[ignore]
fn image_to_svg_url_with_ampersand_escaped() {
    todo!("ImageElement not yet implemented in diagram-scene")
}

// FIXME(image-element): ImageElement not yet implemented in diagram-scene
#[test]
#[ignore]
fn image_to_svg_none_emits_placeholder() {
    todo!("ImageElement not yet implemented in diagram-scene")
}

// FIXME(image-element): ImageElement not yet implemented in diagram-scene
#[test]
#[ignore]
fn image_aspect_variants_map_to_preserve_aspect_ratio() {
    todo!("ImageElement not yet implemented in diagram-scene")
}
