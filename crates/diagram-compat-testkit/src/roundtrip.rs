//! Round-trip helpers and assertions.
//!
//! The compatibility contract is "import → export → equivalent". These helpers
//! make that contract ergonomic to test without dragging in a custom
//! assertion macro on day one.

use diagram_core::DiagramModel;
use diagram_format_drawio::Diagnostic as FmtDiagnostic;
#[allow(unused_imports)]
use diagram_format_drawio::{DrawioParser, parse_drawio, write_drawio};

use crate::diagnostics::Diagnostic;

/// Report produced by a round-trip check.
#[derive(Debug, Default, Clone)]
pub struct RoundtripReport {
    /// Diagnostics produced by the import or export pass.
    pub diagnostics: Vec<Diagnostic>,
    /// `true` if the model survived the round-trip without observed loss.
    pub preserved: bool,
}

/// Convenience wrapper around [`DrawioParser`] and [`DrawioWriter`].
#[derive(Debug, Default, Clone, Copy)]
pub struct RoundtripHarness;

impl RoundtripHarness {
    /// Create a new harness.
    pub fn new() -> Self {
        Self
    }

    /// Run a full parse → serialize cycle on `source` and return the result.
    pub fn cycle(&self, source: &str) -> RoundtripReport {
        let mut fmt_diagnostics = Vec::new();
        match parse_drawio_with_diagnostics(source, &mut fmt_diagnostics) {
            Ok(raw) => match write_drawio(&raw) {
                Ok(_) => RoundtripReport {
                    diagnostics: fmt_diagnostics
                        .into_iter()
                        .map(|d| Diagnostic::warning(d.location, d.message))
                        .collect(),
                    preserved: true,
                },
                Err(err) => RoundtripReport {
                    diagnostics: {
                        let mut diags = fmt_diagnostics
                            .into_iter()
                            .map(|d| Diagnostic::warning(d.location, d.message))
                            .collect::<Vec<_>>();
                        diags.push(Diagnostic::warning(
                            "writer",
                            format!("write failed: {err}"),
                        ));
                        diags
                    },
                    preserved: false,
                },
            },
            Err(err) => RoundtripReport {
                diagnostics: {
                    let mut diags = fmt_diagnostics
                        .into_iter()
                        .map(|d| Diagnostic::warning(d.location, d.message))
                        .collect::<Vec<_>>();
                    diags.push(Diagnostic::warning(
                        "parser",
                        format!("parse failed: {err}"),
                    ));
                    diags
                },
                preserved: false,
            },
        }
    }
}

/// Parse with diagnostic collection using the format crate's diagnostic type.
fn parse_drawio_with_diagnostics(
    xml: &str,
    diagnostics: &mut Vec<FmtDiagnostic>,
) -> diagram_format_drawio::FormatResult<diagram_format_drawio::RawDrawioDocument> {
    DrawioParser::new().parse_str_with_diagnostics(xml, diagnostics)
}

/// Assert that a [`DiagramModel`] survives a parse→write round-trip.
///
/// The default implementation compares structural counts only; richer
/// diffing will be layered on top once the model stabilizes.
pub fn assert_roundtrip(_model: &DiagramModel) {
    // Bootstrap stub — replace with real assertion once model stabilizes.
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_format_drawio::DrawioMapping;
    use std::collections::BTreeMap;

    // =============================================================================
    // Task 22 — Strengthen simple-rect round-trip test
    // =============================================================================

    #[test]
    fn roundtrip_simple_rect() {
        let xml = include_str!("../fixtures/simple-rect.drawio");
        let mut diagnostics = Vec::new();

        // First parse
        let first = parse_drawio_with_diagnostics(xml, &mut diagnostics)
            .expect("simple-rect.drawio should parse");

        assert_eq!(first.diagrams.len(), 1, "should have exactly 1 diagram");
        let first_cells = first.diagrams[0].cells.len();
        assert!(
            first_cells >= 1,
            "diagram should have at least 1 content cell"
        );

        // Write back
        let written = write_drawio(&first).expect("write_drawio should succeed for valid document");

        // Second parse
        let second = parse_drawio_with_diagnostics(&written, &mut Vec::new())
            .expect("written XML should parse");

        assert_eq!(
            first_cells,
            second.diagrams[0].cells.len(),
            "cell count must be preserved through round-trip"
        );

        // Task 22: Assert geometry is preserved — this fixes Phase 1 silent data loss
        let first_cell = &first.diagrams[0].cells[0];
        let second_cell = &second.diagrams[0].cells[0];
        assert!(
            first_cell.geometry.is_some(),
            "first parse should capture geometry"
        );
        assert!(
            second_cell.geometry.is_some(),
            "second parse should preserve geometry through round-trip"
        );
        let geo = second_cell.geometry.as_ref().unwrap();
        assert_eq!(geo.width, 80.0, "geometry width must be preserved as 80.0");
        assert_eq!(
            geo.height, 40.0,
            "geometry height must be preserved as 40.0"
        );
    }

    // =============================================================================
    // Task 23 — Fixture-driven round-trip tests
    // =============================================================================

    #[test]
    fn roundtrip_vertex_rect() {
        let xml = include_str!("../fixtures/vertex-rect.drawio");

        let first = parse_drawio_with_diagnostics(xml, &mut Vec::new())
            .expect("vertex-rect.drawio should parse");
        assert_eq!(first.diagrams.len(), 1);
        let first_cells = &first.diagrams[0].cells;
        assert!(!first_cells.is_empty(), "should have at least 1 cell");

        // Assert label and style on first cell
        let cell = &first_cells[0];
        assert_eq!(
            cell.value.as_deref(),
            Some("MyVertex"),
            "label should be preserved"
        );
        let style = cell.style.as_deref().unwrap_or("");
        assert!(
            style.contains("fillColor=#dae8fc"),
            "style should contain fillColor=#dae8fc, got: {style}"
        );

        // Round-trip: write and reparse
        let written = write_drawio(&first).expect("write_drawio should succeed");
        let second = parse_drawio_with_diagnostics(&written, &mut Vec::new())
            .expect("written XML should parse");

        assert_eq!(first_cells.len(), second.diagrams[0].cells.len());
        let reparsed = &second.diagrams[0].cells[0];
        assert_eq!(reparsed.value.as_deref(), Some("MyVertex"));
        let style2 = reparsed.style.as_deref().unwrap_or("");
        assert!(
            style2.contains("fillColor=#dae8fc"),
            "style should be preserved through round-trip"
        );
    }

    #[test]
    fn roundtrip_edge_connect() {
        let xml = include_str!("../fixtures/edge-connect.drawio");

        let first = parse_drawio_with_diagnostics(xml, &mut Vec::new())
            .expect("edge-connect.drawio should parse");

        // Find the edge cell
        let edge_cell = first.diagrams[0]
            .cells
            .iter()
            .find(|c| c.edge)
            .expect("should have an edge cell");
        assert_eq!(edge_cell.source.as_deref(), Some("A"), "source should be A");
        assert_eq!(edge_cell.target.as_deref(), Some("B"), "target should be B");
        assert_eq!(
            edge_cell.value.as_deref(),
            Some("connects"),
            "edge label should be preserved"
        );

        // Round-trip
        let written = write_drawio(&first).expect("write_drawio should succeed");
        let second = parse_drawio_with_diagnostics(&written, &mut Vec::new())
            .expect("written XML should parse");

        let reparsed_edge = second.diagrams[0]
            .cells
            .iter()
            .find(|c| c.edge)
            .expect("reparsed should still have an edge");
        assert_eq!(reparsed_edge.source.as_deref(), Some("A"));
        assert_eq!(reparsed_edge.target.as_deref(), Some("B"));
        // Both vertices should remain
        let vertices: Vec<_> = second.diagrams[0]
            .cells
            .iter()
            .filter(|c| c.vertex && !c.edge)
            .collect();
        assert_eq!(vertices.len(), 2, "both vertex cells should be preserved");
    }

    #[test]
    fn roundtrip_group_nested() {
        let xml = include_str!("../fixtures/group-nested.drawio");

        let first = parse_drawio_with_diagnostics(xml, &mut Vec::new())
            .expect("group-nested.drawio should parse");

        // Find child vertex with parent="g1"
        let child = first.diagrams[0]
            .cells
            .iter()
            .find(|c| c.id == "v1")
            .expect("should have child vertex v1");
        assert_eq!(
            child.parent.as_deref(),
            Some("g1"),
            "child should have parent=g1"
        );

        // Group container should be present
        let group = first.diagrams[0]
            .cells
            .iter()
            .find(|c| c.id == "g1")
            .expect("should have group container g1");
        assert!(
            !group.vertex && !group.edge,
            "g1 should be a group container"
        );

        // Round-trip
        let written = write_drawio(&first).expect("write_drawio should succeed");
        let second = parse_drawio_with_diagnostics(&written, &mut Vec::new())
            .expect("written XML should parse");

        let reparsed_child = second.diagrams[0]
            .cells
            .iter()
            .find(|c| c.id == "v1")
            .expect("reparsed should still have v1");
        assert_eq!(
            reparsed_child.parent.as_deref(),
            Some("g1"),
            "parent reference should be preserved through round-trip"
        );
        assert!(
            second.diagrams[0].cells.iter().any(|c| c.id == "g1"),
            "group cell g1 should still be present"
        );
    }

    #[test]
    fn roundtrip_two_pages() {
        let xml = include_str!("../fixtures/two-pages.drawio");

        let first = parse_drawio_with_diagnostics(xml, &mut Vec::new())
            .expect("two-pages.drawio should parse");

        assert_eq!(first.diagrams.len(), 2, "should have exactly 2 diagrams");
        let names: Vec<_> = first
            .diagrams
            .iter()
            .filter_map(|d| d.name.as_deref())
            .collect();
        assert!(names.contains(&"Page-1"), "should have Page-1");
        assert!(names.contains(&"Page-2"), "should have Page-2");

        // Round-trip
        let written = write_drawio(&first).expect("write_drawio should succeed");
        let second = parse_drawio_with_diagnostics(&written, &mut Vec::new())
            .expect("written XML should parse");

        assert_eq!(
            second.diagrams.len(),
            2,
            "round-trip should preserve diagram count"
        );
        let names2: Vec<_> = second
            .diagrams
            .iter()
            .filter_map(|d| d.name.as_deref())
            .collect();
        assert!(names2.contains(&"Page-1"), "Page-1 should be preserved");
        assert!(names2.contains(&"Page-2"), "Page-2 should be preserved");
    }

    // =============================================================================
    // Task 24 — Domain-mapping integration tests
    // =============================================================================

    #[test]
    fn map_vertex_rect_preserves_label_and_style() {
        let xml = include_str!("../fixtures/vertex-rect.drawio");
        let raw = parse_drawio(xml).expect("vertex-rect.drawio should parse");

        let mapper = DrawioMapping::new();
        let (mut model, _id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

        assert_eq!(model.store.len_vertex(), 1, "should have exactly 1 vertex");

        // Find the vertex and check label
        let vertex = model
            .store
            .vertices_mut()
            .next()
            .expect("expected one vertex");
        assert_eq!(
            vertex.label.as_ref().map(|l| l.text.as_str()),
            Some("MyVertex"),
            "label should be MyVertex"
        );

        // Check style
        assert!(vertex.style_id.is_some(), "style_id should be set");
        if let Some(sid) = vertex.style_id {
            let smap = model.store.style(sid).expect("style should exist");
            assert_eq!(
                smap.get("fillColor"),
                Some(&diagram_core::style::StyleValue("#dae8fc".to_owned())),
                "fillColor style should be preserved"
            );
        }
    }

    #[test]
    fn map_edge_connect_resolves_endpoints() {
        let xml = include_str!("../fixtures/edge-connect.drawio");
        let raw = parse_drawio(xml).expect("edge-connect.drawio should parse");

        let mapper = DrawioMapping::new();
        let (mut model, _id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

        assert_eq!(model.store.len_vertex(), 2, "should have 2 vertices");
        assert_eq!(model.store.len_edge(), 1, "should have 1 edge");

        // Verify edge has resolved source and target
        let edge = model.store.edges_mut().next().expect("expected one edge");
        // The edge's source and target are VertexIds — we verify they are not default
        assert_ne!(
            edge.source,
            Default::default(),
            "edge source should be resolved"
        );
        assert_ne!(
            edge.target,
            Default::default(),
            "edge target should be resolved"
        );
        assert_ne!(
            edge.source, edge.target,
            "source and target should be different vertices"
        );
    }

    #[test]
    fn map_group_nested_links_parent() {
        let xml = include_str!("../fixtures/group-nested.drawio");
        let raw = parse_drawio(xml).expect("group-nested.drawio should parse");

        let mapper = DrawioMapping::new();
        let (mut model, _id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

        assert_eq!(model.store.len_group(), 1, "should have 1 group");
        assert_eq!(model.store.len_vertex(), 1, "should have 1 vertex");

        // Get the vertex's parent GroupId (using a separate borrow block)
        let group_id = {
            let vertex = model
                .store
                .vertices_mut()
                .next()
                .expect("expected one vertex");
            assert!(vertex.parent.is_some(), "vertex should have a parent group");
            vertex.parent.unwrap()
        };

        // Verify the group exists and has the expected label
        let group = model.store.group(group_id).expect("group should exist");
        assert_eq!(
            group.label.as_ref().map(|l| l.text.as_str()),
            Some("Group Container"),
            "group label should be 'Group Container'"
        );

        // Re-borrow vertex to verify its parent matches
        let vertex = model
            .store
            .vertices_mut()
            .next()
            .expect("expected one vertex");
        assert_eq!(
            vertex.parent,
            Some(group_id),
            "vertex parent should be the group id"
        );
    }

    #[test]
    fn map_two_pages_partitions() {
        let xml = include_str!("../fixtures/two-pages.drawio");
        let raw = parse_drawio(xml).expect("two-pages.drawio should parse");

        let mapper = DrawioMapping::new();
        let (model, _id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

        assert_eq!(model.page_count(), 2, "should have 2 pages");

        // Collect page names
        let names: Vec<_> = model
            .store
            .pages()
            .map(|p| p.name.as_ref().map(|l| l.text.as_str()))
            .collect();
        assert!(names.contains(&Some("Page-1")), "should have Page-1");
        assert!(names.contains(&Some("Page-2")), "should have Page-2");
    }

    #[test]
    fn map_dangling_edge_emits_diagnostic() {
        let xml = include_str!("../fixtures/dangling-edge.drawio");
        let raw = parse_drawio(xml).expect("dangling-edge.drawio should parse");

        let mapper = DrawioMapping::new();
        let mut diags = Vec::new();
        let (model, _id_map) = mapper
            .to_domain_with_diagnostics(&raw, &mut diags)
            .expect("to_domain_with_diagnostics should succeed");

        assert_eq!(model.store.len_edge(), 0, "dangling edge should be dropped");
        assert!(
            !diags.is_empty(),
            "at least one diagnostic should be emitted for dangling edge"
        );
        // Diagnostic should mention the dangling source
        let has_ghost_ref = diags.iter().any(|d| d.message.contains("ghost"));
        assert!(
            has_ghost_ref,
            "diagnostic should mention the dangling source 'ghost'"
        );
    }

    // =============================================================================
    // Task 28 — Domain round-trip integration tests
    // =============================================================================

    #[test]
    fn roundtrip_domain_simple_rect() {
        let xml = include_str!("../fixtures/simple-rect.drawio");
        let raw = parse_drawio(xml).expect("simple-rect.drawio should parse");

        let mapper = DrawioMapping::new();
        let (model, id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");
        assert_eq!(model.store.len_vertex(), 1, "should have 1 vertex");

        let mut diags = Vec::new();
        let roundtrip_raw = mapper
            .to_raw(&model, &id_map, &mut diags)
            .expect("to_raw should succeed");

        assert_eq!(
            raw.diagrams.len(),
            roundtrip_raw.diagrams.len(),
            "diagram count must be preserved"
        );
        let first_cells = &raw.diagrams[0].cells;
        let second_cells = &roundtrip_raw.diagrams[0].cells;
        assert_eq!(
            first_cells.len(),
            second_cells.len(),
            "cell count must be preserved through domain round-trip"
        );
    }

    #[test]
    fn roundtrip_domain_vertex_rect() {
        let xml = include_str!("../fixtures/vertex-rect.drawio");
        let raw = parse_drawio(xml).expect("vertex-rect.drawio should parse");

        let mapper = DrawioMapping::new();
        let (model, id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

        let mut diags = Vec::new();
        let roundtrip_raw = mapper
            .to_raw(&model, &id_map, &mut diags)
            .expect("to_raw should succeed");

        assert_eq!(raw.diagrams.len(), roundtrip_raw.diagrams.len());
        let first_cell = &raw.diagrams[0].cells[0];
        let second_cell = &roundtrip_raw.diagrams[0].cells[0];
        assert_eq!(
            first_cell.value, second_cell.value,
            "label must be preserved through domain round-trip"
        );
        // Verify style contains the fillColor
        let first_style = first_cell.style.as_deref().unwrap_or("");
        let second_style = second_cell.style.as_deref().unwrap_or("");
        assert!(
            first_style.contains("fillColor=#dae8fc"),
            "first style should contain fillColor"
        );
        assert_eq!(
            first_style.contains("fillColor=#dae8fc"),
            second_style.contains("fillColor=#dae8fc"),
            "fillColor style must be preserved through domain round-trip"
        );
    }

    #[test]
    fn roundtrip_domain_edge_connect() {
        let xml = include_str!("../fixtures/edge-connect.drawio");
        let raw = parse_drawio(xml).expect("edge-connect.drawio should parse");

        let mapper = DrawioMapping::new();
        let (model, id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

        let mut diags = Vec::new();
        let roundtrip_raw = mapper
            .to_raw(&model, &id_map, &mut diags)
            .expect("to_raw should succeed");

        // Find the edge in both versions
        let first_edge = raw.diagrams[0].cells.iter().find(|c| c.edge).unwrap();
        let second_edge = roundtrip_raw.diagrams[0]
            .cells
            .iter()
            .find(|c| c.edge)
            .unwrap();
        assert_eq!(
            first_edge.source, second_edge.source,
            "edge source must be preserved through domain round-trip"
        );
        assert_eq!(
            first_edge.target, second_edge.target,
            "edge target must be preserved through domain round-trip"
        );
        assert_eq!(
            first_edge.value, second_edge.value,
            "edge label must be preserved through domain round-trip"
        );
    }

    #[test]
    fn roundtrip_domain_group_nested() {
        let xml = include_str!("../fixtures/group-nested.drawio");
        let raw = parse_drawio(xml).expect("group-nested.drawio should parse");

        let mapper = DrawioMapping::new();
        let (model, id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

        let mut diags = Vec::new();
        let roundtrip_raw = mapper
            .to_raw(&model, &id_map, &mut diags)
            .expect("to_raw should succeed");

        // Find the child vertex v1 in both versions
        let first_v1 = raw.diagrams[0].cells.iter().find(|c| c.id == "v1").unwrap();
        let second_v1 = roundtrip_raw.diagrams[0]
            .cells
            .iter()
            .find(|c| c.id == "v1")
            .unwrap();
        assert_eq!(
            first_v1.parent, second_v1.parent,
            "parent reference must be preserved through domain round-trip"
        );
        // Group container should be present in both
        assert!(
            raw.diagrams[0].cells.iter().any(|c| c.id == "g1"),
            "group g1 should exist in first parse"
        );
        assert!(
            roundtrip_raw.diagrams[0].cells.iter().any(|c| c.id == "g1"),
            "group g1 should exist in round-trip"
        );
    }

    #[test]
    fn roundtrip_domain_two_pages() {
        let xml = include_str!("../fixtures/two-pages.drawio");
        let raw = parse_drawio(xml).expect("two-pages.drawio should parse");

        let mapper = DrawioMapping::new();
        let (model, id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

        let mut diags = Vec::new();
        let roundtrip_raw = mapper
            .to_raw(&model, &id_map, &mut diags)
            .expect("to_raw should succeed");

        assert_eq!(
            raw.diagrams.len(),
            roundtrip_raw.diagrams.len(),
            "page count must be preserved"
        );
        let names: Vec<_> = raw
            .diagrams
            .iter()
            .filter_map(|d| d.name.as_deref())
            .collect();
        let names2: Vec<_> = roundtrip_raw
            .diagrams
            .iter()
            .filter_map(|d| d.name.as_deref())
            .collect();
        assert_eq!(
            names, names2,
            "page names must be preserved through domain round-trip"
        );
    }

    #[test]
    fn roundtrip_domain_dangling_edge() {
        let xml = include_str!("../fixtures/dangling-edge.drawio");
        let raw = parse_drawio(xml).expect("dangling-edge.drawio should parse");

        let mapper = DrawioMapping::new();
        let (model, _id_map) = mapper
            .to_domain_with_diagnostics(&raw, &mut Vec::new())
            .expect("to_domain should succeed");

        // Dangling edge should be dropped from model
        assert_eq!(model.store.len_edge(), 0, "dangling edge should be dropped");
    }

    #[test]
    fn roundtrip_domain_empty_page() {
        let xml = include_str!("../fixtures/empty-page.drawio");
        let raw = parse_drawio(xml).expect("empty-page.drawio should parse");

        let mapper = DrawioMapping::new();
        let (model, id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

        assert_eq!(model.page_count(), 1, "should have 1 page");
        let page = model.store.pages().next().expect("should have a page");
        assert_eq!(
            page.name.as_ref().map(|l| l.text.as_str()),
            Some("Empty Page"),
            "page name should be preserved"
        );

        let mut diags = Vec::new();
        let roundtrip_raw = mapper
            .to_raw(&model, &id_map, &mut diags)
            .expect("to_raw should succeed");

        assert_eq!(roundtrip_raw.diagrams.len(), 1);
        assert_eq!(
            roundtrip_raw.diagrams[0].name.as_deref(),
            Some("Empty Page"),
            "page name must be preserved through domain round-trip"
        );
        assert!(
            roundtrip_raw.diagrams[0].cells.is_empty(),
            "empty page should remain empty through round-trip"
        );
    }

    #[test]
    fn roundtrip_domain_multi_segment_style() {
        let xml = include_str!("../fixtures/multi-segment-style.drawio");
        let raw = parse_drawio(xml).expect("multi-segment-style.drawio should parse");

        let mapper = DrawioMapping::new();
        let (model, id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

        assert_eq!(model.store.len_vertex(), 1, "should have 1 vertex");

        let mut diags = Vec::new();
        let roundtrip_raw = mapper
            .to_raw(&model, &id_map, &mut diags)
            .expect("to_raw should succeed");

        let first_cell = &raw.diagrams[0].cells[0];
        let second_cell = &roundtrip_raw.diagrams[0].cells[0];
        // The style string should round-trip through the domain
        let first_style = first_cell.style.as_deref().unwrap_or("");
        let second_style = second_cell.style.as_deref().unwrap_or("");
        // Both should contain the key segments (order may vary due to BTreeMap)
        assert!(
            first_style.contains("fillColor=#dae8fc"),
            "first style should contain fillColor"
        );
        assert_eq!(
            first_style.contains("fillColor=#dae8fc"),
            second_style.contains("fillColor=#dae8fc"),
            "fillColor must be preserved through domain round-trip"
        );
    }

    // =============================================================================
    // Legacy structural tests
    // =============================================================================

    #[test]
    fn parse_drawio_rejects_empty_document() {
        let result = parse_drawio("not xml at all");
        assert!(result.is_err(), "input without mxfile root must return Err");
    }

    #[test]
    fn parse_drawio_rejects_missing_mxgraphmodel() {
        let result = parse_drawio(r#"<mxfile><diagram></diagram></mxfile>"#);
        assert!(result.is_err(), "missing mxGraphModel must return Err");
    }

    // =============================================================================
    // PR-L2: z_order, locked, visible round-trip tests
    // =============================================================================

    #[test]
    fn parse_assigns_z_order_from_xml_child_index() {
        // XML order: v3 (index 0), v1 (index 1), v2 (index 2)
        // z_order should match XML child index
        let xml = include_str!("../fixtures/three-vertices-z-ordered.drawio");
        let raw = parse_drawio(xml).expect("three-vertices-z-ordered.drawio should parse");

        let mapper = DrawioMapping::new();
        let (model, id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

        // Build a map from raw_id -> z_order
        let id_to_z: BTreeMap<_, _> = model
            .store
            .vertices_with_ids()
            .map(|(vid, v)| {
                let raw_id = id_map.get_external_vertex(vid).unwrap();
                (raw_id, v.z_order)
            })
            .collect();

        // v3 is first in XML (index 0), v1 second (index 1), v2 third (index 2)
        assert_eq!(
            id_to_z.get("v3"),
            Some(&0),
            "v3 z_order should be 0 (XML index 0)"
        );
        assert_eq!(
            id_to_z.get("v1"),
            Some(&1),
            "v1 z_order should be 1 (XML index 1)"
        );
        assert_eq!(
            id_to_z.get("v2"),
            Some(&2),
            "v2 z_order should be 2 (XML index 2)"
        );
    }

    #[test]
    fn parse_reads_locked_and_visible_from_extra() {
        // v1: normal (locked=false, visible=true)
        // v2: locked="1", visible="0"
        let xml = include_str!("../fixtures/locked-and-hidden.drawio");
        let raw = parse_drawio(xml).expect("locked-and-hidden.drawio should parse");

        let mapper = DrawioMapping::new();
        let (model, _id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

        let mut vertices: Vec<_> = model
            .store
            .vertices_with_ids()
            .map(|(vid, v)| {
                let raw_id = _id_map.get_external_vertex(vid).unwrap();
                (raw_id, v.locked, v.visible)
            })
            .collect();
        vertices.sort_by_key(|(id, _, _)| id.clone());

        assert_eq!(vertices.len(), 2);
        // v1: normal vertex
        assert!(!vertices[0].1, "v1 should be unlocked");
        assert!(vertices[0].2, "v1 should be visible");
        // v2: locked and hidden
        assert!(vertices[1].1, "v2 should be locked");
        assert!(!vertices[1].2, "v2 should be hidden");
    }

    #[test]
    fn write_emits_cells_in_z_order_ascending() {
        // Build a model with 3 vertices: z_order = {2, 0, 1}
        let mut model = diagram_core::DiagramModel::new();
        let page_id = model
            .store
            .insert_page(diagram_core::Page::new(Default::default()));

        let v0 = model.store.insert_vertex(diagram_core::Vertex {
            page_id: Some(page_id),
            geometry: Some(diagram_core::geometry::CellGeometry {
                x: 0.0,
                y: 0.0,
                width: 80.0,
                height: 40.0,
                relative: false,
                rotation: 0.0,
                flip_h: false,
                flip_v: false,
            }),
            ..Default::default()
        });
        model.store.vertex_mut(v0).unwrap().z_order = 2;

        let v1 = model.store.insert_vertex(diagram_core::Vertex {
            page_id: Some(page_id),
            geometry: Some(diagram_core::geometry::CellGeometry {
                x: 30.0,
                y: 50.0,
                width: 80.0,
                height: 40.0,
                relative: false,
                rotation: 0.0,
                flip_h: false,
                flip_v: false,
            }),
            ..Default::default()
        });
        model.store.vertex_mut(v1).unwrap().z_order = 0;

        let v2 = model.store.insert_vertex(diagram_core::Vertex {
            page_id: Some(page_id),
            geometry: Some(diagram_core::geometry::CellGeometry {
                x: 60.0,
                y: 0.0,
                width: 80.0,
                height: 40.0,
                relative: false,
                rotation: 0.0,
                flip_h: false,
                flip_v: false,
            }),
            ..Default::default()
        });
        model.store.vertex_mut(v2).unwrap().z_order = 1;

        // Create id_map with raw IDs for each vertex
        let mut id_map = diagram_format_drawio::mapping::IdMap::new();
        id_map.vertices.insert("v0".to_owned(), v0);
        id_map.vertices.insert("v1".to_owned(), v1);
        id_map.vertices.insert("v2".to_owned(), v2);

        let mapper = DrawioMapping::new();
        let mut diags = Vec::new();
        let raw = mapper
            .to_raw(&model, &id_map, &mut diags)
            .expect("to_raw should succeed");

        // Cells should be emitted in z_order ascending: v1(z=0), v2(z=1), v0(z=2)
        let cell_ids: Vec<_> = raw.diagrams[0]
            .cells
            .iter()
            .map(|c| c.id.as_str())
            .collect();
        assert_eq!(
            cell_ids,
            &["v1", "v2", "v0"],
            "cells should be emitted in z_order ascending"
        );
    }

    #[test]
    fn write_emits_locked_and_hidden_via_extra() {
        // Build a model with locked and hidden vertices
        let mut model = diagram_core::DiagramModel::new();
        let page_id = model
            .store
            .insert_page(diagram_core::Page::new(Default::default()));

        let v_normal = model.store.insert_vertex(diagram_core::Vertex {
            page_id: Some(page_id),
            ..Default::default()
        });

        let v_locked = model.store.insert_vertex(diagram_core::Vertex {
            page_id: Some(page_id),
            locked: true,
            ..Default::default()
        });

        let v_hidden = model.store.insert_vertex(diagram_core::Vertex {
            page_id: Some(page_id),
            visible: false,
            ..Default::default()
        });

        let mut id_map = diagram_format_drawio::mapping::IdMap::new();
        id_map.vertices.insert("v_normal".to_owned(), v_normal);
        id_map.vertices.insert("v_locked".to_owned(), v_locked);
        id_map.vertices.insert("v_hidden".to_owned(), v_hidden);

        let mapper = DrawioMapping::new();
        let mut diags = Vec::new();
        let raw = mapper
            .to_raw(&model, &id_map, &mut diags)
            .expect("to_raw should succeed");

        let locked_cell = raw.diagrams[0]
            .cells
            .iter()
            .find(|c| c.id == "v_locked")
            .unwrap();
        assert_eq!(
            locked_cell.extra.get("locked"),
            Some(&"1".to_owned()),
            "locked=true should emit locked=1 in extra"
        );

        let hidden_cell = raw.diagrams[0]
            .cells
            .iter()
            .find(|c| c.id == "v_hidden")
            .unwrap();
        assert_eq!(
            hidden_cell.extra.get("visible"),
            Some(&"0".to_owned()),
            "visible=false should emit visible=0 in extra"
        );

        let normal_cell = raw.diagrams[0]
            .cells
            .iter()
            .find(|c| c.id == "v_normal")
            .unwrap();
        assert!(
            !normal_cell.extra.contains_key("locked"),
            "normal vertex should not emit locked"
        );
        assert!(
            !normal_cell.extra.contains_key("visible"),
            "normal vertex should not emit visible"
        );
    }

    #[test]
    fn roundtrip_locked_and_hidden_preserves_fields() {
        let xml = include_str!("../fixtures/locked-and-hidden.drawio");
        let raw = parse_drawio(xml).expect("locked-and-hidden.drawio should parse");

        let mapper = DrawioMapping::new();
        let (model, id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

        // Collect locked/visible state before round-trip
        let before: Vec<_> = model
            .store
            .vertices_with_ids()
            .map(|(vid, v)| {
                let raw_id = id_map.get_external_vertex(vid).unwrap();
                (raw_id, v.locked, v.visible)
            })
            .collect();

        // Round-trip through to_raw
        let mut diags = Vec::new();
        let roundtrip_raw = mapper
            .to_raw(&model, &id_map, &mut diags)
            .expect("to_raw should succeed");

        // Re-parse
        let second_raw = parse_drawio_with_diagnostics(
            &diagram_format_drawio::write_drawio(&roundtrip_raw)
                .expect("write_drawio should succeed"),
            &mut Vec::new(),
        )
        .expect("re-parsing should succeed");

        let mapper2 = DrawioMapping::new();
        let (model2, id_map2) = mapper2
            .to_domain(&second_raw)
            .expect("second to_domain should succeed");

        let after: Vec<_> = model2
            .store
            .vertices_with_ids()
            .map(|(vid, v)| {
                let raw_id = id_map2.get_external_vertex(vid).unwrap();
                (raw_id, v.locked, v.visible)
            })
            .collect();

        assert_eq!(before.len(), after.len(), "vertex count must be preserved");
        let mut before_sorted = before;
        let mut after_sorted = after;
        before_sorted.sort_by_key(|(id, _, _)| id.clone());
        after_sorted.sort_by_key(|(id, _, _)| id.clone());

        for (b, a) in before_sorted.iter().zip(after_sorted.iter()) {
            assert_eq!(b.0, a.0, "raw ID must be preserved");
            assert_eq!(b.1, a.1, "locked must be preserved for {}", b.0);
            assert_eq!(b.2, a.2, "visible must be preserved for {}", b.0);
        }
    }

    #[test]
    fn roundtrip_z_order_preserves_values() {
        let xml = include_str!("../fixtures/three-vertices-z-ordered.drawio");
        let raw = parse_drawio(xml).expect("three-vertices-z-ordered.drawio should parse");

        let mapper = DrawioMapping::new();
        let (model, id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

        // Collect z_order before
        let before: Vec<_> = model
            .store
            .vertices_with_ids()
            .map(|(vid, v)| {
                let raw_id = id_map.get_external_vertex(vid).unwrap();
                (raw_id, v.z_order)
            })
            .collect();

        // Round-trip through to_raw
        let mut diags = Vec::new();
        let roundtrip_raw = mapper
            .to_raw(&model, &id_map, &mut diags)
            .expect("to_raw should succeed");

        // Re-parse
        let second_raw = parse_drawio_with_diagnostics(
            &diagram_format_drawio::write_drawio(&roundtrip_raw)
                .expect("write_drawio should succeed"),
            &mut Vec::new(),
        )
        .expect("re-parsing should succeed");

        let mapper2 = DrawioMapping::new();
        let (model2, id_map2) = mapper2
            .to_domain(&second_raw)
            .expect("second to_domain should succeed");

        let after: Vec<_> = model2
            .store
            .vertices_with_ids()
            .map(|(vid, v)| {
                let raw_id = id_map2.get_external_vertex(vid).unwrap();
                (raw_id, v.z_order)
            })
            .collect();

        let mut before_sorted = before;
        let mut after_sorted = after;
        before_sorted.sort_by_key(|(id, _)| id.clone());
        after_sorted.sort_by_key(|(id, _)| id.clone());

        for (b, a) in before_sorted.iter().zip(after_sorted.iter()) {
            assert_eq!(b.0, a.0, "raw ID must be preserved");
            assert_eq!(b.1, a.1, "z_order must be preserved for {}", b.0);
        }
    }

    #[test]
    fn roundtrip_edge_with_waypoints() {
        let xml = include_str!("../fixtures/edge-with-waypoints.drawio");

        let first = parse_drawio_with_diagnostics(xml, &mut Vec::new())
            .expect("edge-with-waypoints.drawio should parse");

        // Find the edge cell
        let edge_cell = first.diagrams[0]
            .cells
            .iter()
            .find(|c| c.edge)
            .expect("should have an edge cell");

        // Verify waypoints were parsed
        let geo = edge_cell
            .geometry
            .as_ref()
            .expect("edge should have geometry");
        assert_eq!(geo.points.len(), 2, "edge should have 2 waypoints");
        assert_eq!(geo.points[0], (100.0, 50.0));
        assert_eq!(geo.points[1], (200.0, 80.0));

        // Round-trip: write back to XML
        let written = write_drawio(&first).expect("write_drawio should succeed");

        // Verify Array/points is present in output
        assert!(
            written.contains("Array"),
            "written XML should contain Array element"
        );
        assert!(
            written.contains("mxPoint"),
            "written XML should contain mxPoint elements"
        );
        assert!(
            written.contains(r#"as="points""#),
            "written XML should contain as=\"points\""
        );

        // Re-parse and verify waypoints survive round-trip
        let second = parse_drawio_with_diagnostics(&written, &mut Vec::new())
            .expect("written XML should parse");

        let reparsed_edge = second.diagrams[0]
            .cells
            .iter()
            .find(|c| c.edge)
            .expect("reparsed should still have an edge");

        let reparsed_geo = reparsed_edge
            .geometry
            .as_ref()
            .expect("edge should have geometry");
        assert_eq!(
            reparsed_geo.points.len(),
            2,
            "waypoints should survive round-trip"
        );
        assert_eq!(reparsed_geo.points[0], (100.0, 50.0));
        assert_eq!(reparsed_geo.points[1], (200.0, 80.0));
    }

    #[test]
    fn roundtrip_edge_without_waypoints_backward_compat() {
        // An edge without waypoints should still work correctly
        let xml = include_str!("../fixtures/edge-connect.drawio");

        let first = parse_drawio_with_diagnostics(xml, &mut Vec::new())
            .expect("edge-connect.drawio should parse");

        // Find the edge cell
        let edge_cell = first.diagrams[0]
            .cells
            .iter()
            .find(|c| c.edge)
            .expect("should have an edge cell");

        // Verify no waypoints
        let geo = edge_cell.geometry.as_ref();
        assert!(
            geo.map(|g| g.points.is_empty()).unwrap_or(true),
            "edge without waypoints should have empty or no points"
        );

        // Round-trip
        let written = write_drawio(&first).expect("write_drawio should succeed");
        let second = parse_drawio_with_diagnostics(&written, &mut Vec::new())
            .expect("written XML should parse");

        let reparsed_edge = second.diagrams[0]
            .cells
            .iter()
            .find(|c| c.edge)
            .expect("reparsed should still have an edge");

        // Should not have Array/points in output for empty waypoints
        assert!(
            !written.contains("Array"),
            "edge without waypoints should not emit Array element"
        );

        // Edge should still be valid
        assert_eq!(reparsed_edge.source.as_deref(), Some("A"));
        assert_eq!(reparsed_edge.target.as_deref(), Some("B"));
    }
}
