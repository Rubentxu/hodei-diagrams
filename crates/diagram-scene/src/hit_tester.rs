//! Hit-testing implementation for Scene.
//!
//! Implements the `HitTester` trait from `diagram-core` for the `Scene` type,
//! enabling geometric hit-testing against the scene's display list.

use diagram_core::geometry::Rect;
use diagram_core::selection::{HitResult, HitTester};

use crate::{PageScene, Scene, VisualElement};

impl HitTester for Scene {
    fn hit_test(&self, x: f64, y: f64) -> Vec<HitResult> {
        let mut results = Vec::new();
        for page in &self.pages {
            Self::collect_hits_at_point_page(page, x, y, &mut results);
        }
        // display_list is back-to-front; iterating forward collects from bottom to top.
        // We collected bottom-to-top (back-to-front), so reverse for top-most first.
        results.reverse();
        results
    }
}

impl Scene {
    fn collect_hits_at_point_page(page: &PageScene, x: f64, y: f64, results: &mut Vec<HitResult>) {
        // display_list is back-to-front ordered (ADR-0036)
        // index 0 = back-most (bottom), last index = front-most (top)
        // Iterate forward to collect from bottom to top
        for elem in &page.display_list {
            Self::collect_hits_at_point_elem(elem, x, y, results);
        }
    }

    fn collect_hits_at_point_elem(
        elem: &VisualElement,
        x: f64,
        y: f64,
        results: &mut Vec<HitResult>,
    ) {
        if let Some(bounds) = elem.bounds() {
            if Self::rect_contains_point(&bounds, x, y) {
                if let Some(id) = elem.selection_id() {
                    results.push(id);
                }
                // Recurse into group children
                if let VisualElement::Group(g) = elem {
                    for child in &g.children {
                        Self::collect_hits_at_point_elem(child, x, y, results);
                    }
                }
            }
        }
    }

    /// Simple AABB point-in-rectangle check.
    /// TODO: Replace with proper geometric containment (accounts for rotation, shape type)
    fn rect_contains_point(rect: &Rect, x: f64, y: f64) -> bool {
        x >= rect.origin.x
            && x <= rect.origin.x + rect.size.width
            && y >= rect.origin.y
            && y <= rect.origin.y + rect.size.height
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ResolvedStyle;
    use diagram_core::geometry::{Point, Size};
    use diagram_core::id::VertexId;

    fn make_scene_with_rect(x: f64, y: f64, w: f64, h: f64) -> Scene {
        let vid = VertexId::default();
        let rect = Rect {
            origin: Point { x, y },
            size: Size {
                width: w,
                height: h,
            },
        };
        let elem = VisualElement::Rect(crate::RectElement {
            id: vid,
            bounds: rect,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: ResolvedStyle::default(),
        });
        let page = PageScene {
            page_id: diagram_core::PageId::default(),
            name: String::new(),
            width: 800.0,
            height: 600.0,
            display_list: vec![elem],
            background: None,
            math_enabled: false,
        };
        Scene { pages: vec![page] }
    }

    #[test]
    fn hit_test_returns_vertex_when_point_inside() {
        let scene = make_scene_with_rect(10.0, 10.0, 100.0, 50.0);
        let hits = scene.hit_test(50.0, 30.0);
        assert_eq!(hits.len(), 1);
        assert!(matches!(hits[0], HitResult::Vertex(_)));
    }

    #[test]
    fn hit_test_returns_empty_when_point_outside() {
        let scene = make_scene_with_rect(10.0, 10.0, 100.0, 50.0);
        let hits = scene.hit_test(200.0, 200.0);
        assert!(hits.is_empty());
    }

    #[test]
    fn hit_test_on_boundary_is_inside() {
        let scene = make_scene_with_rect(10.0, 10.0, 100.0, 50.0);
        // Point exactly on the right edge
        let hits = scene.hit_test(110.0, 30.0);
        assert_eq!(hits.len(), 1);
    }
}
