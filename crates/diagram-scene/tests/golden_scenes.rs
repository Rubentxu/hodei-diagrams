//! Golden scene integration tests — PR 3: diagram-scene
//!
//! Tests the full projection pipeline: `DiagramModel` → `SceneBuilder::build` → `Scene`.
//!
//! ## Snapshot strategy (std-only, no insta)
//!
//! Assertions check structural properties — element counts, variant types,
//! geometry fields, and style fields — using pure in-memory comparisons.
//! A deterministic string helper (`scene_to_string`) lets us assert equality
//! of entire scenes without serializing to disk.
//!
//! ## Test model construction
//!
//! All models are built **programmatically** using `diagram-core` types.
//! This keeps the tests independent of `diagram-format-drawio`, consistent
//! with ADR-0015 (scene does not depend on format).

use diagram_core::label::Label;
use diagram_core::{CellGeometry, DiagramModel, Edge, Group, Page, StyleMap, Vertex};
use diagram_scene::{EntityId, ResolvedStyle, Scene, SceneBuilder, SceneError, VisualElement};

/// Helper: construct a `CellGeometry` with the given fields.
fn geom(x: f64, y: f64, w: f64, h: f64, relative: bool) -> CellGeometry {
    CellGeometry {
        x,
        y,
        width: w,
        height: h,
        relative,
        ..Default::default()
    }
}

/// Helper: build a model with one page and return its ID.
fn single_page_model() -> (DiagramModel, diagram_core::PageId) {
    let mut model = DiagramModel::new();
    let page = Page::new(diagram_core::PageId::default());
    let pid = model.store.insert_page(page.clone());
    // Fix up Page.id to match the slotmap key
    let mut p = page;
    p.id = pid;
    model.store.replace_page(pid, p);
    (model, pid)
}

/// Helper: build a model with two pages and return their IDs.
fn two_page_model() -> (DiagramModel, diagram_core::PageId, diagram_core::PageId) {
    let mut model = DiagramModel::new();

    let page1 = Page::new(diagram_core::PageId::default());
    let pid1 = model.store.insert_page(page1.clone());
    let mut p1 = page1;
    p1.id = pid1;
    model.store.replace_page(pid1, p1);

    let page2 = Page::new(diagram_core::PageId::default());
    let pid2 = model.store.insert_page(page2.clone());
    let mut p2 = page2;
    p2.id = pid2;
    model.store.replace_page(pid2, p2);

    (model, pid1, pid2)
}

/// Produce a deterministic multi-line string representation of a `Scene`.
///
/// Format (stable, noarbitrary serialization):
/// ```text
/// scene pages=N
/// page id=page#0x1 name=Page-1 size=850x1100
///   rect id=vertex#0x2 bounds=(0,0,80,40) style=...
///   text owner=vertex#0x2 text="hello" anchor=(0,0)
/// ```
fn scene_to_string(scene: &Scene) -> String {
    let mut out = String::new();
    out.push_str(&format!("scene pages={}\n", scene.pages.len()));
    for page in &scene.pages {
        out.push_str(&format!(
            "page id={} name={} size={}x{}\n",
            page.page_id, page.name, page.width, page.height
        ));
        for elem in &page.display_list {
            append_element(&mut out, elem, "  ");
        }
    }
    out
}

fn append_element(out: &mut String, elem: &VisualElement, indent: &str) {
    match elem {
        VisualElement::Rect(r) => {
            out.push_str(indent);
            out.push_str(&format!(
                "rect id={} bounds=({},{},{},{}) style={}\n",
                r.id,
                r.bounds.origin.x,
                r.bounds.origin.y,
                r.bounds.size.width,
                r.bounds.size.height,
                resolved_style_to_string(&r.style),
            ));
        }
        VisualElement::RoundedRect(r) => {
            out.push_str(indent);
            out.push_str(&format!(
                "rounded_rect id={} bounds=({},{},{},{}) radius={} style={}\n",
                r.id,
                r.bounds.origin.x,
                r.bounds.origin.y,
                r.bounds.size.width,
                r.bounds.size.height,
                r.radius,
                resolved_style_to_string(&r.style),
            ));
        }
        VisualElement::Ellipse(e) => {
            out.push_str(indent);
            out.push_str(&format!(
                "ellipse id={} bounds=({},{},{},{}) style={}\n",
                e.id,
                e.bounds.origin.x,
                e.bounds.origin.y,
                e.bounds.size.width,
                e.bounds.size.height,
                resolved_style_to_string(&e.style),
            ));
        }
        VisualElement::Text(t) => {
            out.push_str(indent);
            let owner_str = match t.owner {
                EntityId::Vertex(vid) => format!("{}", vid),
                EntityId::Edge(eid) => format!("{}", eid),
                EntityId::Group(gid) => format!("{}", gid),
                _ => "unknown".to_string(),
            };
            out.push_str(&format!(
                "text owner={} text={:?} anchor=({},{}) style={}\n",
                owner_str,
                t.text,
                t.anchor.x,
                t.anchor.y,
                resolved_style_to_string(&t.style),
            ));
        }
        VisualElement::Line(l) => {
            out.push_str(indent);
            out.push_str(&format!(
                "line id={} from=({},{}) to=({},{}) style={}\n",
                l.id,
                l.from.x,
                l.from.y,
                l.to.x,
                l.to.y,
                resolved_style_to_string(&l.style),
            ));
        }
        VisualElement::Path(p) => {
            out.push_str(indent);
            let points_str: Vec<String> = p
                .points
                .iter()
                .map(|pt| format!("({},{})", pt.x, pt.y))
                .collect();
            out.push_str(&format!(
                "path id={} points=[{}] style={}\n",
                p.id,
                points_str.join(", "),
                resolved_style_to_string(&p.style),
            ));
        }
        VisualElement::Group(g) => {
            out.push_str(indent);
            out.push_str(&format!(
                "group id={} bounds=({},{},{},{}) clip={} style={}\n",
                g.id,
                g.bounds.origin.x,
                g.bounds.origin.y,
                g.bounds.size.width,
                g.bounds.size.height,
                g.clip,
                resolved_style_to_string(&g.style),
            ));
            for child in &g.children {
                append_element(out, child, &format!("{indent}  "));
            }
        }
        _ => {
            out.push_str(indent);
            out.push_str("unknown_element\n");
        }
    }
}

fn resolved_style_to_string(s: &ResolvedStyle) -> String {
    format!(
        "ResolvedStyle{{ fill={:?} stroke={:?} stroke_width={:?} rounded={:?} dashed={:?} font_color={:?} font_size={:?} font_family={:?} opacity={:?} remaining={} }}",
        s.fill_color,
        s.stroke_color,
        s.stroke_width,
        s.rounded,
        s.dashed,
        s.font_color,
        s.font_size,
        s.font_family,
        s.opacity,
        s.remaining.len(),
    )
}

// ─── Golden tests ────────────────────────────────────────────────────────────────

/// Test: build scene from a simple rect model (programmatically constructed).
/// Verifies one page, one Rect element, correct bounds.
#[test]
fn golden_simple_rect() {
    let (mut model, pid) = single_page_model();

    let v_geom = geom(0.0, 0.0, 80.0, 40.0, false);
    let vertex = Vertex {
        geometry: Some(v_geom),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_vertex(vertex);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();

    // One page
    assert_eq!(scene.pages.len(), 1, "Expected exactly one page");
    let page = &scene.pages[0];

    // Display list has exactly one element
    assert_eq!(page.display_list.len(), 1, "Expected exactly one element");

    // It's a Rect
    let elem = &page.display_list[0];
    let rect = match elem {
        VisualElement::Rect(r) => r,
        other => panic!("Expected Rect, got {:?}", other),
    };

    // Bounds match
    assert_eq!(rect.bounds.origin.x, 0.0);
    assert_eq!(rect.bounds.origin.y, 0.0);
    assert_eq!(rect.bounds.size.width, 80.0);
    assert_eq!(rect.bounds.size.height, 40.0);

    // Default style is empty
    assert!(rect.style.is_empty());
}

/// Test: scene from model with styled vertex → RoundedRect with correct style.
#[test]
fn golden_vertex_rect_with_style() {
    let (mut model, pid) = single_page_model();

    // Create style with fillColor, strokeColor, rounded=1
    let mut style = StyleMap::new();
    style.insert("fillColor", "#dae8fc");
    style.insert("strokeColor", "#000000");
    style.insert("rounded", "1");
    let style_id = model.store.insert_style(style);

    let v_geom = geom(10.0, 20.0, 100.0, 60.0, false);
    let vertex = Vertex {
        geometry: Some(v_geom),
        style_id: Some(style_id),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_vertex(vertex);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();

    let page = &scene.pages[0];
    assert_eq!(page.display_list.len(), 1);

    match &page.display_list[0] {
        VisualElement::RoundedRect(r) => {
            assert_eq!(r.radius, 8.0, "Default rounded radius should be 8.0");
            assert_eq!(r.style.fill_color.as_deref(), Some("#dae8fc"));
            assert_eq!(r.style.stroke_color.as_deref(), Some("#000000"));
            assert_eq!(r.style.rounded, Some(true));
            // remaining should be empty — no unknown keys in this style
            assert!(
                r.style.remaining.is_empty(),
                "remaining should be empty, got {:?}",
                r.style.remaining
            );
        }
        other => panic!("Expected RoundedRect, got {:?}", other),
    }
}

/// Test: scene from model with edge → Line element with correct endpoints.
#[test]
fn golden_edge_connect() {
    let (mut model, pid) = single_page_model();

    // Vertex 1: center at (40, 20) within its bounds (0,0,80,40)
    let v1_geom = geom(0.0, 0.0, 80.0, 40.0, false);
    let v1 = Vertex {
        geometry: Some(v1_geom),
        page_id: Some(pid),
        ..Default::default()
    };
    let vid1 = model.store.insert_vertex(v1);

    // Vertex 2: center at (120, 80) within its bounds (80,60,80,40)
    let v2_geom = geom(80.0, 60.0, 80.0, 40.0, false);
    let v2 = Vertex {
        geometry: Some(v2_geom),
        page_id: Some(pid),
        ..Default::default()
    };
    let vid2 = model.store.insert_vertex(v2);

    // Edge connecting them
    let edge = Edge {
        source: vid1,
        target: vid2,
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_edge(edge);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();

    let page = &scene.pages[0];
    // 2 vertices + 1 edge = 3 elements
    assert_eq!(page.display_list.len(), 3);

    // Find the Line element
    let line = page
        .display_list
        .iter()
        .find_map(|e| match e {
            VisualElement::Line(l) => Some(l),
            _ => None,
        })
        .expect("Expected a Line element");

    // v1 center: (0 + 80/2, 0 + 40/2) = (40, 20)
    assert_eq!(line.from.x, 40.0);
    assert_eq!(line.from.y, 20.0);

    // v2 center: (80 + 80/2, 60 + 40/2) = (120, 80)
    assert_eq!(line.to.x, 120.0);
    assert_eq!(line.to.y, 80.0);
}

/// Test: empty page → one page with empty display list.
#[test]
fn golden_empty_page() {
    let (model, _pid) = single_page_model();

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();

    assert_eq!(scene.pages.len(), 1, "Should have one page");
    let page = &scene.pages[0];
    assert!(
        page.display_list.is_empty(),
        "Display list should be empty, got {} elements",
        page.display_list.len()
    );
}

/// Test: two pages → scene with two pages, each non-empty.
#[test]
fn golden_two_pages() {
    let (mut model, pid1, pid2) = two_page_model();

    // Add a vertex to page 1
    let v1_geom = geom(0.0, 0.0, 50.0, 50.0, false);
    let v1 = Vertex {
        geometry: Some(v1_geom),
        page_id: Some(pid1),
        ..Default::default()
    };
    model.store.insert_vertex(v1);

    // Add a vertex to page 2
    let v2_geom = geom(100.0, 100.0, 60.0, 40.0, false);
    let v2 = Vertex {
        geometry: Some(v2_geom),
        page_id: Some(pid2),
        ..Default::default()
    };
    model.store.insert_vertex(v2);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();

    assert_eq!(scene.pages.len(), 2, "Should have two pages");

    let page1 = scene.pages.iter().find(|p| p.page_id == pid1).unwrap();
    let page2 = scene.pages.iter().find(|p| p.page_id == pid2).unwrap();

    assert!(
        !page1.display_list.is_empty(),
        "Page 1 should have elements"
    );
    assert!(
        !page2.display_list.is_empty(),
        "Page 2 should have elements"
    );
}

/// Test: group with child vertex → Group element with correct child bounds.
#[test]
fn golden_group_nested() {
    let (mut model, pid) = single_page_model();

    // Group at (10, 10) with size 200x200
    let group_geom = geom(10.0, 10.0, 200.0, 200.0, false);
    let group = Group {
        geometry: Some(group_geom),
        page_id: Some(pid),
        ..Default::default()
    };
    let gid = model.store.insert_group(group);

    // Child vertex with parent=Some(gid) and relative=true, at local (20, 20)
    let child_geom = geom(20.0, 20.0, 80.0, 40.0, true);
    let child = Vertex {
        geometry: Some(child_geom),
        parent: Some(gid),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_vertex(child);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();

    let page = &scene.pages[0];
    assert_eq!(
        page.display_list.len(),
        1,
        "Should have one top-level element"
    );

    match &page.display_list[0] {
        VisualElement::Group(g) => {
            assert_eq!(g.bounds.origin.x, 10.0, "Group origin.x should be 10");
            assert_eq!(g.bounds.origin.y, 10.0, "Group origin.y should be 10");
            assert_eq!(g.children.len(), 1, "Group should have exactly 1 child");

            // Child origin should be (10+20, 10+20) = (30, 30) in page coords
            match &g.children[0] {
                VisualElement::Rect(r) => {
                    assert_eq!(
                        r.bounds.origin.x, 30.0,
                        "Child origin.x should be 30 (10+20)"
                    );
                    assert_eq!(
                        r.bounds.origin.y, 30.0,
                        "Child origin.y should be 30 (10+20)"
                    );
                }
                other => panic!("Expected Rect child, got {:?}", other),
            }
        }
        other => panic!("Expected Group element, got {:?}", other),
    }
}

/// Test: style with unknown key → `remaining` preserves the unknown key (ADR-0024).
#[test]
fn golden_multi_segment_style_preserves_unknown() {
    let (mut model, pid) = single_page_model();

    // Style with a known key and an unknown key
    let mut style = StyleMap::new();
    style.insert("fillColor", "#ffffff");
    style.insert("customKey", "customValue");
    let style_id = model.store.insert_style(style);

    let v_geom = geom(0.0, 0.0, 50.0, 50.0, false);
    let vertex = Vertex {
        geometry: Some(v_geom),
        style_id: Some(style_id),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_vertex(vertex);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();

    let page = &scene.pages[0];
    match &page.display_list[0] {
        VisualElement::Rect(r) => {
            // Known key is resolved
            assert_eq!(
                r.style.fill_color.as_deref(),
                Some("#ffffff"),
                "fillColor should be resolved"
            );
            // Unknown key is preserved in remaining
            assert_eq!(
                r.style.remaining.len(),
                1,
                "remaining should have exactly 1 entry"
            );
            assert_eq!(
                r.style.remaining.get("customKey").map(|v| v.as_str()),
                Some("customValue"),
                "customKey should be preserved in remaining"
            );
        }
        other => panic!("Expected Rect, got {:?}", other),
    }
}

/// Test: dangling edge is dropped at parse time by DrawioMapping,
/// so the built scene contains no edge. Pin this documented behavior.
#[test]
fn golden_dangling_edge_dropped_or_errored() {
    let (mut model, pid) = single_page_model();

    // Valid vertex
    let v_geom = geom(0.0, 0.0, 50.0, 50.0, false);
    let v = Vertex {
        geometry: Some(v_geom),
        page_id: Some(pid),
        ..Default::default()
    };
    let vid = model.store.insert_vertex(v);

    // Edge whose source is a dangling (non-existent) VertexId
    // This would be caught by SceneBuilder and return DanglingEdgeSource.
    // NOTE: In practice, format crates drop such edges at parse time,
    // but SceneBuilder itself validates and returns an error.
    let edge = Edge {
        source: diagram_core::VertexId::default(), // dangling
        target: vid,
        page_id: Some(pid),
        ..Default::default()
    };
    let _eid = model.store.insert_edge(edge);

    let builder = SceneBuilder::new();
    let result = builder.build(&model);

    // SceneBuilder should return an error for the dangling edge source
    assert!(result.is_err(), "Expected error for dangling edge source");
    match result.unwrap_err() {
        SceneError::DanglingEdgeSource(_) => {}
        other => panic!("Expected DanglingEdgeSource error, got {:?}", other),
    }
}

// ─── Determinism tests ─────────────────────────────────────────────────────────

/// Test: building the same model twice yields structurally equal scenes.
#[test]
fn idempotent_build_returns_equal_scenes() {
    let (mut model, pid) = single_page_model();

    let v_geom = geom(0.0, 0.0, 80.0, 40.0, false);
    let vertex = Vertex {
        geometry: Some(v_geom),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_vertex(vertex);

    let builder = SceneBuilder::new();

    let scene_a = builder.build(&model).unwrap();
    let scene_b = builder.build(&model).unwrap();

    // Structural equality via our deterministic string representation
    let a_str = scene_to_string(&scene_a);
    let b_str = scene_to_string(&scene_b);

    assert_eq!(
        a_str, b_str,
        "Two builds of the same model should produce identical scene strings"
    );

    // Also verify pages.len and display_list.len match
    assert_eq!(scene_a.pages.len(), scene_b.pages.len());
    for (pa, pb) in scene_a.pages.iter().zip(scene_b.pages.iter()) {
        assert_eq!(pa.display_list.len(), pb.display_list.len());
    }
}

/// Test: SceneBuilder::build does not mutate the model.
#[test]
fn build_does_not_mutate_model() {
    let (mut model, pid) = single_page_model();

    let v_geom = geom(0.0, 0.0, 80.0, 40.0, false);
    let vertex = Vertex {
        geometry: Some(v_geom),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_vertex(vertex);

    // Capture model state before build
    let vertex_count_before = model.store.len_vertex();
    let edge_count_before = model.store.len_edge();
    let group_count_before = model.store.len_group();
    let page_count_before = model.store.page_count();
    let style_count_before = model.store.len_style();

    let builder = SceneBuilder::new();
    let _scene = builder.build(&model).unwrap();

    // State unchanged
    assert_eq!(
        model.store.len_vertex(),
        vertex_count_before,
        "Vertex count should not change"
    );
    assert_eq!(
        model.store.len_edge(),
        edge_count_before,
        "Edge count should not change"
    );
    assert_eq!(
        model.store.len_group(),
        group_count_before,
        "Group count should not change"
    );
    assert_eq!(
        model.store.page_count(),
        page_count_before,
        "Page count should not change"
    );
    assert_eq!(
        model.store.len_style(),
        style_count_before,
        "Style count should not change"
    );
}

/// Test: three successive builds produce byte-identical scene string output.
#[test]
fn build_deterministic_three_runs() {
    let (mut model, pid) = single_page_model();

    // Add vertex with style to have a non-trivial scene
    let mut style = StyleMap::new();
    style.insert("fillColor", "#dae8fc");
    style.insert("strokeColor", "#000000");
    let style_id = model.store.insert_style(style);

    let v_geom = geom(0.0, 0.0, 80.0, 40.0, false);
    let vertex = Vertex {
        geometry: Some(v_geom),
        style_id: Some(style_id),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_vertex(vertex);

    let builder = SceneBuilder::new();

    let scene1 = builder.build(&model).unwrap();
    let scene2 = builder.build(&model).unwrap();
    let scene3 = builder.build(&model).unwrap();

    let s1 = scene_to_string(&scene1);
    let s2 = scene_to_string(&scene2);
    let s3 = scene_to_string(&scene3);

    assert_eq!(s1, s2, "First and second builds should match");
    assert_eq!(s2, s3, "Second and third builds should match");
    assert_eq!(s1, s3, "First and third builds should match");
}

// ─── Error path tests ──────────────────────────────────────────────────────────

/// Test: model with a vertex missing geometry → MissingGeometry error.
#[test]
fn build_handles_missing_geometry() {
    let (mut model, pid) = single_page_model();

    // Vertex WITHOUT geometry
    let vertex = Vertex {
        geometry: None,
        page_id: Some(pid),
        ..Default::default()
    };
    let vid = model.store.insert_vertex(vertex);

    // Also add a valid edge so we can verify the error stops before edge processing
    let v_geom = geom(0.0, 0.0, 50.0, 50.0, false);
    let v2 = Vertex {
        geometry: Some(v_geom),
        page_id: Some(pid),
        ..Default::default()
    };
    let vid2 = model.store.insert_vertex(v2);
    let edge = Edge {
        source: vid2,
        target: vid2,
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_edge(edge);

    let builder = SceneBuilder::new();
    let result = builder.build(&model);

    assert!(
        result.is_err(),
        "Expected error when vertex has no geometry"
    );
    match result.unwrap_err() {
        SceneError::MissingGeometry(v) => {
            assert_eq!(v, vid, "Error should reference the vertex missing geometry");
        }
        other => panic!("Expected MissingGeometry error, got {:?}", other),
    }
}

/// Test: model with a group missing geometry → MissingGroupGeometry error.
#[test]
fn build_handles_missing_group_geometry() {
    let (mut model, pid) = single_page_model();

    // Group without geometry
    let group = Group {
        geometry: None,
        page_id: Some(pid),
        ..Default::default()
    };
    let gid = model.store.insert_group(group);

    let builder = SceneBuilder::new();
    let result = builder.build(&model);

    assert!(result.is_err(), "Expected error when group has no geometry");
    match result.unwrap_err() {
        SceneError::MissingGroupGeometry(g) => {
            assert_eq!(g, gid, "Error should reference the group missing geometry");
        }
        other => panic!("Expected MissingGroupGeometry error, got {:?}", other),
    }
}

/// Test: edge whose target vertex has no geometry → MissingGeometry error.
#[test]
fn build_edge_to_vertex_without_geometry() {
    let (mut model, pid) = single_page_model();

    // Valid source vertex
    let src_geom = geom(0.0, 0.0, 50.0, 50.0, false);
    let src = Vertex {
        geometry: Some(src_geom),
        page_id: Some(pid),
        ..Default::default()
    };
    let src_vid = model.store.insert_vertex(src);

    // Target vertex WITHOUT geometry
    let tgt = Vertex {
        geometry: None,
        page_id: Some(pid),
        ..Default::default()
    };
    let tgt_vid = model.store.insert_vertex(tgt);

    let edge = Edge {
        source: src_vid,
        target: tgt_vid,
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_edge(edge);

    let builder = SceneBuilder::new();
    let result = builder.build(&model);

    assert!(
        result.is_err(),
        "Expected error when target vertex has no geometry"
    );
    match result.unwrap_err() {
        SceneError::MissingGeometry(v) => {
            assert_eq!(
                v, tgt_vid,
                "Error should reference the target vertex missing geometry"
            );
        }
        other => panic!("Expected MissingGeometry error, got {:?}", other),
    }
}

// ─── Additional structural property tests ───────────────────────────────────────

/// Test: vertex with label → display list has Rect followed by Text.
#[test]
fn golden_vertex_with_label() {
    let (mut model, pid) = single_page_model();

    let v_geom = geom(10.0, 20.0, 80.0, 40.0, false);
    let vertex = Vertex {
        geometry: Some(v_geom),
        label: Some(Label::new("hello")),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_vertex(vertex);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();

    let page = &scene.pages[0];
    assert_eq!(
        page.display_list.len(),
        2,
        "Should have 2 elements: Rect + Text"
    );

    match &page.display_list[0] {
        VisualElement::Rect(r) => {
            assert_eq!(r.bounds.origin.x, 10.0);
        }
        other => panic!("Expected Rect first, got {:?}", other),
    }

    match &page.display_list[1] {
        VisualElement::Text(t) => {
            assert_eq!(t.text, "hello");
            assert_eq!(t.anchor.x, 10.0, "Text anchor should be at vertex top-left");
            assert_eq!(t.anchor.y, 20.0);
        }
        other => panic!("Expected Text second, got {:?}", other),
    }
}

/// Test: two vertices on same page appear in insertion order (z-order preserved).
#[test]
fn golden_z_order_preserved() {
    let (mut model, pid) = single_page_model();

    let v1_geom = geom(0.0, 0.0, 50.0, 50.0, false);
    let v1 = Vertex {
        geometry: Some(v1_geom),
        page_id: Some(pid),
        ..Default::default()
    };
    let _vid1 = model.store.insert_vertex(v1);

    let v2_geom = geom(100.0, 0.0, 50.0, 50.0, false);
    let v2 = Vertex {
        geometry: Some(v2_geom),
        page_id: Some(pid),
        ..Default::default()
    };
    let _vid2 = model.store.insert_vertex(v2);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();

    let page = &scene.pages[0];
    assert_eq!(page.display_list.len(), 2);

    // Check x positions reflect insertion order
    match &page.display_list[0] {
        VisualElement::Rect(r) => {
            assert_eq!(
                r.bounds.origin.x, 0.0,
                "First element should be at x=0 (first inserted)"
            );
        }
        other => panic!("Expected Rect, got {:?}", other),
    }
    match &page.display_list[1] {
        VisualElement::Rect(r) => {
            assert_eq!(
                r.bounds.origin.x, 100.0,
                "Second element should be at x=100 (second inserted)"
            );
        }
        other => panic!("Expected Rect, got {:?}", other),
    }
}

/// Test: style with all known keys → all typed fields populated, remaining empty.
#[test]
fn golden_full_style_resolution() {
    let (mut model, pid) = single_page_model();

    let mut style = StyleMap::new();
    style.insert("fillColor", "#ff0000");
    style.insert("strokeColor", "#00ff00");
    style.insert("strokeWidth", "3");
    style.insert("rounded", "1");
    style.insert("dashed", "1");
    style.insert("fontColor", "#0000ff");
    style.insert("fontSize", "14");
    style.insert("fontFamily", "Arial");
    style.insert("opacity", "0.5");
    let style_id = model.store.insert_style(style);

    let v_geom = geom(0.0, 0.0, 100.0, 50.0, false);
    let vertex = Vertex {
        geometry: Some(v_geom),
        style_id: Some(style_id),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_vertex(vertex);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();

    let page = &scene.pages[0];
    match &page.display_list[0] {
        VisualElement::RoundedRect(r) => {
            assert_eq!(r.style.fill_color.as_deref(), Some("#ff0000"));
            assert_eq!(r.style.stroke_color.as_deref(), Some("#00ff00"));
            assert_eq!(r.style.stroke_width, Some(3.0));
            assert_eq!(r.style.rounded, Some(true));
            assert_eq!(r.style.dashed, Some(true));
            assert_eq!(r.style.font_color.as_deref(), Some("#0000ff"));
            assert_eq!(r.style.font_size, Some(14.0));
            assert_eq!(r.style.font_family.as_deref(), Some("Arial"));
            assert_eq!(r.style.opacity, Some(0.5));
            assert!(
                r.style.remaining.is_empty(),
                "remaining should be empty with all known keys"
            );
        }
        other => panic!("Expected RoundedRect (rounded=1), got {:?}", other),
    }
}

/// Test: edge label projects a Text element at the midpoint of the edge.
#[test]
fn golden_edge_with_label() {
    let (mut model, pid) = single_page_model();

    let v1_geom = geom(0.0, 0.0, 80.0, 40.0, false);
    let v1 = Vertex {
        geometry: Some(v1_geom),
        page_id: Some(pid),
        ..Default::default()
    };
    let vid1 = model.store.insert_vertex(v1);

    let v2_geom = geom(200.0, 0.0, 80.0, 40.0, false);
    let v2 = Vertex {
        geometry: Some(v2_geom),
        page_id: Some(pid),
        ..Default::default()
    };
    let vid2 = model.store.insert_vertex(v2);

    let edge = Edge {
        source: vid1,
        target: vid2,
        label: Some(Label::new("connects")),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_edge(edge);

    let builder = SceneBuilder::new();
    let scene = builder.build(&model).unwrap();

    let page = &scene.pages[0];
    // 2 vertices + 1 edge + 1 edge label = 4 elements
    assert_eq!(page.display_list.len(), 4);

    // Find the Text element owned by the edge
    let text_elem = page
        .display_list
        .iter()
        .find(|e| match e {
            VisualElement::Text(t) => matches!(t.owner, EntityId::Edge(_)),
            _ => false,
        })
        .expect("Expected a Text element for the edge label");

    match text_elem {
        VisualElement::Text(t) => {
            assert_eq!(t.text, "connects");
            // Midpoint: ((0+40)+(200+40))/2, (0+20+0+20)/2 = (140, 20)
            // from = (40, 20), to = (240, 20), midpoint = (140, 20)
            assert_eq!(t.anchor.x, 140.0, "Edge label anchor x should be midpoint");
            assert_eq!(t.anchor.y, 20.0, "Edge label anchor y should be midpoint");
        }
        _ => unreachable!(),
    }
}
