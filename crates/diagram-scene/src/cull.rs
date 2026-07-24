//! Viewport culling for display list elements.
//!
//! Filters display list elements based on their AABB intersection with the
//! viewport rect, enabling render of only visible content.

use crate::element::VisualElement;
use diagram_core::geometry::Rect;

/// Default margin in user-space units (50px heuristic).
pub const DEFAULT_MARGIN: f64 = 50.0;

/// Returns true if `elem` should be rendered given `viewport`.
/// - bounds() == None → true (conservative, REQ-CULL-002)
/// - bounds().intersects(viewport) → true
/// - otherwise → false
pub fn should_include(elem: &VisualElement, viewport: &Rect) -> bool {
    match elem.bounds() {
        None => true,
        Some(b) => b.intersects(viewport),
    }
}

/// Top-level filter. Returns references (no clone).
/// For unit testing and potential future spatial-index integration.
/// Does NOT recursively filter group children — that happens in the renderer.
pub fn cull_display_list<'a>(
    display_list: &'a [VisualElement],
    viewport: &Rect,
    margin: f64,
) -> Vec<&'a VisualElement> {
    let expanded = viewport.inflate(margin);
    display_list
        .iter()
        .filter(|e| should_include(e, &expanded))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ResolvedStyle;
    use crate::element::{EntityId, GroupElement, LineElement, PathElement, RectElement};
    use diagram_core::geometry::{Point, Size};
    use diagram_core::{EdgeId, GroupId, VertexId};

    fn make_rect(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect {
            origin: Point { x, y },
            size: Size {
                width: w,
                height: h,
            },
        }
    }

    fn make_rect_elem(x: f64, y: f64, w: f64, h: f64) -> VisualElement {
        VisualElement::Rect(RectElement {
            id: VertexId::default(),
            bounds: make_rect(x, y, w, h),
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: ResolvedStyle::default(),
        })
    }

    // === should_include tests ===

    #[test]
    fn offscreen_excluded() {
        let viewport = make_rect(0.0, 0.0, 100.0, 100.0);
        let elem = make_rect_elem(500.0, 500.0, 50.0, 50.0);
        assert!(!should_include(&elem, &viewport));
    }

    #[test]
    fn partial_overlap_included() {
        let viewport = make_rect(0.0, 0.0, 100.0, 100.0);
        let elem = make_rect_elem(80.0, 80.0, 50.0, 50.0); // extends beyond viewport
        assert!(should_include(&elem, &viewport));
    }

    #[test]
    fn edge_crossing_included() {
        // A line from (1000,1000) to (2000,2000) with viewport (1200,1200,400,400)
        // The AABB of the line is (1000,1000)-(2000,2000) which intersects the viewport
        let viewport = make_rect(1200.0, 1200.0, 400.0, 400.0);
        let elem = VisualElement::Line(LineElement {
            id: EdgeId::default(),
            from: Point {
                x: 1000.0,
                y: 1000.0,
            },
            to: Point {
                x: 2000.0,
                y: 2000.0,
            },
            style: ResolvedStyle::default(),
        });
        assert!(should_include(&elem, &viewport));
    }

    // REQ-CULL-002: Missing or degenerate bounds — conservative inclusion
    #[test]
    fn none_bounds_conservative_path() {
        // PathElement with empty points has bounds() == None
        // should_include should return true (conservative inclusion)
        let viewport = make_rect(0.0, 0.0, 10.0, 10.0);
        let elem = VisualElement::Path(PathElement {
            id: EdgeId::default(),
            points: vec![], // empty path → bounds() returns None
            style: ResolvedStyle::default(),
        });
        // Should not panic and should return true (conservative)
        assert!(should_include(&elem, &viewport));
    }

    #[test]
    fn degenerate_1x1_at_edge_included() {
        // Text elements return degenerate 1x1 box at anchor
        // A 1x1 box at (150, 150) with viewport (0,0,100,100) is outside
        let viewport = make_rect(0.0, 0.0, 100.0, 100.0);
        let elem = VisualElement::Text(crate::element::TextElement {
            owner: EntityId::Vertex(VertexId::default()),
            anchor: Point { x: 150.0, y: 150.0 },
            text: "Label".to_owned(),
            style: ResolvedStyle::default(),
            is_math: false,
        });
        // 1x1 box at (150,150) is outside viewport (0,0,100,100)
        assert!(!should_include(&elem, &viewport));
    }

    #[test]
    fn degenerate_1x1_intersecting_included() {
        // Text element at (50, 50) — 1x1 box intersects viewport (0,0,100,100)
        let viewport = make_rect(0.0, 0.0, 100.0, 100.0);
        let elem = VisualElement::Text(crate::element::TextElement {
            owner: EntityId::Vertex(VertexId::default()),
            anchor: Point { x: 50.0, y: 50.0 },
            text: "Label".to_owned(),
            style: ResolvedStyle::default(),
            is_math: false,
        });
        // 1x1 box at (50,50) to (51,51) intersects viewport
        assert!(should_include(&elem, &viewport));
    }

    #[test]
    fn margin_inflation() {
        // Shape outside viewport and outside margin
        let viewport = make_rect(0.0, 0.0, 100.0, 100.0);
        let elem = make_rect_elem(200.0, 200.0, 10.0, 10.0); // 100px outside diagonally
        let expanded = viewport.inflate(DEFAULT_MARGIN); // +50 margin → (-50,-50) to (150,150)
        // (200,200) is way outside the 200x200 expanded viewport
        assert!(!should_include(&elem, &expanded));

        // Shape just inside margin
        let elem2 = make_rect_elem(145.0, 145.0, 5.0, 5.0); // just inside expanded bounds
        assert!(should_include(&elem2, &expanded));
    }

    #[test]
    fn group_recursion() {
        // Group outer bounds do NOT intersect viewport (children are at 500+)
        let viewport = make_rect(0.0, 0.0, 100.0, 100.0);
        let child = make_rect_elem(500.0, 500.0, 50.0, 50.0);
        let group = VisualElement::Group(GroupElement {
            id: GroupId::default(),
            bounds: make_rect(500.0, 500.0, 50.0, 50.0), // bounds = child bounds
            style: ResolvedStyle::default(),
            children: vec![child],
            clip: false,
            header: None,
        });
        // Group bounds = (500,500)-(550,550) which doesn't intersect viewport
        assert!(!should_include(&group, &viewport));
    }

    // === cull_display_list tests ===

    #[test]
    fn cull_list_excludes_offscreen() {
        let viewport = make_rect(0.0, 0.0, 100.0, 100.0);
        let elems = vec![
            make_rect_elem(10.0, 10.0, 20.0, 20.0),   // inside
            make_rect_elem(500.0, 500.0, 50.0, 50.0), // outside
        ];
        let culled = cull_display_list(&elems, &viewport, DEFAULT_MARGIN);
        assert_eq!(culled.len(), 1);
        assert_eq!(
            culled[0].bounds().map(|b| (b.origin.x, b.origin.y)),
            Some((10.0, 10.0))
        );
    }

    // REQ-CULL-005: Zero margin — element clearly outside viewport is excluded
    #[test]
    fn zero_margin_excludes_offscreen() {
        let viewport = make_rect(0.0, 0.0, 100.0, 100.0);
        let elems = vec![
            make_rect_elem(10.0, 10.0, 20.0, 20.0),   // inside
            make_rect_elem(200.0, 200.0, 50.0, 50.0), // outside (way outside)
        ];
        // margin = 0.0 means no inflation
        let culled = cull_display_list(&elems, &viewport, 0.0);
        assert_eq!(culled.len(), 1);
        assert_eq!(
            culled[0].bounds().map(|b| (b.origin.x, b.origin.y)),
            Some((10.0, 10.0))
        );
    }
}
