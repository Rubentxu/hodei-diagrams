//! SVG renderer implementation.

use diagram_scene::{PageId, PageScene, Scene};

use crate::clip::ClipPathManager;
use crate::element::element_to_svg;
use crate::error::RenderError;
use crate::escape::escape_text;
use diagram_core::geometry::{Point, Rect, Size};
use diagram_scene::{
    EllipseElement, GroupElement, LineElement, PathElement, RectElement, RoundedRectElement,
    TextElement, VisualElement,
};

/// Stateless SVG renderer.
pub struct SvgRenderer;

impl SvgRenderer {
    /// Create a new `SvgRenderer`.
    pub fn new() -> Self {
        Self
    }

    /// Render a single page to an SVG string.
    pub fn render(&self, scene: &Scene, page_id: PageId) -> Result<String, RenderError> {
        let page = scene
            .pages
            .iter()
            .find(|p| p.page_id == page_id)
            .ok_or(RenderError::PageNotFound { page_id })?;
        Ok(self.render_page(page))
    }

    /// Render all pages to a vector of (PageId, SVG string) pairs.
    ///
    /// Each page produces an independent, self-contained SVG document.
    /// Pages are rendered in [`Scene::pages`] iteration order.
    /// Clip-path counters reset per page.
    pub fn render_pages(&self, scene: &Scene) -> Result<Vec<(PageId, String)>, RenderError> {
        Ok(scene
            .pages
            .iter()
            .map(|page| {
                let svg = self.render_page(page);
                (page.page_id, svg)
            })
            .collect())
    }

    fn render_page(&self, page: &PageScene) -> String {
        let mut clip = ClipPathManager::new();
        let mut output = String::new();

        let (view_x, view_y, view_w, view_h) = effective_view_box(page);

        // Open svg tag with viewBox
        output.push_str(&format!(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"{} {} {} {}\">\n",
            view_x, view_y, view_w, view_h
        ));

        // Title
        output.push_str(&format!("<title>{}</title>\n", escape_text(&page.name)));

        // White background rect as first drawn child
        output.push_str(&format!(
            "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" fill=\"white\"/>\n",
            view_x, view_y, view_w, view_h
        ));

        // Walk display list
        for elem in &page.display_list {
            output.push_str(&element_to_svg(elem, &mut clip, 1));
            output.push('\n');
        }

        // Emit defs block if there are clip paths
        let defs = clip.render_defs(1);
        if !defs.is_empty() {
            output.push_str(&defs);
            output.push('\n');
        }

        // Close svg
        output.push_str("</svg>");

        output
    }
}

/// Derive a sensible viewBox for the page.
///
/// draw.io-style .drawio files often leave the page size at the default 1×1.
/// In that case we derive the viewBox from the content bounds so that the
/// rendered shapes appear at a readable scale instead of being blown up to
/// the pixel size of the container.
fn effective_view_box(page: &PageScene) -> (f64, f64, f64, f64) {
    if page.width > 1.0 || page.height > 1.0 {
        return (0.0, 0.0, page.width.max(1.0), page.height.max(1.0));
    }

    content_bounds(&page.display_list)
        .map(|bounds| {
            let width = bounds.size.width.max(1.0);
            let height = bounds.size.height.max(1.0);
            (bounds.origin.x, bounds.origin.y, width, height)
        })
        .unwrap_or((0.0, 0.0, 1.0, 1.0))
}

fn content_bounds(display_list: &[VisualElement]) -> Option<Rect> {
    let mut acc: Option<Rect> = None;
    for elem in display_list {
        if let Some(rect) = element_bounds(elem) {
            acc = Some(match acc {
                None => rect,
                Some(existing) => union_rect(existing, rect),
            });
        }
    }
    acc
}

fn element_bounds(elem: &VisualElement) -> Option<Rect> {
    match elem {
        VisualElement::Rect(RectElement { bounds, .. }) => Some(*bounds),
        VisualElement::RoundedRect(RoundedRectElement { bounds, .. }) => Some(*bounds),
        VisualElement::Ellipse(EllipseElement { bounds, .. }) => Some(*bounds),
        VisualElement::Text(TextElement { anchor, .. }) => Some(Rect {
            origin: *anchor,
            size: Size {
                width: 1.0,
                height: 1.0,
            },
        }),
        VisualElement::Line(LineElement { from, to, .. }) => Some(rect_from_points(&[*from, *to])),
        VisualElement::Path(PathElement { points, .. }) => {
            if points.is_empty() {
                None
            } else {
                Some(rect_from_points(points))
            }
        }
        VisualElement::Group(GroupElement {
            bounds, children, ..
        }) => {
            let child_bounds = content_bounds(children);
            Some(
                child_bounds
                    .map(|c| union_rect(*bounds, c))
                    .unwrap_or(*bounds),
            )
        }
        _ => None,
    }
}

fn rect_from_points(points: &[Point]) -> Rect {
    let min_x = points.iter().map(|p| p.x).fold(f64::INFINITY, f64::min);
    let min_y = points.iter().map(|p| p.y).fold(f64::INFINITY, f64::min);
    let max_x = points.iter().map(|p| p.x).fold(f64::NEG_INFINITY, f64::max);
    let max_y = points.iter().map(|p| p.y).fold(f64::NEG_INFINITY, f64::max);
    Rect {
        origin: Point { x: min_x, y: min_y },
        size: Size {
            width: (max_x - min_x).max(0.0),
            height: (max_y - min_y).max(0.0),
        },
    }
}

fn union_rect(a: Rect, b: Rect) -> Rect {
    let min_x = a.origin.x.min(b.origin.x);
    let min_y = a.origin.y.min(b.origin.y);
    let max_x = (a.origin.x + a.size.width).max(b.origin.x + b.size.width);
    let max_y = (a.origin.y + a.size.height).max(b.origin.y + b.size.height);
    Rect {
        origin: Point { x: min_x, y: min_y },
        size: Size {
            width: max_x - min_x,
            height: max_y - min_y,
        },
    }
}

impl Default for SvgRenderer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::VertexId;
    use diagram_core::geometry::{Point, Rect, Size};
    use diagram_scene::{RectElement, ResolvedStyle, VisualElement};

    #[test]
    fn render_unknown_page_returns_error() {
        let scene = Scene::default();
        let renderer = SvgRenderer::new();
        let result = renderer.render(&scene, PageId::default());
        assert!(matches!(result, Err(RenderError::PageNotFound { .. })));
    }

    #[test]
    fn render_page_emits_svg_tag() {
        let page = PageScene {
            page_id: PageId::default(),
            name: "Test".to_owned(),
            width: 100.0,
            height: 100.0,
            display_list: vec![],
        };
        let scene = Scene { pages: vec![page] };
        let renderer = SvgRenderer::new();
        let result = renderer.render(&scene, PageId::default()).unwrap();
        assert!(
            result
                .starts_with("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\">")
        );
        assert!(result.ends_with("</svg>"));
    }

    #[test]
    fn render_page_emits_title() {
        let page = PageScene {
            page_id: PageId::default(),
            name: "Page-1".to_owned(),
            width: 200.0,
            height: 300.0,
            display_list: vec![],
        };
        let scene = Scene { pages: vec![page] };
        let renderer = SvgRenderer::new();
        let result = renderer.render(&scene, PageId::default()).unwrap();
        assert!(result.contains("<title>Page-1</title>"));
    }

    #[test]
    fn render_page_emits_white_background() {
        let page = PageScene {
            page_id: PageId::default(),
            name: "".to_owned(),
            width: 800.0,
            height: 600.0,
            display_list: vec![],
        };
        let scene = Scene { pages: vec![page] };
        let renderer = SvgRenderer::new();
        let result = renderer.render(&scene, PageId::default()).unwrap();
        assert!(
            result.contains("<rect x=\"0\" y=\"0\" width=\"800\" height=\"600\" fill=\"white\"/>")
        );
    }

    #[test]
    fn render_page_with_rect() {
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
                ..Default::default()
            },
        });
        let page = PageScene {
            page_id: PageId::default(),
            name: "Test".to_owned(),
            width: 100.0,
            height: 100.0,
            display_list: vec![rect],
        };
        let scene = Scene { pages: vec![page] };
        let renderer = SvgRenderer::new();
        let result = renderer.render(&scene, PageId::default()).unwrap();
        assert!(result.contains("<rect x=\"10\" y=\"20\" width=\"80\" height=\"40\""));
        assert!(result.contains("fill=\"#dae8fc\""));
        assert!(result.contains("stroke=\"#6c8ebf\""));
    }

    #[test]
    fn render_page_contains_data_vertex_id() {
        let rect = VisualElement::Rect(RectElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 100.0,
                    height: 100.0,
                },
            },
            style: ResolvedStyle::default(),
        });
        let page = PageScene {
            page_id: PageId::default(),
            name: "Test".to_owned(),
            width: 100.0,
            height: 100.0,
            display_list: vec![rect],
        };
        let scene = Scene { pages: vec![page] };
        let renderer = SvgRenderer::new();
        let result = renderer.render(&scene, PageId::default()).unwrap();
        assert!(
            result.contains("data-vertex-id=\""),
            "SVG should contain data-vertex-id attribute: {result}"
        );
        assert!(!result.contains("vertex#"));
        assert!(!result.contains("edge#"));
        assert!(!result.contains("group#"));
    }
}
