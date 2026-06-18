//! Error types for SVG rendering.

use diagram_scene::PageId;
use std::fmt;

/// Errors that can occur during SVG rendering.
#[non_exhaustive]
#[derive(Debug)]
pub enum RenderError {
    /// The requested page was not found in the scene.
    PageNotFound {
        /// The page ID that was not found.
        page_id: PageId,
    },
}

impl fmt::Display for RenderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RenderError::PageNotFound { page_id } => {
                write!(f, "page not found: {page_id:?}")
            }
        }
    }
}

impl std::error::Error for RenderError {}
