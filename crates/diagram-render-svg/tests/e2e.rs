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
        svg.contains("<g clip-path=\"url(#clip_0)\">"),
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
