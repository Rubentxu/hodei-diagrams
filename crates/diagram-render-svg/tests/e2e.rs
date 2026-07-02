//! End-to-end integration tests: .drawio fixture → DiagramModel → Scene → SVG.

use diagram_format_drawio::{DrawioMapping, parse_drawio};
use diagram_render_svg::SvgRenderer;
use diagram_scene::{Scene, SceneBuilder};

/// Load a .drawio fixture file, parse it, convert to Scene, and render all pages.
fn scene_from_fixture(name: &str) -> Scene {
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let path = manifest_dir
        .join("..")
        .join("..")
        .join("crates")
        .join("diagram-compat-testkit")
        .join("fixtures")
        .join(format!("{}.drawio", name));
    let xml = std::fs::read_to_string(&path).unwrap_or_else(|_| {
        panic!("fixture not found: {}", path.display());
    });
    let raw = parse_drawio(&xml).expect("parse_drawio should succeed");
    let mapping = DrawioMapping::new();
    let (model, _id_map) = mapping.to_domain(&raw).expect("to_domain should succeed");
    let builder = SceneBuilder::new();
    builder.build(&model).expect("build should succeed")
}

/// Returns true if the SVG string is well-formed:
///
/// - Balanced `<svg>...</svg>` tags
/// - Every `&` is followed by a known entity (`amp;`, `lt;`, `gt;`, `quot;`, `apos;`)
fn is_well_formed(svg: &str) -> bool {
    // Check balanced svg tags
    let open_count = svg.matches("<svg").count();
    let close_count = svg.matches("</svg>").count();
    if open_count != close_count {
        return false;
    }

    // Check each & is followed by a valid entity or is part of a numeric entity
    let mut chars = svg.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '&' {
            let rest: String = chars.clone().take(10).collect();
            let valid = rest.starts_with("amp;")
                || rest.starts_with("lt;")
                || rest.starts_with("gt;")
                || rest.starts_with("quot;")
                || rest.starts_with("apos;")
                || rest.starts_with("#");
            if !valid {
                return false;
            }
        }
    }
    true
}

#[test]
fn simple_rect_renders_to_svg() {
    let scene = scene_from_fixture("simple-rect");
    let renderer = SvgRenderer::new();
    let pages = renderer
        .render_pages(&scene)
        .expect("render_pages should succeed");

    assert_eq!(pages.len(), 1, "simple-rect should have exactly one page");

    let svg = &pages[0].1;
    assert!(svg.contains("<rect"), "SVG should contain a rect element");
    assert!(
        svg.contains("fill=\"white\""),
        "SVG should contain white background"
    );
    assert!(
        !svg.contains("vertex#"),
        "SVG should not contain engine IDs"
    );
    assert!(!svg.contains("edge#"), "SVG should not contain engine IDs");
    assert!(!svg.contains("group#"), "SVG should not contain engine IDs");
}

#[test]
fn group_nested_renders_with_clip_path() {
    let scene = scene_from_fixture("group-nested");
    let renderer = SvgRenderer::new();
    let pages = renderer
        .render_pages(&scene)
        .expect("render_pages should succeed");

    assert_eq!(pages.len(), 1, "group-nested should have one page");

    let svg = &pages[0].1;
    assert!(
        svg.contains("clip-path=\"url(#clip_0)\""),
        "Should contain clipped group"
    );
    assert!(svg.contains("<defs>"), "Should contain defs for clip path");
    assert!(svg.contains("</defs>"), "Should close defs tag");
}

#[test]
fn two_pages_renders_all_pages() {
    let scene = scene_from_fixture("two-pages");
    let renderer = SvgRenderer::new();
    let pages = renderer
        .render_pages(&scene)
        .expect("render_pages should succeed");

    assert_eq!(pages.len(), 2, "two-pages should have two pages");

    // Both pages should have their own title
    assert!(
        pages
            .iter()
            .any(|(_, svg)| svg.contains("<title>Page-1</title>")),
        "Should contain Page-1 title"
    );
    assert!(
        pages
            .iter()
            .any(|(_, svg)| svg.contains("<title>Page-2</title>")),
        "Should contain Page-2 title"
    );
}

#[test]
fn rendered_svg_is_well_formed() {
    let scene = scene_from_fixture("simple-rect");
    let renderer = SvgRenderer::new();
    let pages = renderer
        .render_pages(&scene)
        .expect("render_pages should succeed");

    for (page_id, svg) in &pages {
        assert!(
            is_well_formed(svg),
            "SVG for page {:?} should be well-formed, got: {}",
            page_id,
            svg
        );
    }
}

#[test]
fn multi_segment_style_preserves_remaining() {
    let scene = scene_from_fixture("multi-segment-style");
    let renderer = SvgRenderer::new();
    let pages = renderer
        .render_pages(&scene)
        .expect("render_pages should succeed");

    assert_eq!(pages.len(), 1);
    let svg = &pages[0].1;

    // The style attribute should contain the remaining keys from the draw.io style
    // (rounded, html, etc.) in lexicographic order
    assert!(
        svg.contains("style=\""),
        "SVG should contain style attribute for remaining keys"
    );
}

#[test]
fn swimlane_pool_lane_renders_with_header_and_nested_groups() {
    // swimlane-pool-lane.drawio has:
    //   pool  at (10, 10, 700, 400)            — top-level, style=swimlane
    //   lane1 at (0, 0, 700, 120) parent=pool  — relative inside pool
    //   lane2 at (0, 120, 700, 120) parent=pool — relative inside pool
    //   s1    at (20, 40, 120, 60) parent=lane1 — relative inside lane1
    //   s2    at (20, 40, 120, 60) parent=lane2 — relative inside lane2
    //
    // Expected: pool has a header rect (default startSize=40, horizontal=false
    // → top band at pool_origin.y, width=700, height=40).
    let scene = scene_from_fixture("swimlane-pool-lane");
    let renderer = SvgRenderer::new();
    let pages = renderer
        .render_pages(&scene)
        .expect("render_pages should succeed");

    assert_eq!(pages.len(), 1, "swimlane-pool-lane should have one page");
    let svg = &pages[0].1;

    // Header rect must be at the top of the pool (x=10, y=10, w=700, h=40)
    assert!(
        svg.contains(r#"<rect x="10" y="10" width="700" height="40" class="swimlane-header""#),
        "pool header rect must be emitted at (10, 10, 700, 40), got:\n{}",
        svg
    );

    // The header rect is emitted first inside the group's clip-path region
    // (svg should contain clip-path for the pool)
    assert!(
        svg.contains("clip-path=\"url(#clip_0)\""),
        "pool must be clipped, got:\n{}",
        svg
    );

    // Two child shapes must be rendered (s1 in lane1, s2 in lane2)
    // s1 accumulates: pool(10,10) + lane1(0,0) + shape(20,40) = (30, 50)
    // s2 accumulates: pool(10,10) + lane2(0,120) + shape(20,40) = (30, 170)
    assert!(
        svg.contains(r#"<rect x="30" y="50" width="120" height="60""#),
        "s1 must be at accumulated coords (30, 50), got:\n{}",
        svg
    );
    assert!(
        svg.contains(r#"<rect x="30" y="170" width="120" height="60""#),
        "s2 must be at accumulated coords (30, 170), got:\n{}",
        svg
    );
}

#[test]
fn swimlane_flat_renders_with_header_and_child_shapes() {
    // swimlane-flat.drawio has:
    //   pool at (10, 10, 600, 300) — top-level, style=swimlane
    //   s1   at (20, 40, 120, 60) parent=pool — relative
    //   s2   at (160, 40, 120, 60) parent=pool — relative
    //
    // Expected:
    //   pool has header rect at (10, 10, 600, 40)
    //   s1 at accumulated (30, 50)
    //   s2 at accumulated (170, 50)
    let scene = scene_from_fixture("swimlane-flat");
    let renderer = SvgRenderer::new();
    let pages = renderer
        .render_pages(&scene)
        .expect("render_pages should succeed");

    assert_eq!(pages.len(), 1, "swimlane-flat should have one page");
    let svg = &pages[0].1;

    // Header rect at top of pool
    assert!(
        svg.contains(r#"<rect x="10" y="10" width="600" height="40" class="swimlane-header""#),
        "pool header rect must be emitted at (10, 10, 600, 40), got:\n{}",
        svg
    );

    // s1: pool(10,10) + s1(20,40) = (30, 50)
    assert!(
        svg.contains(r#"<rect x="30" y="50" width="120" height="60""#),
        "s1 must be at accumulated coords (30, 50), got:\n{}",
        svg
    );

    // s2: pool(10,10) + s2(160,40) = (170, 50)
    assert!(
        svg.contains(r#"<rect x="170" y="50" width="120" height="60""#),
        "s2 must be at accumulated coords (170, 50), got:\n{}",
        svg
    );

    // Both shapes are inside the pool's clip region
    assert!(
        svg.contains("clip-path=\"url(#clip_0)\""),
        "pool must be clipped, got:\n{}",
        svg
    );
}

#[test]
fn swimlane_golden_snapshots_are_well_formed() {
    // Property-based golden regression guard: render both swimlane fixtures
    // and assert that:
    //   1. The SVG is well-formed XML (balanced tags, valid entities)
    //   2. The output is deterministic across two runs (golden property)
    //   3. Both fixtures produce exactly 1 page each
    //   4. The viewBox captures the pool bounds (10,10 to w+10, h+10)
    let pool_lane_scene = scene_from_fixture("swimlane-pool-lane");
    let flat_scene = scene_from_fixture("swimlane-flat");

    let renderer = SvgRenderer::new();
    let pool_lane_pages_1 = renderer.render_pages(&pool_lane_scene).unwrap();
    let flat_pages_1 = renderer.render_pages(&flat_scene).unwrap();

    // Determinism: re-render and compare byte-for-byte
    let pool_lane_pages_2 = renderer.render_pages(&pool_lane_scene).unwrap();
    let flat_pages_2 = renderer.render_pages(&flat_scene).unwrap();
    assert_eq!(
        pool_lane_pages_1[0].1, pool_lane_pages_2[0].1,
        "swimlane-pool-lane render must be deterministic"
    );
    assert_eq!(
        flat_pages_1[0].1, flat_pages_2[0].1,
        "swimlane-flat render must be deterministic"
    );

    // Both fixtures produce 1 page each
    assert_eq!(pool_lane_pages_1.len(), 1);
    assert_eq!(flat_pages_1.len(), 1);

    // Both SVGs are well-formed
    assert!(
        is_well_formed(&pool_lane_pages_1[0].1),
        "swimlane-pool-lane SVG is not well-formed:\n{}",
        pool_lane_pages_1[0].1
    );
    assert!(
        is_well_formed(&flat_pages_1[0].1),
        "swimlane-flat SVG is not well-formed:\n{}",
        flat_pages_1[0].1
    );

    // viewBox captures the pool bounds
    assert!(
        pool_lane_pages_1[0]
            .1
            .contains(r#"viewBox="10 10 700 400""#),
        "swimlane-pool-lane viewBox should be 10 10 700 400, got:\n{}",
        pool_lane_pages_1[0].1
    );
    assert!(
        flat_pages_1[0].1.contains(r#"viewBox="10 10 600 300""#),
        "swimlane-flat viewBox should be 10 10 600 300, got:\n{}",
        flat_pages_1[0].1
    );
}
