//! Edge payload for the diagram engine.
//!
//! An edge is a labeled, styled connector between two vertices. The engine
//! never produces a partial edge — dangling source/target references are
//! dropped with a `Diagnostic` in `DrawioMapping`.

use crate::geometry::Point;
use crate::id::{PageId, StyleId, VertexId};
use crate::label::Label;
use serde::{Deserialize, Serialize};

/// An edge (connector) between two vertices.
///
/// Source and target are non-optional: the engine always produces well-formed
/// edges. If a draw.io cell references a non-existent source or target, the
/// mapping layer drops the edge and emits a `Diagnostic`.
///
/// See ADR-0058 §Decision (data shape).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Edge {
    /// The label text displayed on the edge.
    pub label: Option<Label>,
    /// The style ID referencing shared style metadata.
    pub style_id: Option<StyleId>,
    /// The source vertex ID.
    pub source: VertexId,
    /// The target vertex ID.
    pub target: VertexId,
    /// Waypoints along the edge path (computed by routing, stored as data).
    ///
    /// Empty `Vec` by default (standard `#[derive(Default)]` behaviour).
    /// Routing algorithms in `diagram-routing` compute these; they are
    /// stored here for round-trip fidelity (see ADR-0044).
    pub waypoints: Vec<Point>,
    /// The page this edge belongs to, if any.
    pub page_id: Option<PageId>,
    /// Z-order for layering: higher values render on top. Ties are broken
    /// by engine ID (higher ID on top). Default is 0.
    /// See ADR-0058 §Z-order semantics.
    pub z_order: i32,
    /// Whether the edge is locked. The engine stores this flag but does NOT
    /// enforce it — the editor layer is responsible for preventing mutations
    /// on locked shapes. Default is false.
    /// See ADR-0058 §Lock and visibility.
    pub locked: bool,
    /// Whether the edge is visible. Invisible shapes are excluded from the
    /// scene display list but remain addressable in the model. Default is true.
    /// See ADR-0058 §Lock and visibility.
    pub visible: bool,
    /// Label position offset from the edge midpoint. (0,0) = centered (default).
    /// Positive dx moves label toward target, negative toward source.
    pub label_offset: Option<(f64, f64)>,
}

impl Default for Edge {
    fn default() -> Self {
        Self {
            label: None,
            style_id: None,
            source: VertexId::default(),
            target: VertexId::default(),
            waypoints: Vec::new(),
            page_id: None,
            z_order: 0,
            locked: false,
            visible: true, // Visible by default per ADR-0058
            label_offset: None,
        }
    }
}
