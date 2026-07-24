//! Tests for SVG rendering of math-bearing labels.
//!
//! Covers MATH-020 (text + data-math-id + data-latex emitted for math labels)
//! and MATH-021 (text labels emit no math metadata).

use diagram_core::geometry::Point;
use diagram_core::{EdgeId, VertexId};
use diagram_render_svg::renderer::SvgRenderer;
use diagram_scene::{EntityId, PageScene, Scene, TextElement, VisualElement};

/// MATH-020: A cell with a math-bearing label emits `<text data-math-id="..." data-latex="...">`.
/// No `<foreignObject>` is emitted for math cells.
#[test]
fn math_label_emits_text_with_data_math_id_and_data_latex() {
    let vid = VertexId::default();
    let latex = r"\int_0^1 x\,dx";

    let text_elem = TextElement {
        owner: EntityId::Vertex(vid),
        anchor: Point { x: 10.0, y: 20.0 },
        text: latex.to_owned(),
        style: Default::default(),
        is_math: true,
    };

    let page = PageScene {
        page_id: Default::default(),
        name: "Math Page".to_owned(),
        width: 200.0,
        height: 200.0,
        display_list: vec![VisualElement::Text(text_elem)],
        background: None,
        math_enabled: true,
    };

    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();
    let svg = renderer
        .render(&scene, Default::default(), None)
        .expect("render must succeed");

    // Must contain the math data attributes
    assert!(
        svg.contains(r#"data-math-id="#) && svg.contains(r#"data-latex=""#),
        "SVG must contain data-math-id and data-latex attributes for math label"
    );
    assert!(
        svg.contains(&format!(r#"data-latex="{}">"#, latex)),
        "SVG data-latex attribute must contain the raw LaTeX verbatim: {}",
        latex
    );

    // Must NOT emit foreignObject
    assert!(
        !svg.contains("<foreignObject"),
        "SVG must NOT contain <foreignObject> for math labels (HTML overlay is TS layer responsibility)"
    );
}

/// MATH-021: A cell with a plain Text label emits no `data-math-id` or `data-latex` attributes.
#[test]
fn text_label_emits_no_math_attributes() {
    let vid = VertexId::default();

    let text_elem = TextElement {
        owner: EntityId::Vertex(vid),
        anchor: Point { x: 10.0, y: 20.0 },
        text: "hello world".to_owned(),
        style: Default::default(),
        is_math: false,
    };

    let page = PageScene {
        page_id: Default::default(),
        name: "Text Page".to_owned(),
        width: 200.0,
        height: 200.0,
        display_list: vec![VisualElement::Text(text_elem)],
        background: None,
        math_enabled: false,
    };

    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();
    let svg = renderer
        .render(&scene, Default::default(), None)
        .expect("render must succeed");

    // Must NOT contain math data attributes
    assert!(
        !svg.contains("data-math-id"),
        "SVG must NOT contain data-math-id for plain text label"
    );
    assert!(
        !svg.contains("data-latex"),
        "SVG must NOT contain data-latex for plain text label"
    );

    // Must still contain the text content
    assert!(
        svg.contains("hello world"),
        "SVG must still contain the text content"
    );
}

/// MATH-020: Edge labels with is_math=true also emit math attributes.
#[test]
fn math_edge_label_emits_data_math_id() {
    let eid = EdgeId::default();
    let latex = r"\sum_{i=0}^n i";

    let text_elem = TextElement {
        owner: EntityId::Edge(eid),
        anchor: Point { x: 50.0, y: 50.0 },
        text: latex.to_owned(),
        style: Default::default(),
        is_math: true,
    };

    let page = PageScene {
        page_id: Default::default(),
        name: "Edge Math".to_owned(),
        width: 200.0,
        height: 200.0,
        display_list: vec![VisualElement::Text(text_elem)],
        background: None,
        math_enabled: true,
    };

    let scene = Scene { pages: vec![page] };
    let renderer = SvgRenderer::new();
    let svg = renderer
        .render(&scene, Default::default(), None)
        .expect("render must succeed");

    assert!(
        svg.contains(r#"data-math-id="#) && svg.contains(r#"data-latex=""#),
        "Edge math label must also emit data-math-id and data-latex"
    );
    assert!(
        !svg.contains("<foreignObject"),
        "Edge math label must NOT emit <foreignObject>"
    );
}
