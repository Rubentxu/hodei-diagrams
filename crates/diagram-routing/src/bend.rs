//! Bend editing utilities for orthogonal edges.
//!
//! These functions manipulate the waypoints of an orthogonal edge path:
//! - [`normalize_waypoints`] removes redundant colinear or duplicate points
//! - [`insert_orthogonal_bend`] adds a Z-bend at a click position on a segment
//! - [`move_orthogonal_bend`] moves an existing bend point to a new position
//! - [`remove_orthogonal_bend`] removes a bend point

use diagram_core::geometry::Point;

/// Remove redundant waypoints from an orthogonal path.
///
/// A point B is redundant (colinear) between A and C when:
/// - A, B, C share the same X coordinate (vertical line), or
/// - A, B, C share the same Y coordinate (horizontal line)
///
/// Also removes consecutive duplicate points (A == B).
///
/// # Examples
///
/// - `[A, B, C]` where all three are on a vertical line → `[A, C]`
/// - `[A, A, B]` (duplicates) → `[A, B]`
pub fn normalize_waypoints(waypoints: &[Point]) -> Vec<Point> {
    if waypoints.len() <= 1 {
        return waypoints.to_vec();
    }

    let mut result = Vec::with_capacity(waypoints.len());
    result.push(waypoints[0]);

    for curr in waypoints.iter().skip(1) {
        let prev = &result[result.len() - 1];

        // Skip if duplicate of previous
        if curr.x == prev.x && curr.y == prev.y {
            continue;
        }

        // Check colinearity with the previous two points in result
        if result.len() >= 2 {
            let prev_prev = &result[result.len() - 2];
            // If all three are vertical (same x)
            if prev_prev.x == prev.x && prev.x == curr.x {
                // Remove the middle point (prev), keep curr
                result.pop();
            }
            // If all three are horizontal (same y)
            else if prev_prev.y == prev.y && prev.y == curr.y {
                result.pop();
            }
        }

        result.push(*curr);
    }

    result
}

/// Insert a Z-bend into an orthogonal segment at a click position.
///
/// Given a full path `[P0, P1, ..., Pn]` and a click on segment
/// `path[segment_index] → path[segment_index+1]`:
///
/// - For a **horizontal** segment (A.y == B.y): inserts a vertical then horizontal
///   detour through the click's X coordinate
/// - For a **vertical** segment (A.x == B.x): inserts a horizontal then vertical
///   detour through the click's Y coordinate
///
/// If the click is directly on the line (same axis coordinate), returns the path
/// unchanged.
///
/// # Panics
///
/// Panics if `segment_index` is out of bounds.
pub fn insert_orthogonal_bend(path: &[Point], segment_index: usize, click: Point) -> Vec<Point> {
    assert!(
        segment_index + 1 < path.len(),
        "segment_index out of bounds"
    );

    let a = path[segment_index];
    let b = path[segment_index + 1];

    // Determine segment orientation and check if click is on the line
    if (a.y - b.y).abs() < f64::EPSILON {
        // Horizontal segment
        if (click.y - a.y).abs() < f64::EPSILON {
            // Click is on the line — no-op
            return path.to_vec();
        }
        // Insert Z-bend: A → (click.x, a.y) → (click.x, click.y) → (b.x, click.y) → B
        let mut new_path = path[..=segment_index].to_vec();
        new_path.push(Point { x: click.x, y: a.y }); // intermediate on horizontal
        new_path.push(click); // the corner at click
        new_path.push(Point { x: b.x, y: click.y }); // intermediate on horizontal to target
        new_path.extend_from_slice(&path[segment_index + 1..]);
        return normalize_waypoints(&new_path);
    } else if (a.x - b.x).abs() < f64::EPSILON {
        // Vertical segment
        if (click.x - a.x).abs() < f64::EPSILON {
            // Click is on the line — no-op
            return path.to_vec();
        }
        // Insert Z-bend: A → (a.x, click.y) → (click.x, click.y) → (click.x, b.y) → B
        let mut new_path = path[..=segment_index].to_vec();
        new_path.push(Point { x: a.x, y: click.y }); // intermediate on vertical
        new_path.push(click); // the corner at click
        new_path.push(Point { x: click.x, y: b.y }); // intermediate on vertical to target
        new_path.extend_from_slice(&path[segment_index + 1..]);
        return normalize_waypoints(&new_path);
    }

    // Diagonal segment — treat as horizontal (fallback)
    let mut new_path = path[..=segment_index].to_vec();
    new_path.push(click);
    new_path.extend_from_slice(&path[segment_index + 1..]);
    normalize_waypoints(&new_path)
}

/// Move an existing bend point to a new position.
///
/// The bend at `bend_index` is replaced with `new_point`, then snapped to
/// maintain orthogonality with adjacent segments:
///
/// - If the previous segment is horizontal (same Y), `new_point.y` is forced to
///   the previous point's Y coordinate.
/// - If the previous segment is vertical (same X), `new_point.x` is forced to
///   the previous point's X coordinate.
/// - The same logic applies for the next segment.
///
/// For v1, if both previous and next segments constrain the same axis differently,
/// the previous segment's constraint takes priority.
///
/// # Panics
///
/// Panics if `bend_index` is 0 or `path.len() - 1` (endpoints cannot be moved).
pub fn move_orthogonal_bend(path: &[Point], bend_index: usize, new_point: Point) -> Vec<Point> {
    assert!(bend_index > 0, "cannot move endpoint at index 0");
    assert!(
        bend_index < path.len() - 1,
        "cannot move endpoint at last index"
    );

    let mut result = path.to_vec();
    let prev = result[bend_index - 1];
    let next = result[bend_index + 1];

    let mut snapped = new_point;

    // Snap to previous segment's axis
    // Previous segment: prev → path[bend_index]
    if (prev.y - result[bend_index].y).abs() < f64::EPSILON {
        // Previous segment is horizontal — constrain Y
        snapped.y = prev.y;
    } else if (prev.x - result[bend_index].x).abs() < f64::EPSILON {
        // Previous segment is vertical — constrain X
        snapped.x = prev.x;
    }

    // Snap to next segment's axis (may reinforce or conflict)
    // Next segment: path[bend_index] → next
    if (result[bend_index].y - next.y).abs() < f64::EPSILON {
        // Next segment is horizontal — constrain Y
        snapped.y = next.y;
    } else if (result[bend_index].x - next.x).abs() < f64::EPSILON {
        // Next segment is vertical — constrain X
        snapped.x = next.x;
    }

    result[bend_index] = snapped;
    normalize_waypoints(&result)
}

/// Remove a bend point from an orthogonal path.
///
/// Removes `path[bend_index]` and then normalizes the result. The normalization
/// step may not fully restore orthogonality at the removal site — this is
/// acceptable for v1.
///
/// # Panics
///
/// Panics if `bend_index` is 0 or `path.len() - 1` (endpoints cannot be removed).
pub fn remove_orthogonal_bend(path: &[Point], bend_index: usize) -> Vec<Point> {
    assert!(bend_index > 0, "cannot remove endpoint at index 0");
    assert!(
        bend_index < path.len() - 1,
        "cannot remove endpoint at last index"
    );

    let mut result = path.to_vec();
    result.remove(bend_index);
    normalize_waypoints(&result)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ─── normalize_waypoints tests ─────────────────────────────────────────────

    #[test]
    fn normalize_removes_colinear_middle_point() {
        // Three points on a vertical line — middle is redundant
        let pts = vec![
            Point { x: 10.0, y: 0.0 },
            Point { x: 10.0, y: 5.0 },
            Point { x: 10.0, y: 10.0 },
        ];
        let result = normalize_waypoints(&pts);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], Point { x: 10.0, y: 0.0 });
        assert_eq!(result[1], Point { x: 10.0, y: 10.0 });
    }

    #[test]
    fn normalize_removes_horizontal_colinear() {
        let pts = vec![
            Point { x: 0.0, y: 10.0 },
            Point { x: 5.0, y: 10.0 },
            Point { x: 10.0, y: 10.0 },
        ];
        let result = normalize_waypoints(&pts);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn normalize_keeps_non_colinear_points() {
        let pts = vec![
            Point { x: 0.0, y: 0.0 },
            Point { x: 10.0, y: 0.0 },
            Point { x: 10.0, y: 10.0 },
        ];
        let result = normalize_waypoints(&pts);
        assert_eq!(result.len(), 3);
    }

    #[test]
    fn normalize_removes_duplicate_consecutive() {
        let pts = vec![
            Point { x: 0.0, y: 0.0 },
            Point { x: 0.0, y: 0.0 },
            Point { x: 10.0, y: 10.0 },
        ];
        let result = normalize_waypoints(&pts);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn normalize_empty_is_empty() {
        let pts: Vec<Point> = vec![];
        let result = normalize_waypoints(&pts);
        assert!(result.is_empty());
    }

    #[test]
    fn normalize_single_point() {
        let pts = vec![Point { x: 5.0, y: 5.0 }];
        let result = normalize_waypoints(&pts);
        assert_eq!(result.len(), 1);
    }

    // ─── insert_orthogonal_bend tests ──────────────────────────────────────────

    #[test]
    fn insert_horizontal_segment_creates_z_bend() {
        // Horizontal segment from (0,0) to (10,0), click at (5, 5)
        let path = vec![Point { x: 0.0, y: 0.0 }, Point { x: 10.0, y: 0.0 }];
        let result = insert_orthogonal_bend(&path, 0, Point { x: 5.0, y: 5.0 });
        // Should produce: (0,0) → (5,0) → (5,5) → (10,5) → (10,0)
        assert_eq!(result.len(), 5);
        assert_eq!(result[0], Point { x: 0.0, y: 0.0 });
        assert_eq!(result[1], Point { x: 5.0, y: 0.0 });
        assert_eq!(result[2], Point { x: 5.0, y: 5.0 });
        assert_eq!(result[3], Point { x: 10.0, y: 5.0 });
        assert_eq!(result[4], Point { x: 10.0, y: 0.0 });
    }

    #[test]
    fn insert_vertical_segment_creates_z_bend() {
        // Vertical segment from (0,0) to (0,10), click at (5, 5)
        let path = vec![Point { x: 0.0, y: 0.0 }, Point { x: 0.0, y: 10.0 }];
        let result = insert_orthogonal_bend(&path, 0, Point { x: 5.0, y: 5.0 });
        // Should produce: (0,0) → (0,5) → (5,5) → (5,10) → (0,10)
        assert_eq!(result.len(), 5);
        assert_eq!(result[0], Point { x: 0.0, y: 0.0 });
        assert_eq!(result[1], Point { x: 0.0, y: 5.0 });
        assert_eq!(result[2], Point { x: 5.0, y: 5.0 });
        assert_eq!(result[3], Point { x: 5.0, y: 10.0 });
        assert_eq!(result[4], Point { x: 0.0, y: 10.0 });
    }

    #[test]
    fn insert_click_on_horizontal_line_noop() {
        // Click directly on the line
        let path = vec![Point { x: 0.0, y: 0.0 }, Point { x: 10.0, y: 0.0 }];
        let result = insert_orthogonal_bend(&path, 0, Point { x: 5.0, y: 0.0 });
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], Point { x: 0.0, y: 0.0 });
        assert_eq!(result[1], Point { x: 10.0, y: 0.0 });
    }

    #[test]
    fn insert_click_on_vertical_line_noop() {
        // Click directly on the line
        let path = vec![Point { x: 0.0, y: 0.0 }, Point { x: 0.0, y: 10.0 }];
        let result = insert_orthogonal_bend(&path, 0, Point { x: 0.0, y: 5.0 });
        assert_eq!(result.len(), 2);
    }

    // ─── move_orthogonal_bend tests ────────────────────────────────────────────

    #[test]
    fn move_bend_horizontal_snap() {
        // L-shape: (0,0) → (0,10) → (10,10)
        // Move the elbow at index 1 to a new position
        let path = vec![
            Point { x: 0.0, y: 0.0 },
            Point { x: 0.0, y: 10.0 },
            Point { x: 10.0, y: 10.0 },
        ];
        // Move to (5, 10) — should snap Y to 10 (horizontal constraint)
        let result = move_orthogonal_bend(&path, 1, Point { x: 5.0, y: 10.0 });
        assert_eq!(result[1], Point { x: 0.0, y: 10.0 }); // Y snapped
    }

    #[test]
    fn move_bend_vertical_snap() {
        // L-shape: (0,0) → (10,0) → (10,10)
        let path = vec![
            Point { x: 0.0, y: 0.0 },
            Point { x: 10.0, y: 0.0 },
            Point { x: 10.0, y: 10.0 },
        ];
        // Move to (10, 5) — should snap X to 10 (vertical constraint)
        let result = move_orthogonal_bend(&path, 1, Point { x: 10.0, y: 5.0 });
        assert_eq!(result[1], Point { x: 10.0, y: 0.0 }); // X snapped
    }

    // ─── remove_orthogonal_bend tests ──────────────────────────────────────────

    #[test]
    fn remove_bend_removes_and_normalizes() {
        // L-shape with bend at index 1
        let path = vec![
            Point { x: 0.0, y: 0.0 },
            Point { x: 0.0, y: 10.0 },
            Point { x: 10.0, y: 10.0 },
        ];
        let result = remove_orthogonal_bend(&path, 1);
        // After removing (0,10), we get (0,0) → (10,10) which is diagonal
        // normalize doesn't remove diagonal, so we get 2 points
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn remove_bend_from_multi_bend_path() {
        // Z-shape: (0,0) → (0,10) → (10,10) → (10,20)
        let path = vec![
            Point { x: 0.0, y: 0.0 },
            Point { x: 0.0, y: 10.0 },
            Point { x: 10.0, y: 10.0 },
            Point { x: 10.0, y: 20.0 },
        ];
        // Remove the middle bend at index 1
        let result = remove_orthogonal_bend(&path, 1);
        // After removing (0,10): (0,0) → (10,10) → (10,20)
        // (0,0)→(10,10)→(10,20): (10,10) is colinear with vertical (0,0→10,10→10,20)?
        // No — (0,0) to (10,10) is diagonal, not orthogonal
        assert_eq!(result.len(), 3);
    }
}
