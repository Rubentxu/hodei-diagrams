//! Perimeter point calculation for edge routing.
//!
//! Functions to compute connector points on the bounding-box perimeter of
//! a vertex's [`CellGeometry`]. The [`perimeter_point`] function returns the
//! midpoint of a specific edge (north / east / south / west), while
//! [`auto_perimeter_points`] selects the best sides based on relative position.

use diagram_core::geometry::{CellGeometry, Point};

use crate::port::Direction;

/// Compute the perimeter point on a [`CellGeometry`] for a given direction.
///
/// Returns the midpoint of the bounding-box edge for the requested direction.
///
/// ## Zero-area geometry
///
/// If `width <= 0.0` or `height <= 0.0`, the function returns
/// `Point { x: geom.x, y: geom.y }` without panicking. This matches the spec
/// requirement that single-point vertices produce a degenerate point.
pub fn perimeter_point(geom: &CellGeometry, direction: Direction) -> Point {
    if geom.width <= 0.0 || geom.height <= 0.0 {
        return Point {
            x: geom.x,
            y: geom.y,
        };
    }

    let cx = geom.x + geom.width / 2.0;
    let cy = geom.y + geom.height / 2.0;

    match direction {
        Direction::North => Point { x: cx, y: geom.y },
        Direction::East => Point {
            x: geom.x + geom.width,
            y: cy,
        },
        Direction::South => Point {
            x: cx,
            y: geom.y + geom.height,
        },
        Direction::West => Point { x: geom.x, y: cy },
    }
}

/// Compute the perimeter point for normalised coordinates `(nx, ny)`.
///
/// The point is computed as `geom.x + nx * geom.width` and
/// `geom.y + ny * geom.height`. **No clamping** is applied — values
/// outside `[0, 1]` produce points outside the bounding box, which matches
/// real-world draw.io fixtures that carry out-of-range values.
pub fn perimeter_point_normalized(geom: &CellGeometry, nx: f64, ny: f64) -> Point {
    if geom.width <= 0.0 || geom.height <= 0.0 {
        return Point {
            x: geom.x,
            y: geom.y,
        };
    }
    Point {
        x: geom.x + nx * geom.width,
        y: geom.y + ny * geom.height,
    }
}

/// Auto-select best perimeter sides and compute both connector points.
///
/// The selection heuristic:
/// - If target's centre is to the right of source's centre → source uses
///   East, target uses West.
/// - If target's centre is to the left → source uses West, target uses East.
/// - If target's centre is below source → source uses South, target uses
///   North (used when horizontal centres are aligned).
/// - If target's centre is above → source uses North, target uses South.
pub fn auto_perimeter_points(src: &CellGeometry, tgt: &CellGeometry) -> (Point, Point) {
    let src_cx = src.x + src.width / 2.0;
    let src_cy = src.y + src.height / 2.0;
    let tgt_cx = tgt.x + tgt.width / 2.0;
    let tgt_cy = tgt.y + tgt.height / 2.0;

    let dx = tgt_cx - src_cx;
    let dy = tgt_cy - src_cy;

    if dx.abs() > dy.abs() {
        // Horizontal dominance
        if dx > 0.0 {
            // Target is to the right
            (
                perimeter_point(src, Direction::East),
                perimeter_point(tgt, Direction::West),
            )
        } else {
            // Target is to the left
            (
                perimeter_point(src, Direction::West),
                perimeter_point(tgt, Direction::East),
            )
        }
    } else {
        // Vertical dominance
        if dy > 0.0 {
            // Target is below
            (
                perimeter_point(src, Direction::South),
                perimeter_point(tgt, Direction::North),
            )
        } else {
            // Target is above
            (
                perimeter_point(src, Direction::North),
                perimeter_point(tgt, Direction::South),
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn geom(x: f64, y: f64, w: f64, h: f64) -> CellGeometry {
        CellGeometry {
            x,
            y,
            width: w,
            height: h,
            relative: false,
            ..Default::default()
        }
    }

    #[test]
    fn east_perimeter_midpoint() {
        // (100, 100, 60×40) → east midpoint at (160, 120)
        let g = geom(100.0, 100.0, 60.0, 40.0);
        assert_eq!(
            perimeter_point(&g, Direction::East),
            Point { x: 160.0, y: 120.0 }
        );
    }

    #[test]
    fn north_perimeter_midpoint() {
        // (200, 50, 80×30) → north midpoint at (240, 50)
        let g = geom(200.0, 50.0, 80.0, 30.0);
        assert_eq!(
            perimeter_point(&g, Direction::North),
            Point { x: 240.0, y: 50.0 }
        );
    }

    #[test]
    fn south_perimeter_midpoint() {
        let g = geom(0.0, 0.0, 100.0, 100.0);
        assert_eq!(
            perimeter_point(&g, Direction::South),
            Point { x: 50.0, y: 100.0 }
        );
    }

    #[test]
    fn west_perimeter_midpoint() {
        let g = geom(50.0, 50.0, 40.0, 60.0);
        assert_eq!(
            perimeter_point(&g, Direction::West),
            Point { x: 50.0, y: 80.0 }
        );
    }

    #[test]
    fn zero_area_returns_origin() {
        let g = geom(10.0, 20.0, 0.0, 0.0);
        assert_eq!(
            perimeter_point(&g, Direction::East),
            Point { x: 10.0, y: 20.0 }
        );
        assert_eq!(
            perimeter_point(&g, Direction::North),
            Point { x: 10.0, y: 20.0 }
        );
    }

    #[test]
    fn zero_width_returns_origin() {
        let g = geom(5.0, 5.0, 0.0, 100.0);
        assert_eq!(
            perimeter_point(&g, Direction::East),
            Point { x: 5.0, y: 5.0 }
        );
    }

    #[test]
    fn auto_target_right() {
        let src = geom(0.0, 0.0, 50.0, 50.0);
        let tgt = geom(200.0, 10.0, 50.0, 50.0);
        let (sp, tp) = auto_perimeter_points(&src, &tgt);
        // Source east = (50, 25), target west = (200, 35)
        assert_eq!(sp, Point { x: 50.0, y: 25.0 });
        assert_eq!(tp, Point { x: 200.0, y: 35.0 });
    }

    #[test]
    fn auto_target_left() {
        let src = geom(200.0, 0.0, 50.0, 50.0);
        let tgt = geom(0.0, 10.0, 50.0, 50.0);
        let (sp, tp) = auto_perimeter_points(&src, &tgt);
        // Source west = (200, 25), target east = (50, 35)
        assert_eq!(sp, Point { x: 200.0, y: 25.0 });
        assert_eq!(tp, Point { x: 50.0, y: 35.0 });
    }

    #[test]
    fn auto_target_below() {
        let src = geom(0.0, 0.0, 50.0, 50.0);
        let tgt = geom(10.0, 200.0, 50.0, 50.0);
        let (sp, tp) = auto_perimeter_points(&src, &tgt);
        // Source south = (25, 50), target north = (35, 200)
        assert_eq!(sp, Point { x: 25.0, y: 50.0 });
        assert_eq!(tp, Point { x: 35.0, y: 200.0 });
    }

    #[test]
    fn auto_target_above() {
        let src = geom(10.0, 200.0, 50.0, 50.0);
        let tgt = geom(0.0, 0.0, 50.0, 50.0);
        let (sp, tp) = auto_perimeter_points(&src, &tgt);
        // Source north = (35, 200), target south = (25, 50)
        assert_eq!(sp, Point { x: 35.0, y: 200.0 });
        assert_eq!(tp, Point { x: 25.0, y: 50.0 });
    }

    // ── perimeter_point_normalized ─────────────────────────────────────

    #[test]
    fn normalized_top_mid() {
        // (50, 50, 100×100) → (0.5, 0.0) → (100, 50)
        let g = geom(50.0, 50.0, 100.0, 100.0);
        assert_eq!(
            perimeter_point_normalized(&g, 0.5, 0.0),
            Point { x: 100.0, y: 50.0 }
        );
    }

    #[test]
    fn normalized_east_mid() {
        // (10, 10, 80×60) → (1.0, 0.5) → (90, 40)
        let g = geom(10.0, 10.0, 80.0, 60.0);
        assert_eq!(
            perimeter_point_normalized(&g, 1.0, 0.5),
            Point { x: 90.0, y: 40.0 }
        );
    }

    #[test]
    fn normalized_arbitrary_25_percent() {
        // (0, 0, 100×80) → (0.25, 0.0) → (25, 0)
        let g = geom(0.0, 0.0, 100.0, 80.0);
        assert_eq!(
            perimeter_point_normalized(&g, 0.25, 0.0),
            Point { x: 25.0, y: 0.0 }
        );
    }

    #[test]
    fn normalized_out_of_range_passthrough() {
        // Out-of-range values pass through verbatim (no clamp)
        let g = geom(0.0, 0.0, 100.0, 100.0);
        assert_eq!(
            perimeter_point_normalized(&g, -0.003, 1.001),
            Point { x: -0.3, y: 100.1 }
        );
    }

    #[test]
    fn normalized_zero_area_returns_origin() {
        let g = geom(10.0, 20.0, 0.0, 0.0);
        assert_eq!(
            perimeter_point_normalized(&g, 0.5, 0.5),
            Point { x: 10.0, y: 20.0 }
        );
    }
}
