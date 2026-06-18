//! Group payload for the diagram engine.
//!
//! A group is a container cell that may hold child vertices and edges.
//! Children reference the group via their own `parent: Option<GroupId>` field,
//! matching draw.io's `parent` semantics.

use crate::geometry::CellGeometry;
use crate::id::{PageId, StyleId};
use crate::label::Label;
use serde::{Deserialize, Serialize};

/// A group (container) cell within a diagram.
///
/// Groups are non-vertex, non-edge cells that serve as layout containers.
/// Children reference a group via their own `parent` field, not by storing
/// child IDs within the group itself.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Group {
    /// The 2D geometry of the group (position and size).
    pub geometry: Option<CellGeometry>,
    /// The label text displayed on the group.
    pub label: Option<Label>,
    /// The style ID referencing shared style metadata.
    pub style_id: Option<StyleId>,
    /// The page this group belongs to, if any.
    pub page_id: Option<PageId>,
}
