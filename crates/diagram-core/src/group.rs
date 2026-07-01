//! Group payload for the diagram engine.
//!
//! A group is a container cell that may hold child vertices, edges, and
//! nested groups. Children reference the group via their own `parent:
//! Option<GroupId>` field. Groups can also be nested: a swimlane lane's
//! `parent` field references its parent pool.

use crate::geometry::CellGeometry;
use crate::id::{GroupId, LayerId, PageId, StyleId};
use crate::label::Label;
use serde::{Deserialize, Serialize};

/// A group (container) cell within a diagram.
///
/// Groups are non-vertex, non-edge cells that serve as layout containers.
/// Children reference a group via their own `parent` field, not by storing
/// child IDs within the group itself. Groups can also be nested (e.g. a
/// swimlane lane inside a pool) via the `parent` field on the group itself.
///
/// See ADR-0058 §Decision (data shape).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Group {
    /// The 2D geometry of the group (position and size).
    pub geometry: Option<CellGeometry>,
    /// The label text displayed on the group.
    pub label: Option<Label>,
    /// The style ID referencing shared style metadata.
    pub style_id: Option<StyleId>,
    /// The parent group this group belongs to, if any (supports swimlane nesting).
    pub parent: Option<GroupId>,
    /// The page this group belongs to, if any.
    pub page_id: Option<PageId>,
    /// The layer this group belongs to, if any. `None` means the default layer.
    pub layer_id: Option<LayerId>,
    /// Z-order for layering: higher values render on top. Ties are broken
    /// by engine ID (higher ID on top). Default is 0.
    /// See ADR-0058 §Z-order semantics.
    pub z_order: i32,
    /// Whether the group is locked. The engine stores this flag but does NOT
    /// enforce it — the editor layer is responsible for preventing mutations
    /// on locked shapes. Default is false.
    /// See ADR-0058 §Lock and visibility.
    pub locked: bool,
    /// Whether the group is visible. Invisible groups are excluded from the
    /// scene display list and their entire subtree is skipped. Default is true.
    /// See ADR-0058 §Lock and visibility.
    pub visible: bool,
}

impl Default for Group {
    fn default() -> Self {
        Self {
            geometry: None,
            label: None,
            style_id: None,
            parent: None,
            page_id: None,
            layer_id: None,
            z_order: 0,
            locked: false,
            visible: true, // Visible by default per ADR-0058
        }
    }
}
