//! Scene and page scene types.
//!
//! `Scene` and `PageScene` are implemented in PR2. This stub exists to keep
//! the workspace compiling during the skeleton PR.

use serde::{Deserialize, Serialize};

/// The top-level scene output, containing all pages.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Scene {
    /// The pages in this scene.
    pub pages: Vec<PageScene>,
}

/// A single page's projected scene.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageScene {
    /// The page's stable identifier.
    pub page_id: diagram_core::PageId,
    /// The page name (empty string when `Page.name` is `None`).
    pub name: String,
    /// The page width in page coordinates.
    pub width: f64,
    /// The page height in page coordinates.
    pub height: f64,
    /// The display list — back-to-front ordered VisualElements.
    pub display_list: Vec<super::VisualElement>,
    /// The page background color. `None` means white.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
    /// Whether math typesetting is enabled for this page.
    /// When `true`, label text may contain raw LaTeX and the SVG renderer
    /// emits `data-math-id` and `data-latex` attributes on the `<text>` element.
    #[serde(default)]
    pub math_enabled: bool,
}
