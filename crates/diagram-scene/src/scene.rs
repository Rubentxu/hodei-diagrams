//! Scene and page scene types.
//!
//! `Scene` and `PageScene` are implemented in PR2. This stub exists to keep
//! the workspace compiling during the skeleton PR.

/// The top-level scene output, containing all pages.
#[derive(Debug, Clone, Default)]
pub struct Scene {
    /// The pages in this scene.
    pub pages: Vec<PageScene>,
}

/// A single page's projected scene.
#[derive(Debug, Clone)]
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
}
