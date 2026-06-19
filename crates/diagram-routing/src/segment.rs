//! Segment connector — passthrough edge routing.
//!
//! The [`SegmentConnector`] returns the pre-computed waypoints unchanged.
//! This is used when an edge has explicit `waypoints` that should be
//! preserved (e.g., from a `.drawio` round-trip or manual editing).

use diagram_core::geometry::Point;

use crate::error::{RoutingError, RoutingResult};

/// Route an edge by returning the given waypoints unchanged.
///
/// This is a pure identity function for waypoints: it returns
/// `Ok(Path(waypoints.to_vec()))`. Empty input yields an empty `Path`.
/// There is no mutation, rounding, or adjustment.
pub fn route_segment(waypoints: &[Point]) -> RoutingResult<crate::Path> {
    if waypoints.is_empty() {
        return Err(RoutingError::InvalidGeometry(
            "no waypoints for segment".into(),
        ));
    }
    Ok(crate::Path(waypoints.to_vec()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passthrough_identity() {
        let pts = vec![
            Point { x: 0.0, y: 0.0 },
            Point { x: 50.0, y: 0.0 },
            Point { x: 50.0, y: 50.0 },
        ];
        let path = route_segment(&pts).unwrap();
        assert_eq!(path.0, pts);
    }

    #[test]
    fn empty_input_returns_empty() {
        let result = route_segment(&[]);
        assert!(result.is_err());
    }

    #[test]
    fn exact_values_no_rounding() {
        let pts = vec![Point {
            x: 100.5,
            y: 200.75,
        }];
        let path = route_segment(&pts).unwrap();
        assert!((path.0[0].x - 100.5).abs() < f64::EPSILON);
        assert!((path.0[0].y - 200.75).abs() < f64::EPSILON);
    }

    #[test]
    fn single_waypoint() {
        let pts = vec![Point { x: 10.0, y: 20.0 }];
        let path = route_segment(&pts).unwrap();
        assert_eq!(path.0.len(), 1);
    }
}
