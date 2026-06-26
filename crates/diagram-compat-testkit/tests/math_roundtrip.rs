//! Full integration test: parse → write → parse for math-enabled diagrams.
//!
//! This test uses the golden fixture math-enabled.drawio to verify the complete
//! round-trip preserves all math typesetting metadata.

use diagram_format_drawio::{DrawioMapping, parse_drawio, write_drawio};

/// Integration test: math-enabled.drawio fixture round-trips correctly.
#[test]
fn math_roundtrip_golden_fixture() {
    // Read the golden fixture
    let xml = include_str!("fixtures/math-enabled.drawio");

    // Parse
    let raw = parse_drawio(xml).expect("golden fixture should parse");

    // Verify math is enabled via raw model
    assert!(
        raw.diagrams[0]
            .graph_model
            .iter()
            .any(|(k, v)| k.to_lowercase() == "math" && v == "1"),
        "graph_model should contain math=1"
    );

    // Map to domain and verify math_enabled
    let mapper = DrawioMapping::new();
    let (model, id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

    assert_eq!(
        model.store.pages().count(),
        1,
        "math-enabled.drawio should have 1 page"
    );
    let page = model.store.pages().next().expect("page should exist");
    assert!(
        page.math_enabled,
        "Page.math_enabled should be true for math-enabled.drawio"
    );

    // Verify the vertex with math expression exists
    assert_eq!(
        model.store.len_vertex(),
        1,
        "Should have 1 vertex (the math cell)"
    );

    // MATH-011/MATH-013 lock: the label text must be preserved verbatim through
    // parse → to_domain. drawio keeps the $...$ delimiters inside the cell value,
    // so the engine receives the full literal expression including delimiters.
    let (_, vertex) = model
        .store
        .vertices_with_ids()
        .next()
        .expect("vertex should exist");
    let label_text = vertex
        .label
        .as_ref()
        .expect("math cell should carry a label")
        .as_str();
    assert_eq!(
        label_text, r"$\int_0^1 x\,dx$",
        "label text must be preserved verbatim through parse → to_domain (MATH-011)"
    );

    // Write back
    let mut diags = Vec::new();
    let roundtrip_raw = mapper
        .to_raw(&model, &id_map, &mut diags)
        .expect("to_raw should succeed");
    let output = write_drawio(&roundtrip_raw).expect("write_drawio should succeed");

    // Re-parse
    let reparsed = parse_drawio(&output).expect("round-tripped output should parse");

    // Verify math is still enabled after round-trip
    assert!(
        reparsed.diagrams[0]
            .graph_model
            .iter()
            .any(|(k, v)| k.to_lowercase() == "math" && v == "1"),
        "math=1 should be preserved after round-trip"
    );

    // Verify no critical diagnostics
    assert!(
        diags.is_empty(),
        "No diagnostics expected for well-formed input: {:?}",
        diags
    );

    // Verify the math attribute is in the output
    assert!(
        output.contains("math=\"1\""),
        "Output should contain math=\"1\": {}",
        output
    );
}

/// Verify that a diagram WITHOUT math stays without math after round-trip.
#[test]
fn no_math_roundtrip_preserves_disabled() {
    let xml = r#"<mxfile>
  <diagram name="Page-1">
    <mxGraphModel dx="800" dy="600" grid="1">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;

    // Parse
    let raw = parse_drawio(xml).expect("should parse");

    // Verify math is not in graph_model
    assert!(
        !raw.diagrams[0]
            .graph_model
            .iter()
            .any(|(k, _)| k.to_lowercase() == "math"),
        "math should not be in graph_model for non-math diagram"
    );

    // Map to domain
    let mapper = DrawioMapping::new();
    let (model, id_map) = mapper.to_domain(&raw).expect("to_domain should succeed");

    // Verify math is disabled
    let page = model.store.pages().next().expect("page should exist");
    assert!(
        !page.math_enabled,
        "Page.math_enabled should be false for non-math diagram"
    );

    // Write back
    let mut diags = Vec::new();
    let roundtrip_raw = mapper
        .to_raw(&model, &id_map, &mut diags)
        .expect("to_raw should succeed");
    let output = write_drawio(&roundtrip_raw).expect("write_drawio should succeed");

    // Re-parse
    let reparsed = parse_drawio(&output).expect("round-tripped output should parse");

    // Verify math is still disabled
    assert!(
        !reparsed.diagrams[0]
            .graph_model
            .iter()
            .any(|(k, _)| k.to_lowercase() == "math"),
        "math should NOT appear in graph_model after round-trip"
    );

    // Verify math attribute is NOT in the output
    assert!(
        !output.contains("math="),
        "Output should NOT contain math attribute: {}",
        output
    );
}
