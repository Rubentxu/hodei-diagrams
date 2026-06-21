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
///
/// See ADR-0058 §Decision (data shape).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
    /// Z-order for layering: higher values render on top. Ties are broken
    /// by engine ID (higher ID on top). Default is 0.
    /// See ADR-0058 §Z-order semantics.
    pub z_order: i32,
    /// Whether the vertex is locked. The engine stores this flag but does NOT
    /// enforce it — the editor layer is responsible for preventing mutations
    /// on locked shapes. Default is false.
    /// See ADR-0058 §Lock and visibility.
    pub locked: bool,
    /// Whether the vertex is visible. Invisible shapes are excluded from the
    /// scene display list but remain addressable in the model. Default is true.
    /// See ADR-0058 §Lock and visibility.
    pub visible: bool,
}

impl Default for Vertex {
    fn default() -> Self {
        Self {
            geometry: None,
            label: None,
            style_id: None,
            parent: None,
            page_id: None,
            z_order: 0,
            locked: false,
            visible: true, // Visible by default per ADR-0058
        }
    }
}
