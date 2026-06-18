//! Vertex payload for the diagram engine.
//!
//! A vertex is a named, positionable diagram node. It may carry a label,
//! reference a style, and optionally belong to a group.
//!
//! See ADR-0020 (core model starts with pages/groups/styles/labels) and
//! ADR-0023 (engine-owned stable IDs).

use crate::geometry::CellGeometry;
use crate::id::{GroupId, PageId, StyleId};
use crate::label::Label;
use serde::{Deserialize, Serialize};

/// A vertex cell within a diagram.
///
/// Vertices are the atomic positionable elements — rectangles, ellipses,
/// text blocks, and other draw.io vertex types map to this type.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Vertex {
    /// The 2D geometry of the vertex (position and size).
    pub geometry: Option<CellGeometry>,
    /// The label text displayed on the vertex.
    pub label: Option<Label>,
    /// The style ID referencing shared style metadata.
    pub style_id: Option<StyleId>,
    /// The parent group this vertex belongs to, if any.
    pub parent: Option<GroupId>,
    /// The page this vertex belongs to, if any.
    pub page_id: Option<PageId>,
}
