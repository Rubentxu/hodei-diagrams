//! Visual element to SVG conversion.

use diagram_core::VertexId;
use diagram_scene::{
    EllipseElement, GroupElement, LineElement, PathElement, RectElement, RoundedRectElement,
    TextElement, VisualElement,
};

use crate::clip::ClipPathManager;
use crate::escape::escape_text;
use crate::style::{AttrContext, style_to_attrs};

/// Serialize a `VertexId` to a `data-vertex-id` attribute string.
///
/// Format: `data-vertex-id="idx:version"` — compact, no quote-escaping needed
/// in SVG attributes. Both fields are required for slotmap lookups.
fn vid_attr(id: &VertexId) -> String {
    let v = serde_json::to_value(id).expect("VertexId should serialize");
    let idx = v["idx"].as_u64().expect("VertexId idx should be u64");
    let version = v["version"]
        .as_u64()
        .expect("VertexId version should be u64");
    format!(" data-vertex-id=\"{idx}:{version}\"")
}

/// Converts a `VisualElement` to an SVG string.
///
/// Returns the SVG representation of the element, indented with 2 spaces per
/// depth level. Takes a `ClipPathManager` to register clip paths for groups.
pub(crate) fn element_to_svg(
    elem: &VisualElement,
    clip: &mut ClipPathManager,
    indent: usize,
) -> String {
    match elem {
        VisualElement::Rect(r) => rect_to_svg(r, indent),
        VisualElement::RoundedRect(r) => rounded_rect_to_svg(r, indent),
        VisualElement::Ellipse(e) => ellipse_to_svg(e, indent),
        VisualElement::Text(t) => text_to_svg(t, indent),
        VisualElement::Line(l) => line_to_svg(l, indent),
        VisualElement::Path(p) => path_to_svg(p, indent),
        VisualElement::Group(g) => group_to_svg(g, clip, indent),
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
    let vid = vid_attr(&r.id);
    format!(
        "{}<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\"{}{}/>",
        ind,
        r.bounds.origin.x,
        r.bounds.origin.y,
        r.bounds.size.width,
        r.bounds.size.height,
        vid,
        style
    )
}

fn rounded_rect_to_svg(r: &RoundedRectElement, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = style_to_attrs(&r.style, AttrContext::Shape);
    let vid = vid_attr(&r.id);
    format!(
        "{}<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"{}\" ry=\"{}\"{}{}/>",
        ind,
        r.bounds.origin.x,
        r.bounds.origin.y,
        r.bounds.size.width,
        r.bounds.size.height,
        r.radius,
        r.radius,
        vid,
        style
    )
}

fn ellipse_to_svg(e: &EllipseElement, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = style_to_attrs(&e.style, AttrContext::Shape);
    let vid = vid_attr(&e.id);
    let cx = e.bounds.origin.x + e.bounds.size.width / 2.0;
    let cy = e.bounds.origin.y + e.bounds.size.height / 2.0;
    let rx = e.bounds.size.width / 2.0;
    let ry = e.bounds.size.height / 2.0;
    format!(
        "{}<ellipse cx=\"{}\" cy=\"{}\" rx=\"{}\" ry=\"{}\"{}{}/>",
        ind, cx, cy, rx, ry, vid, style
    )
}

fn text_to_svg(t: &TextElement, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = style_to_attrs(&t.style, AttrContext::Text);
    let escaped = escape_text(&t.text);
    format!(
        "{}<text x=\"{}\" y=\"{}\"{}>{}</text>",
        ind, t.anchor.x, t.anchor.y, style, escaped
    )
}

fn line_to_svg(l: &LineElement, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = style_to_attrs(&l.style, AttrContext::Edge);
    format!(
        "{}<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\"{}/>",
        ind, l.from.x, l.from.y, l.to.x, l.to.y, style
    )
}

fn path_to_svg(p: &PathElement, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = style_to_attrs(&p.style, AttrContext::Edge);

    let d = if p.points.is_empty() {
        String::new()
    } else {
        let mut d = String::from("M ");
        for (i, pt) in p.points.iter().enumerate() {
            if i > 0 {
                d.push_str(" L ");
            }
            d.push_str(&pt.x.to_string());
            d.push(' ');
            d.push_str(&pt.y.to_string());
        }
        d
    };

    format!("{}<path d=\"{}\"{}/>", ind, d, style)
}

fn group_to_svg(g: &GroupElement, clip: &mut ClipPathManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let child_indent = indent + 1;

    // Render children first
    let children_svg: Vec<String> = g
        .children
        .iter()
        .map(|child| element_to_svg(child, clip, child_indent))
        .collect();

    let (open_tag, close_tag) = if g.clip {
        let clip_id = clip.register(
            g.bounds.origin.x,
            g.bounds.origin.y,
            g.bounds.size.width,
            g.bounds.size.height,
        );
        (
            format!("<g clip-path=\"url(#clip_{})\">", clip_id),
            format!("{}</g>", ind),
        )
    } else {
        ("<g>".to_string(), format!("{}</g>", ind))
    };

    let mut result = String::new();
    result.push_str(&ind);
    result.push_str(&open_tag);
    result.push('\n');
    for child_svg in &children_svg {
        result.push_str(child_svg);
        result.push('\n');
    }
    result.push_str(&close_tag);
    result
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
    fn path_empty_points_emits_empty_d() {
        // Empty path should emit empty d attribute
        let path = VisualElement::Path(diagram_scene::PathElement {
            id: EdgeId::default(),
            points: vec![],
            style: empty_style(),
        });
        let mut clip = ClipPathManager::new();
        let result = element_to_svg(&path, &mut clip, 0);
        assert!(result.contains("d=\"\""));
    }

    #[test]
    fn path_with_points_emits_m_and_l() {
        use diagram_core::geometry::Point;
        let path = VisualElement::Path(diagram_scene::PathElement {
            id: EdgeId::default(),
            points: vec![
                Point { x: 10.0, y: 10.0 },
                Point { x: 50.0, y: 30.0 },
                Point { x: 90.0, y: 10.0 },
            ],
            style: empty_style(),
        });
        let mut clip = ClipPathManager::new();
        let result = element_to_svg(&path, &mut clip, 0);
        assert!(result.contains("M 10 10 L 50 30 L 90 10"));
    }

    #[test]
    fn group_without_clip_emits_g_tag() {
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
        let mut clip = ClipPathManager::new();
        let result = element_to_svg(&group, &mut clip, 0);
        assert!(result.contains("<g>"));
        assert!(result.contains("</g>"));
        assert!(!result.contains("clip-path"));
    }

    #[test]
    fn group_with_clip_emits_clip_path() {
        use diagram_core::geometry::Point;
        let group = VisualElement::Group(diagram_scene::GroupElement {
            id: GroupId::default(),
            bounds: Rect {
                origin: Point { x: 50.0, y: 50.0 },
                size: Size {
                    width: 200.0,
                    height: 150.0,
                },
            },
            style: empty_style(),
            children: vec![],
            clip: true,
        });
        let mut clip = ClipPathManager::new();
        let result = element_to_svg(&group, &mut clip, 0);
        assert!(result.contains("clip-path=\"url(#clip_0)\""));
    }

    #[test]
    fn group_nested_with_child() {
        use diagram_core::geometry::Point;
        let child_rect = VisualElement::Rect(RectElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 10.0, y: 10.0 },
                size: Size {
                    width: 80.0,
                    height: 40.0,
                },
            },
            style: empty_style(),
        });
        let group = VisualElement::Group(diagram_scene::GroupElement {
            id: GroupId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 200.0,
                    height: 200.0,
                },
            },
            style: empty_style(),
            children: vec![child_rect],
            clip: false,
        });
        let mut clip = ClipPathManager::new();
        let result = element_to_svg(&group, &mut clip, 0);
        assert!(result.contains("<g>"));
        assert!(result.contains("</g>"));
        assert!(result.contains("<rect"));
    }
}
