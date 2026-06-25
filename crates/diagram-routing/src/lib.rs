//! # diagram-routing
//!
//! Edge routing algorithms for the Hodei Diagrams Diagram Engine. This crate
//! computes [`Path`]s (sequences of [`Point`]s) that describe how an edge
//! connects two vertices in a diagram. It depends **only** on `diagram-core`
//! and must not import any format, scene, render, or web concern.
//!
//! See `docs/adr/0013-keep-layout-and-routing-outside-diagram-core.md` and
//! `docs/adr/0044-routing-architecture-data-vs-algorithm.md`.
//!
//! ## Architecture
//!
//! The crate has four modules:
//!
//! * `orth` — orthogonal connector algorithm (straight, single-bend, multi-bend
//!   with obstacle avoidance via rstar/pathfinding).
//! * `segment` — passthrough connector that returns pre-computed waypoints
//!   unchanged.
//! * `port` — port constraint parser that reads `"portConstraint"` from
//!   [`StyleMap`] and yields a [`Direction`].
//! * `perimeter` — computes connector points on the bounding-box perimeter
//!   of a [`CellGeometry`].
//! * `error` — shared [`RoutingError`] type for the entire crate.
//!
//! The top-level [`route`] function dispatches by [`EdgeStyle`]:
//!
//! ```ignore
//! let path = route(&RoutingRequest { source, target, style, ports, waypoints })?;
//! ```

#![deny(missing_docs)]

mod bend;
mod error;
mod orth;
mod perimeter;
mod port;
mod segment;

pub use bend::{
    insert_orthogonal_bend, move_orthogonal_bend, normalize_waypoints, remove_orthogonal_bend,
};
pub use diagram_core::geometry::Point;
pub use error::{RoutingError, RoutingResult};
pub use orth::route_orthogonal;
pub use perimeter::{auto_perimeter_points, perimeter_point, perimeter_point_normalized};
pub use port::{Anchor, Direction, parse_port_constraint, port_constraint_from_style, resolve_anchor};
pub use segment::route_segment;

use diagram_core::style::StyleMap;
use diagram_core::vertex::Vertex;

/// The style of edge routing to apply.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EdgeStyle {
    /// Right-angle (orthogonal) routing.
    Orthogonal,
    /// Passthrough of pre-computed waypoints unchanged.
    Segment,
}

/// A pair of (source_port, target_port) port constraints.
pub type PortPair = (Option<Direction>, Option<Direction>);

/// A request to route an edge.
#[derive(Debug, Clone)]
pub struct RoutingRequest<'a> {
    /// The source (from) vertex.
    pub source: &'a Vertex,
    /// The target (to) vertex.
    pub target: &'a Vertex,
    /// The edge style (algorithm selector).
    pub style: EdgeStyle,
    /// Anchors for source and target (source anchor, target anchor).
    pub ports: (Anchor, Anchor),
    /// Pre-existing waypoints (used by Segment passthrough).
    pub waypoints: &'a [Point],
}

/// A routed path: an ordered sequence of waypoints.
#[derive(Debug, Clone, PartialEq)]
pub struct Path(pub Vec<Point>);

/// Route an edge according to the given request.
///
/// Dispatches to the algorithm indicated by [`EdgeStyle`]:
/// - [`EdgeStyle::Orthogonal`] → [`route_orthogonal`]
/// - [`EdgeStyle::Segment`] → [`route_segment`]
pub fn route(req: &RoutingRequest<'_>) -> RoutingResult<Path> {
    match req.style {
        EdgeStyle::Orthogonal => route_orthogonal(req.source, req.target, req.ports.clone()),
        EdgeStyle::Segment => route_segment(req.waypoints),
    }
}

/// Parse an `edgeStyle` value from a [`StyleMap`] to an [`EdgeStyle`] variant.
///
/// | StyleMap value       | Result              |
/// |----------------------|---------------------|
/// | `"orthogonalEdgeStyle"` | `Orthogonal`    |
/// | absent / any other    | `Orthogonal` (default, fallback) |
pub fn edge_style_from(map: &StyleMap) -> EdgeStyle {
    match map.get("edgeStyle").map(|v| v.as_str()) {
        Some("orthogonalEdgeStyle") | None => EdgeStyle::Orthogonal,
        // Unknown styles fall back to orthogonal with diagnostic
        Some(_) => EdgeStyle::Orthogonal,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::geometry::CellGeometry;
    use diagram_core::style::{StyleMap, StyleValue};

    fn vertex_at(x: f64, y: f64, w: f64, h: f64) -> Vertex {
        Vertex {
            geometry: Some(CellGeometry {
                x,
                y,
                width: w,
                height: h,
                relative: false,
                ..Default::default()
            }),
            ..Vertex::default()
        }
    }

    #[test]
    fn route_dispatches_orthogonal() {
        let src = vertex_at(0.0, 0.0, 50.0, 50.0);
        let tgt = vertex_at(200.0, 0.0, 50.0, 50.0);
        let req = RoutingRequest {
            source: &src,
            target: &tgt,
            style: EdgeStyle::Orthogonal,
            ports: (Anchor::Auto, Anchor::Auto),
            waypoints: &[],
        };
        let path = route(&req).unwrap();
        // Horizontal straight: 2 waypoints
        assert_eq!(path.0.len(), 2);
    }

    #[test]
    fn route_dispatches_segment() {
        let pts = vec![Point { x: 0.0, y: 0.0 }, Point { x: 100.0, y: 50.0 }];
        let req = RoutingRequest {
            source: &Vertex::default(),
            target: &Vertex::default(),
            style: EdgeStyle::Segment,
            ports: (Anchor::Auto, Anchor::Auto),
            waypoints: &pts,
        };
        let path = route(&req).unwrap();
        assert_eq!(path.0, pts);
    }

    #[test]
    fn edge_style_orthogonal() {
        let mut map = StyleMap::new();
        map.insert("edgeStyle", StyleValue::from("orthogonalEdgeStyle"));
        assert_eq!(edge_style_from(&map), EdgeStyle::Orthogonal);
    }

    #[test]
    fn edge_style_defaults_orthogonal() {
        let map = StyleMap::new();
        assert_eq!(edge_style_from(&map), EdgeStyle::Orthogonal);
    }

    #[test]
    fn edge_style_unknown_falls_back_orthogonal() {
        let mut map = StyleMap::new();
        map.insert("edgeStyle", StyleValue::from("bogusStyle"));
        assert_eq!(edge_style_from(&map), EdgeStyle::Orthogonal);
    }

    #[test]
    fn edge_style_entity_relation_falls_back_orthogonal() {
        let mut map = StyleMap::new();
        map.insert("edgeStyle", StyleValue::from("entityRelationEdgeStyle"));
        assert_eq!(edge_style_from(&map), EdgeStyle::Orthogonal);
    }
}
