//! Tests for PageScene math field propagation.

use diagram_core::geometry::CellGeometry;
use diagram_core::{DiagramModel, Page};
use diagram_scene::SceneBuilder;

/// Verifies that `PageScene.math_enabled` reflects the page's `math_enabled` flag.
/// Covers MATH-010 (precondition) and MATH-020 (precondition).
#[test]
fn page_scene_math_enabled_propagates() {
    let mut model = DiagramModel::new();

    let mut page = Page::new(diagram_core::PageId::default());
    page.math_enabled = true;
    let pid = model.store.insert_page(page);

    // Add a minimal vertex so the page has content
    let geom = CellGeometry {
        x: 10.0,
        y: 20.0,
        width: 80.0,
        height: 40.0,
        relative: false,
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
    };
    let vertex = diagram_core::Vertex {
        geometry: Some(geom),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_vertex(vertex);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();

    assert_eq!(scene.pages.len(), 1);
    let page_scene = &scene.pages[0];
    assert!(
        page_scene.math_enabled,
        "PageScene.math_enabled must be true when Page.math_enabled is true"
    );
}

/// Verifies that `math_enabled` defaults to false when the page has it set to false.
#[test]
fn page_scene_math_enabled_defaults_false() {
    let mut model = DiagramModel::new();

    // Page with math_enabled = false (the default)
    let page = Page::new(diagram_core::PageId::default());
    let pid = model.store.insert_page(page);

    let geom = CellGeometry {
        x: 10.0,
        y: 20.0,
        width: 80.0,
        height: 40.0,
        relative: false,
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
    };
    let vertex = diagram_core::Vertex {
        geometry: Some(geom),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_vertex(vertex);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();

    assert_eq!(scene.pages.len(), 1);
    let page_scene = &scene.pages[0];
    assert!(
        !page_scene.math_enabled,
        "PageScene.math_enabled must be false when Page.math_enabled is false"
    );
}
