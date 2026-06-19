//! SVG renderer implementation.

use diagram_scene::{PageId, PageScene, Scene};

use crate::clip::ClipPathManager;
use crate::element::element_to_svg;
use crate::error::RenderError;
use crate::escape::escape_text;

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

        // Open svg tag with viewBox
        output.push_str(&format!(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {} {}\">\n",
            page.width, page.height
        ));

        // Title
        output.push_str(&format!("<title>{}</title>\n", escape_text(&page.name)));

        // White background rect as first drawn child
        output.push_str(&format!(
            "<rect x=\"0\" y=\"0\" width=\"{}\" height=\"{}\" fill=\"white\"/>\n",
            page.width, page.height
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
