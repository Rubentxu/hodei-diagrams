//! Golden integration tests for diagram-routing.
//!
//! These tests parse real .drawio fixtures, map them to the domain model,
//! invoke the routing algorithms, and verify that the computed waypoints
//! match expectations derived from the vertex geometry.

use diagram_core::geometry::Point;
use diagram_core::vertex::Vertex;
use diagram_format_drawio::{DrawioMapping, parse_drawio};
use diagram_routing::route_orthogonal;

/// Tolerance for floating-point waypoint comparison.
const TOLERANCE: f64 = f64::EPSILON * 100.0;

fn approx_eq(a: f64, b: f64) -> bool {
    (a - b).abs() < TOLERANCE
}

fn point_approx_eq(p: &Point, expected: &Point) -> bool {
    approx_eq(p.x, expected.x) && approx_eq(p.y, expected.y)
}

/// Helper: parse a fixture, find vertices A and B, and return their data.
fn load_vertex_pair(fixture: &str) -> (Vertex, Vertex) {
    let raw = parse_drawio(fixture).expect("fixture should parse");
    let mapper = DrawioMapping::new();
    let (model, id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

    let vid_a = id_map
        .get_internal_vertex("A")
        .expect("fixture should have vertex A");
    let vid_b = id_map
        .get_internal_vertex("B")
        .expect("fixture should have vertex B");

    let va = model
        .store
        .vertex(vid_a)
        .cloned()
        .expect("vertex A should exist in store");
    let vb = model
        .store
        .vertex(vid_b)
        .cloned()
        .expect("vertex B should exist in store");

    (va, vb)
}

// ── Straight edge ───────────────────────────────────────────────────────

#[test]
fn golden_routing_straight() {
    let fixture = include_str!("../fixtures/orthogonal-straight.drawio");
    let (va, vb) = load_vertex_pair(fixture);

    // Source: (100, 100, 50×50)  → east perimeter: (150, 125)
    // Target: (300, 100, 50×50)  → west perimeter: (300, 125)
    let path = route_orthogonal(&va, &vb, (None, None)).unwrap();

    assert_eq!(path.0.len(), 2, "straight edge should have 2 waypoints");
    assert!(
        point_approx_eq(&path.0[0], &Point { x: 150.0, y: 125.0 }),
        "first waypoint should be source east (150,125), got {:?}",
        path.0[0]
    );
    assert!(
        point_approx_eq(&path.0[1], &Point { x: 300.0, y: 125.0 }),
        "second waypoint should be target west (300,125), got {:?}",
        path.0[1]
    );
}

// ── Single-bend edge ────────────────────────────────────────────────────

#[test]
fn golden_routing_single_bend() {
    let fixture = include_str!("../fixtures/orthogonal-single-bend.drawio");
    let (va, vb) = load_vertex_pair(fixture);

    // Source: (50, 100, 50×50)  center (75,125)
    // Target: (200, 300, 50×50) center (225,325)
    // dy (200) > dx (150) → vertical dominance, target below:
    //   source South = (75, 150), target North = (225, 300)
    // L-shape elbow: horizontal-first at (225, 150)
    let path = route_orthogonal(&va, &vb, (None, None)).unwrap();

    assert_eq!(path.0.len(), 3, "single-bend should have 3 waypoints");

    // First point should be source south perimeter
    assert!(
        point_approx_eq(&path.0[0], &Point { x: 75.0, y: 150.0 }),
        "first waypoint should be source south (75,150), got {:?}",
        path.0[0]
    );
    // Last point should be target north perimeter
    assert!(
        point_approx_eq(&path.0[2], &Point { x: 225.0, y: 300.0 }),
        "last waypoint should be target north (225,300), got {:?}",
        path.0[2]
    );
    // Middle point: must be an orthogonal elbow (axis-aligned)
    let (a, b, c) = (path.0[0], path.0[1], path.0[2]);
    let valid_elbow = (a.x == b.x && b.y == c.y) || (a.y == b.y && b.x == c.x);
    assert!(
        valid_elbow,
        "middle point should form 90° elbow: {a:?} → {b:?} → {c:?}"
    );
}

// ── Multi-bend edge ─────────────────────────────────────────────────────

#[test]
fn golden_routing_multi_bend() {
    // Multi-bend: three vertices with a blocker in the middle
    // Source A (0, 0, 20×20), Blocker (50, -10, 20×40), Target B (100, 0, 20×20)
    let fixture = include_str!("../fixtures/orthogonal-multi-bend.drawio");
    let raw = parse_drawio(fixture).expect("fixture should parse");
    let mapper = DrawioMapping::new();
    let (model, id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

    let vid_a = id_map
        .get_internal_vertex("A")
        .expect("fixture should have vertex A");
    let vid_b = id_map
        .get_internal_vertex("B")
        .expect("fixture should have vertex B");

    let va = model.store.vertex(vid_a).cloned().unwrap();
    let vb = model.store.vertex(vid_b).cloned().unwrap();

    let path = route_orthogonal(&va, &vb, (None, None)).unwrap();

    // Must have at least 2 waypoints and form a valid orthogonal path
    assert!(
        path.0.len() >= 2,
        "multi-bend should have at least 2 waypoints, got {}",
        path.0.len()
    );

    // Verify alternating axis-aligned segments
    for window in path.0.windows(2) {
        let dx = (window[0].x - window[1].x).abs();
        let dy = (window[0].y - window[1].y).abs();
        // Each segment must be axis-aligned (either dx≈0 or dy≈0)
        assert!(
            dx < TOLERANCE || dy < TOLERANCE,
            "segment {:?} → {:?} is not axis-aligned",
            window[0],
            window[1]
        );
    }

    // Verify no waypoint is inside the blocker's bounding rect
    let blocker_id = id_map
        .get_internal_vertex("BLOCKER")
        .expect("fixture should have BLOCKER");
    let blocker = model.store.vertex(blocker_id).cloned().unwrap();
    let blocker_geom = blocker.geometry.unwrap();
    for pt in &path.0 {
        let inside = pt.x >= blocker_geom.x
            && pt.x < blocker_geom.x + blocker_geom.width
            && pt.y >= blocker_geom.y
            && pt.y < blocker_geom.y + blocker_geom.height;
        assert!(!inside, "waypoint {pt:?} is inside blocker rect");
    }
}

// ── Segment passthrough ─────────────────────────────────────────────────

#[test]
fn golden_segment_passthrough() {
    let pts = vec![
        Point { x: 0.0, y: 0.0 },
        Point { x: 50.0, y: 0.0 },
        Point { x: 50.0, y: 50.0 },
    ];
    let path = diagram_routing::route_segment(&pts).unwrap();
    assert_eq!(
        path.0, pts,
        "segment passthrough should return waypoints unchanged"
    );
}
