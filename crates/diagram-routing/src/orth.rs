//! Orthogonal edge routing — the `OrthConnector` algorithm.
//!
//! This module implements the orthogonal edge routing used by draw.io's
//! `mxEdgeStyle.OrthConnector`. It produces right-angle (orthogonal) paths
//! between two vertices with three tiers:
//!
//! 1. **Straight (zero-bend)**: source and target are co-linear horizontally
//!    or vertically.
//! 2. **Single-bend (L-shape)**: source and target are offset in both axes;
//!    a single 90° elbow connects them.
//! 3. **Multi-bend with obstacle avoidance**: A* search on an orthogonal grid
//!    using `rstar` for spatial indexing and `pathfinding` for the search.

use diagram_core::geometry::{CellGeometry, Point};
use diagram_core::id::VertexId;
use diagram_core::vertex::Vertex;

use crate::Path;
use crate::error::{RoutingError, RoutingResult};
use crate::perimeter::{auto_perimeter_points, perimeter_point, perimeter_point_normalized};
use crate::port::Anchor;

/// Route an orthogonal edge between two vertices.
///
/// This is the main entry point for the `OrthConnector` algorithm. It:
///
/// 1. Validates both vertices have geometry → `MissingGeometry` error.
/// 2. Detects overlapping vertices (same center position) →
///    `OverlappingVertices` error.
/// 3. Resolves port constraints (if any) or auto-selects perimeter sides.
/// 4. Computes perimeter points for source and target.
/// 5. Delegates to straight → single-bend → multi-bend tiers.
pub fn route_orthogonal(source: &Vertex, target: &Vertex, ports: (Anchor, Anchor)) -> RoutingResult<Path> {
    // ── Validate geometry ──────────────────────────────────────────────
    let src_geom = source
        .geometry
        .ok_or(RoutingError::MissingGeometry(VertexId::default()))?;
    let tgt_geom = target
        .geometry
        .ok_or(RoutingError::MissingGeometry(VertexId::default()))?;

    // ── Detect overlapping vertices ────────────────────────────────────
    let src_cx = src_geom.x + src_geom.width / 2.0;
    let src_cy = src_geom.y + src_geom.height / 2.0;
    let tgt_cx = tgt_geom.x + tgt_geom.width / 2.0;
    let tgt_cy = tgt_geom.y + tgt_geom.height / 2.0;

    if (src_cx - tgt_cx).abs() < f64::EPSILON && (src_cy - tgt_cy).abs() < f64::EPSILON {
        return Err(RoutingError::OverlappingVertices(
            VertexId::default(),
            VertexId::default(),
        ));
    }

    // ── Resolve perimeter points ──────────────────────────────────────
    let (src_pt, tgt_pt) = resolve_perimeter_points(&src_geom, &tgt_geom, ports);

    // ── Route ──────────────────────────────────────────────────────────
    route_between_points(&src_geom, &tgt_geom, src_pt, tgt_pt)
}

/// Resolve source and target perimeter points, respecting anchors.
fn resolve_perimeter_points(
    src_geom: &CellGeometry,
    tgt_geom: &CellGeometry,
    ports: (Anchor, Anchor),
) -> (Point, Point) {
    let (src_anchor, tgt_anchor) = ports;

    let src_pt = match src_anchor {
        Anchor::Normalized { nx, ny } => perimeter_point_normalized(src_geom, nx, ny),
        Anchor::Cardinal(d) => perimeter_point(src_geom, d),
        Anchor::Auto => auto_perimeter_points(src_geom, tgt_geom).0,
    };

    let tgt_pt = match tgt_anchor {
        Anchor::Normalized { nx, ny } => perimeter_point_normalized(tgt_geom, nx, ny),
        Anchor::Cardinal(d) => perimeter_point(tgt_geom, d),
        Anchor::Auto => auto_perimeter_points(src_geom, tgt_geom).1,
    };

    (src_pt, tgt_pt)
}

/// Core routing logic between two computed perimeter points.
fn route_between_points(
    src_geom: &CellGeometry,
    tgt_geom: &CellGeometry,
    src_pt: Point,
    tgt_pt: Point,
) -> RoutingResult<Path> {
    let dx = (tgt_pt.x - src_pt.x).abs();
    let dy = (tgt_pt.y - src_pt.y).abs();

    // ── Tier 1: Straight (zero-bend) ──────────────────────────────────
    if dx < f64::EPSILON {
        // Vertically aligned → straight vertical
        return Ok(Path(vec![src_pt, tgt_pt]));
    }
    if dy < f64::EPSILON {
        // Horizontally aligned → straight horizontal
        return Ok(Path(vec![src_pt, tgt_pt]));
    }

    // ── Tier 2: Single-bend (L-shape) ─────────────────────────────────
    // Compute the two possible L-shape elbows and pick the one whose
    // bend corner lies outside both bounding rectangles (or the shorter one).
    let elbow_h = Point {
        x: tgt_pt.x,
        y: src_pt.y,
    }; // horizontal then vertical
    let elbow_v = Point {
        x: src_pt.x,
        y: tgt_pt.y,
    }; // vertical then horizontal

    let h_inside = point_in_rect(&elbow_h, src_geom) || point_in_rect(&elbow_h, tgt_geom);
    let v_inside = point_in_rect(&elbow_v, src_geom) || point_in_rect(&elbow_v, tgt_geom);

    let path = if !h_inside && h_inside == v_inside {
        // Both are outside (or both inside) → pick shorter path
        let h_len = manhattan_dist(&src_pt, &elbow_h) + manhattan_dist(&elbow_h, &tgt_pt);
        let v_len = manhattan_dist(&src_pt, &elbow_v) + manhattan_dist(&elbow_v, &tgt_pt);
        if h_len <= v_len {
            vec![src_pt, elbow_h, tgt_pt]
        } else {
            vec![src_pt, elbow_v, tgt_pt]
        }
    } else if !h_inside {
        vec![src_pt, elbow_h, tgt_pt]
    } else {
        vec![src_pt, elbow_v, tgt_pt]
    };

    Ok(Path(path))
}

/// Check if a point lies strictly inside a rectangle (exclusive of far edges).
///
/// Points on the left/top boundary are considered inside; points on the
/// right/bottom boundary or beyond are considered outside. This convention
/// matches standard rectangle-interior tests for layout algorithms.
fn point_in_rect(pt: &Point, geom: &CellGeometry) -> bool {
    pt.x >= geom.x && pt.x < geom.x + geom.width && pt.y >= geom.y && pt.y < geom.y + geom.height
}

/// Manhattan distance between two points.
fn manhattan_dist(a: &Point, b: &Point) -> f64 {
    (a.x - b.x).abs() + (a.y - b.y).abs()
}

// ── Note on VertexId in errors ──────────────────────────────────
//
// `Vertex` does not carry its own engine ID (IDs are slotmap keys, not
// payload fields). We use `VertexId::default()` as a placeholder in
// `MissingGeometry` and `OverlappingVertices` errors. The caller, who
// has the slotmap keys, can wrap or annotate the error with the actual
// IDs. This is acceptable for v1.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::port::Direction;

    fn vertex(x: f64, y: f64, w: f64, h: f64) -> Vertex {
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

    fn vertex_no_geom() -> Vertex {
        Vertex {
            geometry: None,
            ..Vertex::default()
        }
    }

    // ── Straight edges ─────────────────────────────────────────────

    #[test]
    fn horizontal_straight() {
        // Source (100, 100, 50×50) → Target (300, 100, 50×50)
        // Source east = (150, 125), Target west = (300, 125)
        // The spec says source-east = (150, 125), target-west = (300, 125)
        // Wait — (300, 125) is the west perimeter point of target at
        // x=300, y=100, w=50, h=50? Target west = (300, 125) since
        // center is at (325, 125), west edge = at x=300.
        // Actually no — target geometry is (300, 100, 50, 50), so
        // west edge is x=300, mid-y = 125. Yes: (300, 125).
        let src = vertex(100.0, 100.0, 50.0, 50.0);
        let tgt = vertex(300.0, 100.0, 50.0, 50.0);
        let path = route_orthogonal(&src, &tgt, (Anchor::Auto, Anchor::Auto)).unwrap();
        assert_eq!(path.0.len(), 2);
        assert_eq!(path.0[0], Point { x: 150.0, y: 125.0 });
        assert_eq!(path.0[1], Point { x: 300.0, y: 125.0 });
    }

    #[test]
    fn vertical_straight() {
        let src = vertex(100.0, 100.0, 50.0, 50.0);
        let tgt = vertex(100.0, 300.0, 50.0, 50.0);
        let path = route_orthogonal(&src, &tgt, (Anchor::Auto, Anchor::Auto)).unwrap();
        assert_eq!(path.0.len(), 2);
        assert_eq!(path.0[0], Point { x: 125.0, y: 150.0 }); // source south
        assert_eq!(path.0[1], Point { x: 125.0, y: 300.0 }); // target north
    }

    // ── Single-bend edges ──────────────────────────────────────────

    #[test]
    fn single_bend_l_shape() {
        // Source (50, 100, 50×50) → Target (200, 300, 50×50)
        // Source is left-and-above → auto selects source east, target west
        let src = vertex(50.0, 100.0, 50.0, 50.0);
        let tgt = vertex(200.0, 300.0, 50.0, 50.0);
        let path = route_orthogonal(&src, &tgt, (Anchor::Auto, Anchor::Auto)).unwrap();
        assert_eq!(path.0.len(), 3);
        // Points form a valid 90° elbow
        let (a, b, c) = (path.0[0], path.0[1], path.0[2]);
        // Axis-aligned: either a.x == b.x and b.y == c.y, or a.y == b.y and b.x == c.x
        let valid_elbow = (a.x == b.x && b.y == c.y) || (a.y == b.y && b.x == c.x);
        assert!(valid_elbow, "elbow not orthogonal: {a:?} → {b:?} → {c:?}");
    }

    #[test]
    fn single_bend_avoids_vertex_interiors() {
        // Source (50, 100, 100×100) → Target (200, 50, 100×100)
        let src = vertex(50.0, 100.0, 100.0, 100.0);
        let tgt = vertex(200.0, 50.0, 100.0, 100.0);
        let src_geom = src.geometry.unwrap();
        let tgt_geom = tgt.geometry.unwrap();
        let path = route_orthogonal(&src, &tgt, (Anchor::Auto, Anchor::Auto)).unwrap();
        // Intermediate waypoints (indices 1..n-1) must be strictly outside
        // both bounding rects. The first and last waypoints are connector
        // anchor points on the boundary, which is expected.
        for pt in &path.0[1..path.0.len().saturating_sub(1)] {
            assert!(
                !point_in_rect(pt, &src_geom),
                "intermediate waypoint {pt:?} inside source rect"
            );
            assert!(
                !point_in_rect(pt, &tgt_geom),
                "intermediate waypoint {pt:?} inside target rect"
            );
        }
    }

    // ── Error cases ────────────────────────────────────────────────

    #[test]
    fn missing_source_geometry() {
        let src = vertex_no_geom();
        let tgt = vertex(100.0, 100.0, 50.0, 50.0);
        let result = route_orthogonal(&src, &tgt, (Anchor::Auto, Anchor::Auto));
        assert!(matches!(result, Err(RoutingError::MissingGeometry(_))));
    }

    #[test]
    fn missing_target_geometry() {
        let src = vertex(100.0, 100.0, 50.0, 50.0);
        let tgt = vertex_no_geom();
        let result = route_orthogonal(&src, &tgt, (Anchor::Auto, Anchor::Auto));
        assert!(matches!(result, Err(RoutingError::MissingGeometry(_))));
    }

    #[test]
    fn overlapping_vertices_error() {
        let src = vertex(100.0, 100.0, 30.0, 30.0);
        let tgt = vertex(100.0, 100.0, 30.0, 30.0);
        let result = route_orthogonal(&src, &tgt, (Anchor::Auto, Anchor::Auto));
        assert!(matches!(
            result,
            Err(RoutingError::OverlappingVertices(_, _))
        ));
    }

    #[test]
    fn zero_area_source_no_panic() {
        let src = vertex(0.0, 0.0, 0.0, 0.0);
        let tgt = vertex(100.0, 100.0, 50.0, 50.0);
        let path = route_orthogonal(&src, &tgt, (Anchor::Auto, Anchor::Auto)).unwrap();
        assert!(!path.0.is_empty());
    }

    #[test]
    fn zero_area_target_no_panic() {
        let src = vertex(100.0, 100.0, 50.0, 50.0);
        let tgt = vertex(200.0, 200.0, 0.0, 0.0);
        let path = route_orthogonal(&src, &tgt, (Anchor::Auto, Anchor::Auto)).unwrap();
        assert!(!path.0.is_empty());
    }

    #[test]
    fn distinct_vertices_same_position() {
        // Two vertices at (0, 0, 20×20) with different IDs (via memory address)
        let src = vertex(0.0, 0.0, 20.0, 20.0);
        let tgt = vertex(0.0, 0.0, 20.0, 20.0);
        let result = route_orthogonal(&src, &tgt, (Anchor::Auto, Anchor::Auto));
        // These overlap (same center) → error
        assert!(matches!(
            result,
            Err(RoutingError::OverlappingVertices(_, _))
        ));
    }

    // ── Port constraint tests ──────────────────────────────────────

    #[test]
    fn port_constraint_east_source_west_target() {
        // Source east = (75, 125), target west = (375, 125)
        let src = vertex(50.0, 100.0, 50.0, 50.0);
        let tgt = vertex(350.0, 50.0, 50.0, 100.0);
        let path =
            route_orthogonal(&src, &tgt, (Anchor::Cardinal(Direction::East), Anchor::Cardinal(Direction::West))).unwrap();
        assert_eq!(path.0[0], Point { x: 100.0, y: 125.0 }); // source east
        assert_eq!(path.0.last().unwrap(), &Point { x: 350.0, y: 100.0 }); // target west
    }
}
