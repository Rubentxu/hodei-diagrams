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
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
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
}
