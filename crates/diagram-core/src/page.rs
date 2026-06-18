//! Pages: top-level containers inside a [`crate::DiagramModel`].
//!
//! A page is the unit of editing and rendering. In `.drawio` terms it
//! corresponds to a `<diagram>` element inside `<mxfile>`. This module only
//! declares the data shape — actual ownership of vertices/edges lives in
//! [`crate::store::ModelStore`].

use crate::geometry::Size;
use crate::id::PageId;
use crate::label::Label;

/// A page inside a diagram model.
#[derive(Debug, Clone)]
pub struct Page {
    /// Engine-owned identifier for this page.
    pub id: PageId,
    /// Optional user-facing name (typically the tab label).
    pub name: Option<Label>,
    /// Canvas / page size in user-space units.
    pub size: Size,
}

impl Page {
    /// Create a page with the given engine ID and a default 1×1 canvas.
    pub fn new(id: PageId) -> Self {
        Self {
            id,
            name: None,
            size: Size {
                width: 1.0,
                height: 1.0,
            },
        }
    }
}
