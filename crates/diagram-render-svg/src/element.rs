//! Visual element to SVG conversion.

use diagram_core::geometry::Rect;
use diagram_core::{EdgeId, VertexId};
use diagram_scene::{
    CloudElement, CylinderElement, DiamondElement, EllipseElement, EntityId, GroupElement,
    HexagonElement, ImageAspect, ImageElement, LineElement, ParallelogramElement, PathCommand,
    PathElement, PolygonElement, RectElement, RoundedRectElement, StencilElement, SwimlaneHeader,
    TextElement, TrapezoidElement, TriangleElement, VisualElement,
};

use crate::clip::ClipPathManager;
use crate::defs::DefsManager;
use crate::escape::{escape_attr, escape_text};
use crate::style::{AttrContext, style_to_attrs};

/// Extract a stable string id from a slotmap key (VertexId/EdgeId/...).
///
/// Slotmap new_key_type! keys serialize to `{idx, version}` objects. We
/// read those parts directly via `diagram_core::StableIdExt` instead of
/// going through JSON serialization — this is a rendering hot path and
/// the JSON round-trip was a measurable cost on large diagrams.
///
/// Format: `"idx:version"` — compact, no quote-escaping needed in SVG
/// attributes. Both fields are required for slotmap lookups.
fn stable_id(id: &impl diagram_core::StableIdExt) -> String {
    let (idx, version) = id.stable_id_parts();
    format!("{idx}:{version}")
}

/// Serialize a `VertexId` to a `data-vertex-id` attribute string.
///
/// Format: `data-vertex-id="idx:version"` — compact, no quote-escaping needed
/// in SVG attributes. Both fields are required for slotmap lookups.
fn vid_attr(id: &VertexId) -> String {
    format!(" data-vertex-id=\"{}\"", stable_id(id))
}

/// Serialize an `EdgeId` to a `data-edge-id` attribute string.
///
/// Format: `data-edge-id="idx:version"` — compact, no quote-escaping needed
/// in SVG attributes. Both fields are required for slotmap lookups.
fn eid_attr(id: &EdgeId) -> String {
    format!(" data-edge-id=\"{}\"", stable_id(id))
}

/// Serialize a `GroupId` to a `data-group-id` attribute string.
///
/// Format: `data-group-id="idx:version"` — compact, no quote-escaping needed
/// in SVG attributes. Both fields are required for slotmap lookups.
/// Skips emitting when the id is the default/placeholder (u32::MAX idx, version=1).
fn gid_attr(id: &impl diagram_core::StableIdExt) -> String {
    let (idx, version) = id.stable_id_parts();
    if idx == u32::MAX && version == 1 {
        // This is the slotmap null/placeholder key
        String::new()
    } else {
        format!(" data-group-id=\"{}\"", stable_id(id))
    }
}

/// Converts a `VisualElement` to an SVG string.
///
/// Returns the SVG representation of the element, indented with 2 spaces per
/// depth level. Takes a `ClipPathManager` for group clip paths and a
/// `DefsManager` for gradients and filters.
///
/// When `viewport` is `Some`, elements whose bounds do not intersect the viewport
/// are skipped (culled). The viewport should already be inflated by the desired
/// margin by the caller.
pub(crate) fn element_to_svg(
    elem: &VisualElement,
    clip: &mut ClipPathManager,
    defs: &mut DefsManager,
    indent: usize,
    viewport: Option<&Rect>,
) -> String {
    // Cull check: if viewport is active and element doesn't intersect → skip
    if let Some(vp) = viewport {
        if !diagram_scene::cull::should_include(elem, vp) {
            return String::new();
        }
    }
    match elem {
        VisualElement::Rect(r) => rect_to_svg(r, defs, indent),
        VisualElement::RoundedRect(r) => rounded_rect_to_svg(r, defs, indent),
        VisualElement::Ellipse(e) => ellipse_to_svg(e, defs, indent),
        VisualElement::Diamond(d) => diamond_to_svg(d, defs, indent),
        VisualElement::Triangle(t) => triangle_to_svg(t, defs, indent),
        VisualElement::Hexagon(h) => hexagon_to_svg(h, defs, indent),
        VisualElement::Cylinder(c) => cylinder_to_svg(c, defs, indent),
        VisualElement::Cloud(c) => cloud_to_svg(c, defs, indent),
        VisualElement::Parallelogram(p) => parallelogram_to_svg(p, defs, indent),
        VisualElement::Trapezoid(t) => trapezoid_to_svg(t, defs, indent),
        VisualElement::Polygon(p) => polygon_to_svg(p, defs, indent),
        VisualElement::Text(t) => text_to_svg(t, defs, indent),
        VisualElement::Line(l) => line_to_svg(l, defs, indent),
        VisualElement::Path(p) => path_to_svg(p, defs, indent),
        VisualElement::Group(g) => group_to_svg(g, clip, defs, indent, viewport),
        VisualElement::Stencil(s) => stencil_to_svg(s, defs, indent),
        VisualElement::Image(i) => image_to_svg(i, defs, indent),
        _ => String::new(),
    }
}

/// Helper to produce the correct indent string.
fn make_indent(indent: usize) -> String {
    "  ".repeat(indent)
}

/// Register an arrow marker and return the marker-end/marker-start attribute string.
/// Returns empty string if arrow is None or "none".
///
/// For end arrows with None: defaults to "classic" (draw.io default).
/// For start arrows with None: defaults to "none" (no source arrow).
fn arrow_marker(
    arrow: &Option<String>,
    position: &str, // "end" or "start"
    stroke_color: &Option<String>,
    defs: &mut DefsManager,
) -> String {
    let arrow_type = match (position, arrow) {
        (_, Some(a)) if a == "none" => return String::new(),
        ("end", None) => "classic", // default for end arrow (draw.io default)
        ("start", None) => return String::new(), // default: no start arrow
        (_, Some(a)) => a.as_str(),
        _ => return String::new(),
    };

    let color = stroke_color.as_deref().unwrap_or("#000000");
    let marker_id = format!("arrow-{}-{}", position, arrow_type);

    // Build marker SVG based on type
    let marker_svg = match arrow_type {
        "classic" => {
            // Triangle arrowhead pointing right (will be auto-rotated by SVG)
            format!(
                r#"<marker id="{}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{}" stroke="{}"/></marker>"#,
                marker_id, color, color
            )
        }
        "block" => {
            format!(
                r#"<marker id="{}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><rect x="0" y="0" width="10" height="10" fill="{}" stroke="{}"/></marker>"#,
                marker_id, color, color
            )
        }
        "open" => {
            format!(
                r#"<marker id="{}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="{}"/></marker>"#,
                marker_id, color
            )
        }
        _ => return String::new(), // Unknown arrow type — skip
    };

    defs.add_marker(&marker_id, &marker_svg);

    format!(r#" marker-{}="url(#{})""#, position, marker_id)
}

/// Compute the SVG transform attribute string from rotation and flip values.
///
/// Returns an empty string if no transform is needed (identity).
fn compute_transform(
    bounds: &diagram_core::geometry::Rect,
    rotation: f64,
    flip_h: bool,
    flip_v: bool,
) -> String {
    if rotation == 0.0 && !flip_h && !flip_v {
        return String::new();
    }
    let cx = bounds.origin.x + bounds.size.width / 2.0;
    let cy = bounds.origin.y + bounds.size.height / 2.0;
    let deg = rotation.to_degrees();
    let sx: f64 = if flip_h { -1.0 } else { 1.0 };
    let sy: f64 = if flip_v { -1.0 } else { 1.0 };
    format!(
        " transform=\"rotate({} {} {}) scale({} {})\"",
        deg, cx, cy, sx, sy
    )
}

/// Wrap inner SVG in a `<g data-vertex-id="..." transform="...">` group.
///
/// This separates the rotation/flip transform from the shape element itself,
/// allowing overlay handles (resize/rotation) to be injected as children of the
/// group and automatically inherit the shape's transform.
fn wrap_shape_transform(
    inner: String,
    bounds: &diagram_core::geometry::Rect,
    rotation: f64,
    flip_h: bool,
    flip_v: bool,
    vid: String,
    indent: usize,
) -> String {
    let xform = compute_transform(bounds, rotation, flip_h, flip_v);
    if xform.is_empty() {
        // No transform — inject vid into inner element and return as-is
        // Inner ends with ".../>" — insert vid before the closing
        if vid.is_empty() {
            return inner;
        }
        // Replace the final "/>" with " vid/>"
        let with_vid = inner.replace("/>", &format!("{vid}/>"));
        return with_vid;
    }
    let ind = make_indent(indent);
    format!("{}<g{}{}>\n{}\n{}{}</g>", ind, vid, xform, inner, ind, ind)
}

fn rect_to_svg(r: &RectElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = shape_style_defaults(&r.style, AttrContext::Shape, defs);
    let vid = vid_attr(&r.id);
    // Inner rect WITHOUT vid or transform — both go on the wrapper group
    let inner = format!(
        "{}<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\"{}/>",
        ind, r.bounds.origin.x, r.bounds.origin.y, r.bounds.size.width, r.bounds.size.height, style
    );
    wrap_shape_transform(
        inner, &r.bounds, r.rotation, r.flip_h, r.flip_v, vid, indent,
    )
}

fn rounded_rect_to_svg(r: &RoundedRectElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = shape_style_defaults(&r.style, AttrContext::Shape, defs);
    let vid = vid_attr(&r.id);
    let inner = format!(
        "{}<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"{}\" ry=\"{}\"{}/>",
        ind,
        r.bounds.origin.x,
        r.bounds.origin.y,
        r.bounds.size.width,
        r.bounds.size.height,
        r.radius,
        r.radius,
        style
    );
    wrap_shape_transform(
        inner, &r.bounds, r.rotation, r.flip_h, r.flip_v, vid, indent,
    )
}

fn ellipse_to_svg(e: &EllipseElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = shape_style_defaults(&e.style, AttrContext::Shape, defs);
    let vid = vid_attr(&e.id);
    let cx = e.bounds.origin.x + e.bounds.size.width / 2.0;
    let cy = e.bounds.origin.y + e.bounds.size.height / 2.0;
    let rx = e.bounds.size.width / 2.0;
    let ry = e.bounds.size.height / 2.0;
    let inner = format!(
        "{}<ellipse cx=\"{}\" cy=\"{}\" rx=\"{}\" ry=\"{}\"{}/>",
        ind, cx, cy, rx, ry, style
    );
    wrap_shape_transform(
        inner, &e.bounds, e.rotation, e.flip_h, e.flip_v, vid, indent,
    )
}

fn diamond_to_svg(d: &DiamondElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = shape_style_defaults(&d.style, AttrContext::Shape, defs);
    let vid = vid_attr(&d.id);
    let x = d.bounds.origin.x;
    let y = d.bounds.origin.y;
    let w = d.bounds.size.width;
    let h = d.bounds.size.height;
    // Points: top, right, bottom, left
    let points = format!(
        "{},{} {},{} {},{} {},{}",
        x + w / 2.0,
        y, // top
        x + w,
        y + h / 2.0, // right
        x + w / 2.0,
        y + h, // bottom
        x,
        y + h / 2.0 // left
    );
    let inner = format!("{}<polygon points=\"{}\"{}/>", ind, points, style);
    wrap_shape_transform(
        inner, &d.bounds, d.rotation, d.flip_h, d.flip_v, vid, indent,
    )
}

fn triangle_to_svg(t: &TriangleElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = shape_style_defaults(&t.style, AttrContext::Shape, defs);
    let vid = vid_attr(&t.id);
    let x = t.bounds.origin.x;
    let y = t.bounds.origin.y;
    let w = t.bounds.size.width;
    let h = t.bounds.size.height;
    // Points: top-center, bottom-right, bottom-left
    let points = format!(
        "{},{} {},{} {},{}",
        x + w / 2.0,
        y, // top-center
        x + w,
        y + h, // bottom-right
        x,
        y + h // bottom-left
    );
    let inner = format!("{}<polygon points=\"{}\"{}/>", ind, points, style);
    wrap_shape_transform(
        inner, &t.bounds, t.rotation, t.flip_h, t.flip_v, vid, indent,
    )
}

fn hexagon_to_svg(h: &HexagonElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = shape_style_defaults(&h.style, AttrContext::Shape, defs);
    let vid = vid_attr(&h.id);
    let x = h.bounds.origin.x;
    let y = h.bounds.origin.y;
    let w = h.bounds.size.width;
    let h_h = h.bounds.size.height;
    // Pointy-top hexagon
    let points = format!(
        "{},{} {},{} {},{} {},{} {},{} {},{}",
        x + w / 2.0,
        y, // top
        x + w,
        y + h_h / 4.0, // upper-right
        x + w,
        y + 3.0 * h_h / 4.0, // lower-right
        x + w / 2.0,
        y + h_h, // bottom
        x,
        y + 3.0 * h_h / 4.0, // lower-left
        x,
        y + h_h / 4.0 // upper-left
    );
    let inner = format!("{}<polygon points=\"{}\"{}/>", ind, points, style);
    wrap_shape_transform(
        inner, &h.bounds, h.rotation, h.flip_h, h.flip_v, vid, indent,
    )
}

fn cylinder_to_svg(c: &CylinderElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = shape_style_defaults(&c.style, AttrContext::Shape, defs);
    let vid = vid_attr(&c.id);
    let x = c.bounds.origin.x;
    let y = c.bounds.origin.y;
    let w = c.bounds.size.width;
    let h = c.bounds.size.height;
    let ry = h / 6.0; // ellipse height for top/bottom caps
    // Cylinder: elliptical top, body rect, elliptical bottom
    // Using a path for the body with curved bottom
    let path = format!(
        "M {} {} \
         A {} {} 0 0 1 {} {} \
         L {} {} \
         A {} {} 0 0 0 {} {} \
         Z",
        x,
        y + ry, // move to top-left of ellipse
        w / 2.0,
        ry, // rx, ry
        x + w,
        y + ry, // top-right
        x + w,
        y + h - ry, // right side down
        w / 2.0,
        ry, // rx, ry for bottom ellipse
        x,
        y + h - ry // bottom-left
    );
    let inner = format!("{}<path d=\"{}\"{}/>", ind, path, style);
    wrap_shape_transform(
        inner, &c.bounds, c.rotation, c.flip_h, c.flip_v, vid, indent,
    )
}

fn cloud_to_svg(c: &CloudElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = shape_style_defaults(&c.style, AttrContext::Shape, defs);
    let vid = vid_attr(&c.id);
    let x = c.bounds.origin.x;
    let y = c.bounds.origin.y;
    let w = c.bounds.size.width;
    let h = c.bounds.size.height;
    // Cloud approximation using cubic bezier curves
    // A simple cloud shape with bumps
    let path = format!(
        "M {} {} \
         C {} {} {} {} {} {} \
         C {} {} {} {} {} {} \
         C {} {} {} {} {} {} \
         C {} {} {} {} {} {} \
         Z",
        x + w * 0.25,
        y + h * 0.7, // start
        x + w * 0.1,
        y + h * 0.4,
        x + w * 0.2,
        y + h * 0.1,
        x + w * 0.45,
        y + h * 0.15, // bump 1
        x + w * 0.6,
        y + h * 0.05,
        x + w * 0.85,
        y + h * 0.2,
        x + w * 0.9,
        y + h * 0.5, // bump 2
        x + w * 0.95,
        y + h * 0.7,
        x + w * 0.8,
        y + h * 0.9,
        x + w * 0.5,
        y + h * 0.85, // bump 3
        x + w * 0.2,
        y + h * 0.9,
        x + w * 0.05,
        y + h * 0.75,
        x + w * 0.25,
        y + h * 0.7 // bump 4
    );
    let inner = format!("{}<path d=\"{}\"{}/>", ind, path, style);
    wrap_shape_transform(
        inner, &c.bounds, c.rotation, c.flip_h, c.flip_v, vid, indent,
    )
}

fn parallelogram_to_svg(p: &ParallelogramElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = shape_style_defaults(&p.style, AttrContext::Shape, defs);
    let vid = vid_attr(&p.id);
    let x = p.bounds.origin.x;
    let y = p.bounds.origin.y;
    let w = p.bounds.size.width;
    let h = p.bounds.size.height;
    let skew = w * 0.2; // horizontal skew amount
    // Points: top-left shifted right, top-right, bottom-right shifted left, bottom-left
    let points = format!(
        "{},{} {},{} {},{} {},{}",
        x + skew,
        y, // top-left (shifted right)
        x + w,
        y, // top-right
        x + w - skew,
        y + h, // bottom-right (shifted left)
        x,
        y + h // bottom-left
    );
    let inner = format!("{}<polygon points=\"{}\"{}/>", ind, points, style);
    wrap_shape_transform(
        inner, &p.bounds, p.rotation, p.flip_h, p.flip_v, vid, indent,
    )
}

fn trapezoid_to_svg(t: &TrapezoidElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = shape_style_defaults(&t.style, AttrContext::Shape, defs);
    let vid = vid_attr(&t.id);
    let x = t.bounds.origin.x;
    let y = t.bounds.origin.y;
    let w = t.bounds.size.width;
    let h = t.bounds.size.height;
    let inset = w * 0.15; // top is narrower by this amount on each side
    // Points: top-left (inset), top-right (inset), bottom-right, bottom-left
    let points = format!(
        "{},{} {},{} {},{} {},{}",
        x + inset,
        y, // top-left (inset)
        x + w - inset,
        y, // top-right (inset)
        x + w,
        y + h, // bottom-right
        x,
        y + h // bottom-left
    );
    let inner = format!("{}<polygon points=\"{}\"{}/>", ind, points, style);
    wrap_shape_transform(
        inner, &t.bounds, t.rotation, t.flip_h, t.flip_v, vid, indent,
    )
}

fn polygon_to_svg(p: &PolygonElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = shape_style_defaults(&p.style, AttrContext::Shape, defs);
    let vid = vid_attr(&p.id);

    let points_str = if p.points.is_empty() {
        String::new()
    } else {
        let points: Vec<String> = p
            .points
            .iter()
            .map(|pt| format!("{},{}", pt.x, pt.y))
            .collect();
        points.join(" ")
    };

    let inner = format!("{}<polygon points=\"{}\"{}/>", ind, points_str, style);
    wrap_shape_transform(
        inner, &p.bounds, p.rotation, p.flip_h, p.flip_v, vid, indent,
    )
}

/// Apply sensible default fill/stroke for shapes when the style has none.
///
/// The canvas is dark (#0A0F1A per DESIGN.md), so SVG's default fill of
/// black would make unstyled shapes invisible. We default unstyled shapes
/// to a light-blue fill and a visible stroke, matching the draw.io default
/// visual baseline and ensuring shapes are always visible.
fn shape_style_defaults(
    style: &diagram_scene::ResolvedStyle,
    ctx: AttrContext,
    defs: &mut DefsManager,
) -> String {
    let has_fill = !matches!(style.fill_color.as_deref(), None | Some("none"));
    let has_stroke = !matches!(style.stroke_color.as_deref(), None | Some("none"));
    let mut attrs = style_to_attrs(style, ctx, defs);
    if !has_fill {
        attrs.push_str(" fill=\"#dae8fc\"");
    }
    if !has_stroke {
        attrs.push_str(" stroke=\"#6c8ebf\"");
    }
    attrs
}

fn text_to_svg(t: &TextElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = style_to_attrs(&t.style, AttrContext::Text, defs);
    let escaped = escape_text(&t.text);

    // Add data-edge-label attribute for edge labels to enable drag interaction
    let edge_label_attr = match &t.owner {
        EntityId::Edge(eid) => format!(" data-edge-label=\"{}\"", eid_attr(eid).trim()),
        _ => String::new(),
    };

    // MATH-020: emit data-math-id and data-latex for math-bearing labels.
    // The text content is the raw LaTeX verbatim (XML-escaped for safety).
    // No <foreignObject> is emitted — HTML overlay is the TS layer's concern.
    let math_attrs = if t.is_math {
        let stable = match &t.owner {
            EntityId::Vertex(vid) => stable_id(vid),
            EntityId::Edge(eid) => stable_id(eid),
            _ => return String::new(), // non-math owner types fall back to no math attrs
        };
        let latex_attr = format!(r#" data-latex="{}""#, escape_attr(&t.text));
        format!(r#" data-math-id="{}"{}"#, stable, latex_attr)
    } else {
        String::new()
    };

    format!(
        "{}<text x=\"{}\" y=\"{}\"{}{}{}>{}</text>",
        ind, t.anchor.x, t.anchor.y, edge_label_attr, math_attrs, style, escaped
    )
}

fn line_to_svg(l: &LineElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = style_to_attrs(&l.style, AttrContext::Edge, defs);
    let marker_end = arrow_marker(&l.style.end_arrow, "end", &l.style.stroke_color, defs);
    let marker_start = arrow_marker(&l.style.start_arrow, "start", &l.style.stroke_color, defs);
    format!(
        "{}<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\"{}{}{}{}/>",
        ind,
        l.from.x,
        l.from.y,
        l.to.x,
        l.to.y,
        eid_attr(&l.id),
        marker_end,
        marker_start,
        style
    )
}

fn path_to_svg(p: &PathElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let style = style_to_attrs(&p.style, AttrContext::Edge, defs);
    let marker_end = arrow_marker(&p.style.end_arrow, "end", &p.style.stroke_color, defs);
    let marker_start = arrow_marker(&p.style.start_arrow, "start", &p.style.stroke_color, defs);

    let d = if p.points.is_empty() {
        String::new()
    } else if p.style.curved == Some(true) && p.points.len() >= 3 {
        // Smooth curve through points using Catmull-Rom → Bezier
        catmull_rom_to_bezier(&p.points)
    } else {
        // Straight line segments (existing behavior)
        let mut d = format!("M {} {}", p.points[0].x, p.points[0].y);
        for pt in &p.points[1..] {
            d.push_str(&format!(" L {} {}", pt.x, pt.y));
        }
        d
    };

    format!(
        "{}<path d=\"{}\"{}{}{}{}/>",
        ind,
        d,
        eid_attr(&p.id),
        marker_end,
        marker_start,
        style
    )
}

/// Convert a list of points to a smooth SVG path using Catmull-Rom spline.
/// Produces cubic Bezier segments that pass through all control points smoothly.
fn catmull_rom_to_bezier(points: &[diagram_core::geometry::Point]) -> String {
    if points.len() < 2 {
        return String::new();
    }
    if points.len() == 2 {
        return format!(
            "M {} {} L {} {}",
            points[0].x, points[0].y, points[1].x, points[1].y
        );
    }

    let mut d = format!("M {} {}", points[0].x, points[0].y);

    // Tension factor (0.5 = standard Catmull-Rom)
    let tension = 0.5;

    for i in 0..points.len() - 1 {
        let p0 = if i > 0 { &points[i - 1] } else { &points[0] };
        let p1 = &points[i];
        let p2 = &points[i + 1];
        let p3 = if i + 2 < points.len() {
            &points[i + 2]
        } else {
            p2
        };

        // Catmull-Rom → Cubic Bezier control points
        let c1x = p1.x + (p2.x - p0.x) / 6.0 * tension * 2.0;
        let c1y = p1.y + (p2.y - p0.y) / 6.0 * tension * 2.0;
        let c2x = p2.x - (p3.x - p1.x) / 6.0 * tension * 2.0;
        let c2y = p2.y - (p3.y - p1.y) / 6.0 * tension * 2.0;

        d.push_str(&format!(
            " C {} {} {} {} {} {}",
            c1x, c1y, c2x, c2y, p2.x, p2.y
        ));
    }

    d
}

fn stencil_to_svg(s: &StencilElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let vid = vid_attr(&s.id);

    // Build SVG path d-string from background + foreground commands
    let bg_d = build_path_d(&s.background, s.bounds.size.width, s.bounds.size.height);
    let fg_d = build_path_d(&s.foreground, s.bounds.size.width, s.bounds.size.height);

    let bg_style = shape_style_defaults(&s.style, AttrContext::Shape, defs);
    let fg_style = style_to_attrs(&s.style, AttrContext::Shape, defs);

    let mut inner_parts = Vec::new();

    if !bg_d.is_empty() {
        inner_parts.push(format!("{}<path d=\"{}\"{}/>", ind, bg_d, bg_style));
    }
    if !fg_d.is_empty() {
        inner_parts.push(format!("{}<path d=\"{}\"{}/>", ind, fg_d, fg_style));
    }

    if inner_parts.is_empty() {
        return String::new();
    }

    let inner = inner_parts.join("\n");
    wrap_shape_transform(
        inner, &s.bounds, s.rotation, s.flip_h, s.flip_v, vid, indent,
    )
}

fn image_to_svg(img: &ImageElement, defs: &mut DefsManager, indent: usize) -> String {
    let ind = make_indent(indent);
    let vid = vid_attr(&img.id);
    let x = img.bounds.origin.x;
    let y = img.bounds.origin.y;
    let w = img.bounds.size.width;
    let h = img.bounds.size.height;

    let (href, aspect_ratio) = match &img.image_src {
        Some(src) => {
            let escaped = escape_attr(src);
            let par = match img.aspect {
                ImageAspect::Contain => "xMidYMid meet",
                ImageAspect::Cover => "xMidYMid slice",
                ImageAspect::Stretch => "none",
                _ => "xMidYMid meet",
            };
            (escaped, par)
        }
        None => {
            // Placeholder rect when no image source — wrap with transform helper
            let style = shape_style_defaults(&img.style, AttrContext::Shape, defs);
            let inner = format!(
                "{}<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\"{} fill=\"none\" stroke=\"#ccc\" stroke-dasharray=\"4 2\"/>",
                ind, x, y, w, h, style
            );
            return wrap_shape_transform(
                inner,
                &img.bounds,
                img.rotation,
                img.flip_h,
                img.flip_v,
                vid,
                indent,
            );
        }
    };

    let inner = format!(
        "{}<image href=\"{}\" x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\"{}/>",
        ind,
        href,
        x,
        y,
        w,
        h,
        aspect_ratio_attr(aspect_ratio)
    );
    wrap_shape_transform(
        inner,
        &img.bounds,
        img.rotation,
        img.flip_h,
        img.flip_v,
        vid,
        indent,
    )
}

fn aspect_ratio_attr(par: &str) -> String {
    format!(" preserveAspectRatio=\"{}\"", par)
}
///
/// Scales coordinates from the stencil's native [0, w] × [0, h] space to the
/// element's bounding box.
fn build_path_d(commands: &[PathCommand], width: f64, height: f64) -> String {
    if commands.is_empty() {
        return String::new();
    }

    let mut d = String::new();
    for cmd in commands {
        match cmd {
            PathCommand::Move { x, y } => {
                d.push_str(&format!("M {} {} ", x * width, y * height));
            }
            PathCommand::Line { x, y } => {
                d.push_str(&format!("L {} {} ", x * width, y * height));
            }
            PathCommand::Quad { cx, cy, x, y } => {
                d.push_str(&format!(
                    "Q {} {} {} {} ",
                    cx * width,
                    cy * height,
                    x * width,
                    y * height
                ));
            }
            PathCommand::Curve {
                c1x,
                c1y,
                c2x,
                c2y,
                x,
                y,
            } => {
                d.push_str(&format!(
                    "C {} {} {} {} {} {} ",
                    c1x * width,
                    c1y * height,
                    c2x * width,
                    c2y * height,
                    x * width,
                    y * height
                ));
            }
            PathCommand::Arc {
                rx,
                ry,
                x_axis_rotation,
                large_arc,
                sweep,
                x,
                y,
            } => {
                d.push_str(&format!(
                    "A {} {} {} {} {} {} {} ",
                    rx * width,
                    ry * height,
                    x_axis_rotation,
                    *large_arc as i32,
                    *sweep as i32,
                    x * width,
                    y * height
                ));
            }
            PathCommand::Close => {
                d.push_str("Z ");
            }
            PathCommand::FillStroke => {
                // FillStroke is a draw.io marker that fill+stroke are applied;
                // in SVG this is controlled by presentation attributes on the path element.
                // No path data emitted.
            }
            PathCommand::Fill => {
                // Fill is a draw.io marker — no SVG path data needed.
            }
            PathCommand::Stroke => {
                // Stroke is a draw.io marker — no SVG path data needed.
            }
        }
    }
    d.trim_end().to_owned()
}

fn group_to_svg(
    g: &GroupElement,
    clip: &mut ClipPathManager,
    defs: &mut DefsManager,
    indent: usize,
    viewport: Option<&Rect>,
) -> String {
    let ind = make_indent(indent);
    let child_indent = indent + 1;

    // Render children first — filter by should_include when viewport is active
    let children_svg: Vec<String> = g
        .children
        .iter()
        .filter(|child| viewport.is_none_or(|vp| diagram_scene::cull::should_include(child, vp)))
        .map(|child| element_to_svg(child, clip, defs, child_indent, viewport))
        .collect();

    // Render swimlane header (if any) as the first element inside the group,
    // so it sits behind any nested lanes/shapes but in front of the pool background.
    let header_svg = g.header.as_ref().map(|h| header_to_svg(h, &g.style, defs));

    let (open_tag, close_tag) = if g.clip {
        let clip_id = clip.register(
            g.bounds.origin.x,
            g.bounds.origin.y,
            g.bounds.size.width,
            g.bounds.size.height,
        );
        let gid = gid_attr(&g.id);
        (
            format!("<g clip-path=\"url(#clip_{})\"{gid}>", clip_id),
            format!("{}</g>", ind),
        )
    } else {
        let gid = gid_attr(&g.id);
        (format!("<g{gid}>"), format!("{}</g>", ind))
    };

    let mut result = String::new();
    result.push_str(&ind);
    result.push_str(&open_tag);
    result.push('\n');
    if let Some(ref h_svg) = header_svg {
        result.push_str(h_svg);
        result.push('\n');
    }
    for child_svg in &children_svg {
        result.push_str(child_svg);
        result.push('\n');
    }
    result.push_str(&close_tag);
    result
}

/// Render a swimlane header as an SVG `<rect>` element.
///
/// The header is a visual band that occupies either the top edge
/// (`horizontal=false`) or the left edge (`horizontal=true`) of the
/// enclosing pool, sized by `startSize` in the swimlane style.
///
/// The header inherits the pool's `fill`, `stroke`, and `opacity` so it
/// reads as part of the pool's visual identity (it's the "title strip").
/// A `class="swimlane-header"` hook is added so stylesheets can override
/// the look.
fn header_to_svg(
    h: &SwimlaneHeader,
    pool_style: &diagram_scene::ResolvedStyle,
    defs: &mut DefsManager,
) -> String {
    let ind = make_indent(0);
    let x = h.bounds.origin.x;
    let y = h.bounds.origin.y;
    let w = h.bounds.size.width;
    let height = h.bounds.size.height;
    let style = shape_style_defaults(pool_style, AttrContext::Shape, defs);
    format!(
        "{}<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" class=\"swimlane-header\"{}/>",
        ind, x, y, w, height, style
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
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        };
        let mut defs = DefsManager::new();
        let result = rect_to_svg(&rect, &mut defs, 1);
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
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: ResolvedStyle {
                fill_color: Some("#dae8fc".to_owned()),
                stroke_color: Some("#6c8ebf".to_owned()),
                stroke_width: Some(2.0),
                ..Default::default()
            },
        };
        let mut defs = DefsManager::new();
        let result = rect_to_svg(&rect, &mut defs, 0);
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
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        };
        let mut defs = DefsManager::new();
        let result = rounded_rect_to_svg(&rect, &mut defs, 0);
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
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        };
        let mut defs = DefsManager::new();
        let result = ellipse_to_svg(&ellipse, &mut defs, 0);
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
            is_math: false,
        };
        let mut defs = DefsManager::new();
        let result = text_to_svg(&text, &mut defs, 0);
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
        let mut defs = DefsManager::new();
        let result = line_to_svg(&line, &mut defs, 0);
        assert!(result.contains("x1=\"0\""));
        assert!(result.contains("y1=\"0\""));
        assert!(result.contains("x2=\"100\""));
        assert!(result.contains("y2=\"100\""));
    }

    #[test]
    fn line_with_end_arrow_classic_emits_marker_end() {
        let line = LineElement {
            id: EdgeId::default(),
            from: Point { x: 0.0, y: 0.0 },
            to: Point { x: 100.0, y: 100.0 },
            style: ResolvedStyle {
                end_arrow: Some("classic".to_owned()),
                stroke_color: Some("#000000".to_owned()),
                ..Default::default()
            },
        };
        let mut defs = DefsManager::new();
        let result = line_to_svg(&line, &mut defs, 0);
        assert!(result.contains(r#"marker-end="url(#arrow-end-classic)""#));
    }

    #[test]
    fn line_with_end_arrow_none_emits_no_marker_end() {
        let line = LineElement {
            id: EdgeId::default(),
            from: Point { x: 0.0, y: 0.0 },
            to: Point { x: 100.0, y: 100.0 },
            style: ResolvedStyle {
                end_arrow: Some("none".to_owned()),
                stroke_color: Some("#000000".to_owned()),
                ..Default::default()
            },
        };
        let mut defs = DefsManager::new();
        let result = line_to_svg(&line, &mut defs, 0);
        assert!(!result.contains("marker-end"));
    }

    #[test]
    fn line_without_end_arrow_defaults_to_classic() {
        // When end_arrow is None, it should default to "classic" (draw.io default)
        let line = LineElement {
            id: EdgeId::default(),
            from: Point { x: 0.0, y: 0.0 },
            to: Point { x: 100.0, y: 100.0 },
            style: ResolvedStyle {
                stroke_color: Some("#000000".to_owned()),
                ..Default::default()
            },
        };
        let mut defs = DefsManager::new();
        let result = line_to_svg(&line, &mut defs, 0);
        assert!(result.contains(r#"marker-end="url(#arrow-end-classic)""#));
    }

    #[test]
    fn line_with_start_arrow_emits_marker_start() {
        let line = LineElement {
            id: EdgeId::default(),
            from: Point { x: 0.0, y: 0.0 },
            to: Point { x: 100.0, y: 100.0 },
            style: ResolvedStyle {
                start_arrow: Some("block".to_owned()),
                stroke_color: Some("#000000".to_owned()),
                ..Default::default()
            },
        };
        let mut defs = DefsManager::new();
        let result = line_to_svg(&line, &mut defs, 0);
        assert!(result.contains(r#"marker-start="url(#arrow-start-block)""#));
    }

    #[test]
    fn path_with_end_arrow_emits_marker_end() {
        use diagram_core::geometry::Point;
        let path = diagram_scene::PathElement {
            id: EdgeId::default(),
            points: vec![Point { x: 10.0, y: 10.0 }, Point { x: 50.0, y: 30.0 }],
            style: ResolvedStyle {
                end_arrow: Some("classic".to_owned()),
                stroke_color: Some("#000000".to_owned()),
                ..Default::default()
            },
        };
        let mut defs = DefsManager::new();
        let result = path_to_svg(&path, &mut defs, 0);
        assert!(result.contains(r#"marker-end="url(#arrow-end-classic)""#));
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
        let mut defs = DefsManager::new();
        let result = element_to_svg(&path, &mut clip, &mut defs, 0, None);
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
        let mut defs = DefsManager::new();
        let result = element_to_svg(&path, &mut clip, &mut defs, 0, None);
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
            header: None,
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&group, &mut clip, &mut defs, 0, None);
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
            header: None,
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&group, &mut clip, &mut defs, 0, None);
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
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
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
            header: None,
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&group, &mut clip, &mut defs, 0, None);
        assert!(result.contains("<g>"));
        assert!(result.contains("</g>"));
        assert!(result.contains("<rect"));
    }

    // ─── swimlane header rendering ──────────────────────────────────────────────

    #[test]
    fn group_with_horizontal_header_emits_left_strip() {
        // horizontal=true → header is a vertical strip on the left edge.
        // Pool at (100, 100, 700, 400) with horizontal=true, startSize=30.
        // Expected header rect: x=100, y=100, w=30, h=400.
        let pool_rect = VisualElement::Rect(RectElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 100.0, y: 100.0 },
                size: Size {
                    width: 700.0,
                    height: 400.0,
                },
            },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        });
        let header = SwimlaneHeader {
            bounds: Rect {
                origin: Point { x: 100.0, y: 100.0 },
                size: Size {
                    width: 30.0,
                    height: 400.0,
                },
            },
            horizontal: true,
        };
        let group = VisualElement::Group(diagram_scene::GroupElement {
            id: GroupId::default(),
            bounds: Rect {
                origin: Point { x: 100.0, y: 100.0 },
                size: Size {
                    width: 700.0,
                    height: 400.0,
                },
            },
            style: empty_style(),
            children: vec![pool_rect],
            clip: true,
            header: Some(header),
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&group, &mut clip, &mut defs, 0, None);

        // Header rect must be emitted with x=100, y=100, w=30, h=400
        assert!(
            result.contains(r#"<rect x="100" y="100" width="30" height="400""#),
            "horizontal header must emit a left-strip rect, got:\n{}",
            result
        );
    }

    #[test]
    fn group_with_vertical_header_emits_top_band() {
        // horizontal=false → header is a horizontal band at the top edge.
        // Pool at (50, 80, 600, 300) with horizontal=false, startSize=40.
        // Expected header rect: x=50, y=80, w=600, h=40.
        let child_rect = VisualElement::Rect(RectElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 100.0, y: 200.0 },
                size: Size {
                    width: 80.0,
                    height: 40.0,
                },
            },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        });
        let header = SwimlaneHeader {
            bounds: Rect {
                origin: Point { x: 50.0, y: 80.0 },
                size: Size {
                    width: 600.0,
                    height: 40.0,
                },
            },
            horizontal: false,
        };
        let group = VisualElement::Group(diagram_scene::GroupElement {
            id: GroupId::default(),
            bounds: Rect {
                origin: Point { x: 50.0, y: 80.0 },
                size: Size {
                    width: 600.0,
                    height: 300.0,
                },
            },
            style: empty_style(),
            children: vec![child_rect],
            clip: true,
            header: Some(header),
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&group, &mut clip, &mut defs, 0, None);

        // Header rect must be emitted with x=50, y=80, w=600, h=40
        assert!(
            result.contains(r#"<rect x="50" y="80" width="600" height="40""#),
            "vertical header must emit a top-band rect, got:\n{}",
            result
        );
        // The child's rect (100, 200, 80, 40) must still be emitted
        assert!(
            result.contains(r#"<rect x="100" y="200" width="80" height="40""#),
            "child rect must be emitted after header, got:\n{}",
            result
        );
    }

    #[test]
    fn group_without_header_does_not_emit_extra_rect() {
        // A group with header=None must NOT emit any rect for a header —
        // only its children are rendered.
        let child_rect = VisualElement::Rect(RectElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 20.0, y: 30.0 },
                size: Size {
                    width: 50.0,
                    height: 25.0,
                },
            },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
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
            header: None,
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&group, &mut clip, &mut defs, 0, None);

        // Only one rect (the child)
        let rect_count = result.matches("<rect").count();
        assert_eq!(
            rect_count, 1,
            "group without header must emit only the child rect, got {} rects in:\n{}",
            rect_count, result
        );
    }

    #[test]
    fn group_with_header_inherits_pool_style() {
        // The header rect must inherit the pool's fill/stroke colours
        // so the header visually matches the pool body (it's the "title strip").
        let pool_style = ResolvedStyle {
            fill_color: Some("#dae8fc".to_owned()),
            stroke_color: Some("#6c8ebf".to_owned()),
            opacity: Some(0.3),
            ..Default::default()
        };
        let header = SwimlaneHeader {
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 600.0,
                    height: 40.0,
                },
            },
            horizontal: false,
        };
        let group = VisualElement::Group(diagram_scene::GroupElement {
            id: GroupId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 600.0,
                    height: 300.0,
                },
            },
            style: pool_style.clone(),
            children: vec![],
            clip: false,
            header: Some(header),
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&group, &mut clip, &mut defs, 0, None);

        // The header rect must have fill=#dae8fc (inherited from pool)
        assert!(
            result.contains("fill=\"#dae8fc\""),
            "header must inherit pool fill colour, got:\n{}",
            result
        );
        // The header rect must have stroke=#6c8ebf (inherited from pool)
        assert!(
            result.contains("stroke=\"#6c8ebf\""),
            "header must inherit pool stroke colour, got:\n{}",
            result
        );
        // The header rect must have opacity=0.3 (inherited from pool)
        assert!(
            result.contains("opacity=\"0.3\""),
            "header must inherit pool opacity, got:\n{}",
            result
        );
    }

    // ─── new shape SVG rendering tests ────────────────────────────────────────

    #[test]
    fn diamond_emits_polygon() {
        let diamond = VisualElement::Diamond(diagram_scene::DiamondElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 100.0,
                    height: 80.0,
                },
            },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&diamond, &mut clip, &mut defs, 0, None);
        assert!(result.contains("<polygon"));
        assert!(result.contains("points="));
        // Diamond points should include center-top, right, center-bottom, left
        assert!(result.contains("50,0")); // top
        assert!(result.contains("100,40")); // right
        assert!(result.contains("50,80")); // bottom
        assert!(result.contains("0,40")); // left
    }

    #[test]
    fn triangle_emits_polygon() {
        let triangle = VisualElement::Triangle(diagram_scene::TriangleElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 100.0,
                    height: 80.0,
                },
            },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&triangle, &mut clip, &mut defs, 0, None);
        assert!(result.contains("<polygon"));
        // Triangle: top-center, bottom-right, bottom-left
        assert!(result.contains("50,0")); // top-center
        assert!(result.contains("100,80")); // bottom-right
        assert!(result.contains("0,80")); // bottom-left
    }

    #[test]
    fn hexagon_emits_polygon() {
        let hexagon = VisualElement::Hexagon(diagram_scene::HexagonElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 100.0,
                    height: 80.0,
                },
            },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&hexagon, &mut clip, &mut defs, 0, None);
        assert!(result.contains("<polygon"));
        assert!(result.contains("points="));
    }

    #[test]
    fn cylinder_emits_path() {
        let cylinder = VisualElement::Cylinder(diagram_scene::CylinderElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 60.0,
                    height: 100.0,
                },
            },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&cylinder, &mut clip, &mut defs, 0, None);
        assert!(result.contains("<path"));
        assert!(result.contains("d="));
    }

    #[test]
    fn cloud_emits_path() {
        let cloud = VisualElement::Cloud(diagram_scene::CloudElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 120.0,
                    height: 80.0,
                },
            },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&cloud, &mut clip, &mut defs, 0, None);
        assert!(result.contains("<path"));
        assert!(result.contains("d="));
    }

    #[test]
    fn parallelogram_emits_polygon() {
        let para = VisualElement::Parallelogram(diagram_scene::ParallelogramElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 100.0,
                    height: 60.0,
                },
            },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&para, &mut clip, &mut defs, 0, None);
        assert!(result.contains("<polygon"));
        assert!(result.contains("points="));
    }

    #[test]
    fn trapezoid_emits_polygon() {
        let trap = VisualElement::Trapezoid(diagram_scene::TrapezoidElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 100.0,
                    height: 60.0,
                },
            },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&trap, &mut clip, &mut defs, 0, None);
        assert!(result.contains("<polygon"));
        assert!(result.contains("points="));
    }

    #[test]
    fn polygon_emits_polygon_with_points() {
        use diagram_core::geometry::Point;
        let polygon = VisualElement::Polygon(diagram_scene::PolygonElement {
            id: VertexId::default(),
            points: vec![
                Point { x: 10.0, y: 10.0 },
                Point { x: 50.0, y: 10.0 },
                Point { x: 50.0, y: 50.0 },
                Point { x: 10.0, y: 50.0 },
            ],
            bounds: Rect {
                origin: Point { x: 10.0, y: 10.0 },
                size: Size {
                    width: 40.0,
                    height: 40.0,
                },
            },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&polygon, &mut clip, &mut defs, 0, None);
        assert!(result.contains("<polygon"));
        assert!(result.contains("10,10"));
        assert!(result.contains("50,10"));
        assert!(result.contains("50,50"));
        assert!(result.contains("10,50"));
    }

    #[test]
    fn polygon_empty_points_emits_empty_polygon() {
        let polygon = VisualElement::Polygon(diagram_scene::PolygonElement {
            id: VertexId::default(),
            points: vec![],
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 0.0,
                    height: 0.0,
                },
            },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&polygon, &mut clip, &mut defs, 0, None);
        assert!(result.contains("<polygon"));
        assert!(result.contains("points="));
    }

    #[test]
    fn stencil_emits_path_for_background_and_foreground() {
        use diagram_core::geometry::Point;
        use diagram_scene::{PathCommand, StencilAspect};

        let stencil = VisualElement::Stencil(diagram_scene::StencilElement {
            id: VertexId::default(),
            library: "general".into(),
            name: "Rectangle".into(),
            bounds: Rect {
                origin: Point { x: 10.0, y: 20.0 },
                size: Size {
                    width: 80.0,
                    height: 40.0,
                },
            },
            aspect: StencilAspect::Variable,
            background: vec![PathCommand::Move { x: 0.0, y: 0.0 }],
            foreground: vec![PathCommand::FillStroke],
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&stencil, &mut clip, &mut defs, 0, None);
        // Background path has scaled coordinates (0 * 80 = 0, 0 * 40 = 0)
        assert!(
            result.contains("M 0 0"),
            "background path should scale to bounds"
        );
        assert!(result.contains("<path"));
    }

    #[test]
    fn new_shapes_have_default_fill_and_stroke() {
        // All new shapes should get default fill and stroke via shape_style_defaults
        use diagram_core::geometry::Point;

        let diamond = VisualElement::Diamond(diagram_scene::DiamondElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 100.0,
                    height: 80.0,
                },
            },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: empty_style(),
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&diamond, &mut clip, &mut defs, 0, None);
        // Should have default fill #dae8fc and stroke #6c8ebf
        assert!(result.contains("fill=\"#dae8fc\""));
        assert!(result.contains("stroke=\"#6c8ebf\""));
    }

    // ─── curved edge tests ───────────────────────────────────────────────────

    #[test]
    fn path_curved_with_3_plus_points_emits_c_commands() {
        use diagram_core::geometry::Point;
        let path = VisualElement::Path(diagram_scene::PathElement {
            id: EdgeId::default(),
            points: vec![
                Point { x: 10.0, y: 10.0 },
                Point { x: 50.0, y: 30.0 },
                Point { x: 90.0, y: 10.0 },
            ],
            style: ResolvedStyle {
                curved: Some(true),
                ..Default::default()
            },
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&path, &mut clip, &mut defs, 0, None);
        // Should contain C (cubic Bezier) commands
        assert!(
            result.contains('C'),
            "curved path with 3+ points should contain C commands"
        );
        assert!(result.contains("M 10 10"));
    }

    #[test]
    fn path_not_curved_emits_l_commands() {
        use diagram_core::geometry::Point;
        let path = VisualElement::Path(diagram_scene::PathElement {
            id: EdgeId::default(),
            points: vec![
                Point { x: 10.0, y: 10.0 },
                Point { x: 50.0, y: 30.0 },
                Point { x: 90.0, y: 10.0 },
            ],
            style: ResolvedStyle {
                curved: Some(false),
                ..Default::default()
            },
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&path, &mut clip, &mut defs, 0, None);
        // Should contain L commands, not C commands
        assert!(result.contains(" L "));
        assert!(!result.contains(" C "));
    }

    #[test]
    fn path_curved_with_2_points_emits_l_commands() {
        // A path with 2 points can't be curved - should fall back to L
        use diagram_core::geometry::Point;
        let path = VisualElement::Path(diagram_scene::PathElement {
            id: EdgeId::default(),
            points: vec![Point { x: 10.0, y: 10.0 }, Point { x: 50.0, y: 30.0 }],
            style: ResolvedStyle {
                curved: Some(true),
                ..Default::default()
            },
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&path, &mut clip, &mut defs, 0, None);
        // Should use L commands since only 2 points
        assert!(result.contains(" L "));
        assert!(!result.contains(" C "));
    }

    #[test]
    fn path_curved_with_default_curved_emits_l_commands() {
        // When curved is None (default), should use L commands
        use diagram_core::geometry::Point;
        let path = VisualElement::Path(diagram_scene::PathElement {
            id: EdgeId::default(),
            points: vec![
                Point { x: 10.0, y: 10.0 },
                Point { x: 50.0, y: 30.0 },
                Point { x: 90.0, y: 10.0 },
            ],
            style: empty_style(), // curved is None by default
        });
        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = element_to_svg(&path, &mut clip, &mut defs, 0, None);
        assert!(result.contains(" L "));
        assert!(!result.contains(" C "));
    }
}

#[cfg(test)]
mod gid_attr_tests {
    use super::*;
    use diagram_core::StableIdExt;

    #[test]
    fn gid_attr_returns_empty_for_null_group_id() {
        // GroupId::default() is the slotmap null key (idx=u32::MAX, version=1)
        // which should NOT emit data-group-id.
        // We verify gid_attr returns empty string for null key.
        let null_gid = diagram_core::GroupId::default();
        let (idx, version) = null_gid.stable_id_parts();
        assert_eq!(idx, u32::MAX, "null key should have idx=u32::MAX");
        assert_eq!(version, 1, "null key should have version=1");

        // gid_attr should return empty for null key
        let result = gid_attr(&null_gid);
        assert!(
            result.is_empty(),
            "gid_attr should return empty for null key"
        );
    }

    #[test]
    fn group_to_svg_with_valid_id_emits_data_group_id() {
        use diagram_core::geometry::{Point, Rect, Size};
        use diagram_scene::ResolvedStyle;
        use slotmap::SlotMap;

        // Create a real GroupId by inserting into a slotmap
        let mut sm: SlotMap<diagram_core::GroupId, ()> = SlotMap::with_key();
        let real_gid = sm.insert(());

        // Verify it's NOT the null key
        let (idx, _version) = real_gid.stable_id_parts();
        assert_ne!(idx, u32::MAX, "real GroupId should not be null key");

        // Build a minimal GroupElement with the real GroupId
        let group_elem = GroupElement {
            id: real_gid,
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 100.0,
                    height: 100.0,
                },
            },
            style: ResolvedStyle::default(),
            children: vec![],
            clip: false,
            header: None,
        };

        let mut clip = ClipPathManager::new();
        let mut defs = DefsManager::new();
        let result = group_to_svg(&group_elem, &mut clip, &mut defs, 0, None);

        // Assert the output contains data-group-id="idx:version"
        let expected_attr = format!("data-group-id=\"{}\"", stable_id(&real_gid));
        assert!(
            result.contains(&expected_attr),
            "group_to_svg should emit data-group-id attribute, got:\n{}",
            result
        );
        assert!(
            result.contains("<g"),
            "group_to_svg should emit a <g> element, got:\n{}",
            result
        );
    }
}
