//! Visual element to SVG conversion.

use diagram_scene::{
    EllipseElement, LineElement, RectElement, RoundedRectElement, TextElement, VisualElement,
};

use crate::escape::escape_text;
use crate::style::{AttrContext, style_to_attrs};

/// Converts a `VisualElement` to an SVG string.
///
/// Returns the SVG representation of the element, indented with 2 spaces per
/// depth level. Path and Group elements are handled in a future PR.
pub(crate) fn element_to_svg(elem: &VisualElement, indent: usize) -> String {
    match elem {
        VisualElement::Rect(r) => rect_to_svg(r, indent),
        VisualElement::RoundedRect(r) => rounded_rect_to_svg(r, indent),
        VisualElement::Ellipse(e) => ellipse_to_svg(e, indent),
        VisualElement::Text(t) => text_to_svg(t, indent),
        VisualElement::Line(l) => line_to_svg(l, indent),
        // Path and Group are handled in PR 2; catch-all for non-exhaustive enum
        _ => String::new(),
    }
}

/// Helper to produce the correct indent string.
fn make_indent(indent: usize) -> String {
    "  ".repeat(indent)
}

fn rect_to_svg(r: &RectElement, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = style_to_attrs(&r.style, AttrContext::Shape);
    format!(
        "{}<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\"{}/>",
        ind,
        r.bounds.origin.x,
        r.bounds.origin.y,
        r.bounds.size.width,
        r.bounds.size.height,
        style
    )
}

fn rounded_rect_to_svg(r: &RoundedRectElement, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = style_to_attrs(&r.style, AttrContext::Shape);
    format!(
        "{}<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"{}\" ry=\"{}\"{}/>",
        ind,
        r.bounds.origin.x,
        r.bounds.origin.y,
        r.bounds.size.width,
        r.bounds.size.height,
        r.radius,
        r.radius,
        style
    )
}

fn ellipse_to_svg(e: &EllipseElement, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = style_to_attrs(&e.style, AttrContext::Shape);
    let cx = e.bounds.origin.x + e.bounds.size.width / 2.0;
    let cy = e.bounds.origin.y + e.bounds.size.height / 2.0;
    let rx = e.bounds.size.width / 2.0;
    let ry = e.bounds.size.height / 2.0;
    format!(
        "{}<ellipse cx=\"{}\" cy=\"{}\" rx=\"{}\" ry=\"{}\"{}/>",
        ind, cx, cy, rx, ry, style
    )
}

fn text_to_svg(t: &TextElement, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = style_to_attrs(&t.style, AttrContext::Text);
    let escaped = escape_text(&t.text);
    format!(
        "{}<text x=\"{}\" y=\"{}\"{}>{}</text>",
        ind,
        t.anchor.x,
        t.anchor.y,
        style,
        escaped
    )
}

fn line_to_svg(l: &LineElement, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = style_to_attrs(&l.style, AttrContext::Edge);
    format!(
        "{}<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\"{}/>",
        ind,
        l.from.x,
        l.from.y,
        l.to.x,
        l.to.y,
        style
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::geometry::{Point, Rect, Size};
    use diagram_core::{EdgeId, GroupId, VertexId};
    use diagram_scene::ResolvedStyle;

    fn empty_style() -> ResolvedStyle {
        ResolvedStyle::default()
    }

    #[test]
    fn rect_to_svg_basic() {
        let rect = RectElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 10.0, y: 20.0 },
                size: Size {
                    width: 80.0,
                    height: 40.0,
                },
            },
            style: empty_style(),
        };
        let result = rect_to_svg(&rect, 1);
        assert!(result.contains("<rect x=\"10\" y=\"20\" width=\"80\" height=\"40\""));
    }

    #[test]
    fn rect_with_style_emits_fill_and_stroke() {
        let rect = RectElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 100.0,
                    height: 100.0,
                },
            },
            style: ResolvedStyle {
                fill_color: Some("#dae8fc".to_owned()),
                stroke_color: Some("#6c8ebf".to_owned()),
                stroke_width: Some(2.0),
                ..Default::default()
            },
        };
        let result = rect_to_svg(&rect, 0);
        assert!(result.contains("fill=\"#dae8fc\""));
        assert!(result.contains("stroke=\"#6c8ebf\""));
        assert!(result.contains("stroke-width=\"2\""));
    }

    #[test]
    fn rounded_rect_emits_rx_ry() {
        let rect = RoundedRectElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 100.0,
                    height: 100.0,
                },
            },
            radius: 8.0,
            style: empty_style(),
        };
        let result = rounded_rect_to_svg(&rect, 0);
        assert!(result.contains("rx=\"8\""));
        assert!(result.contains("ry=\"8\""));
    }

    #[test]
    fn ellipse_calculates_center_and_radii() {
        let ellipse = EllipseElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 10.0, y: 20.0 },
                size: Size {
                    width: 80.0,
                    height: 40.0,
                },
            },
            style: empty_style(),
        };
        let result = ellipse_to_svg(&ellipse, 0);
        // cx = 10 + 80/2 = 50, cy = 20 + 40/2 = 40, rx = 40, ry = 20
        assert!(result.contains("cx=\"50\""));
        assert!(result.contains("cy=\"40\""));
        assert!(result.contains("rx=\"40\""));
        assert!(result.contains("ry=\"20\""));
    }

    #[test]
    fn text_escapes_content() {
        let text = TextElement {
            owner: diagram_scene::EntityId::Vertex(VertexId::default()),
            anchor: Point { x: 0.0, y: 0.0 },
            text: "if x < 5 && y > 3".to_owned(),
            style: empty_style(),
        };
        let result = text_to_svg(&text, 0);
        assert!(result.contains("if x &lt; 5 &amp;&amp; y &gt; 3"));
    }

    #[test]
    fn line_emits_edge_style_context() {
        let line = LineElement {
            id: EdgeId::default(),
            from: Point { x: 0.0, y: 0.0 },
            to: Point { x: 100.0, y: 100.0 },
            style: empty_style(),
        };
        let result = line_to_svg(&line, 0);
        assert!(result.contains("x1=\"0\""));
        assert!(result.contains("y1=\"0\""));
        assert!(result.contains("x2=\"100\""));
        assert!(result.contains("y2=\"100\""));
    }

    #[test]
    fn path_and_group_return_empty() {
        // These are handled in PR 2, they should return empty string
        let path = VisualElement::Path(diagram_scene::PathElement {
            id: EdgeId::default(),
            points: vec![],
            style: empty_style(),
        });
        let group = VisualElement::Group(diagram_scene::GroupElement {
            id: GroupId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 100.0,
                    height: 100.0,
                },
            },
            style: empty_style(),
            children: vec![],
            clip: false,
        });
        assert_eq!(element_to_svg(&path, 0), "");
        assert_eq!(element_to_svg(&group, 0), "");
    }
}
