//! Integration tests for math flag propagation (MATH-001..005).
//!
//! These tests verify the math="1" attribute on <mxGraphModel> is correctly
//! parsed, propagated to Page.math_enabled, and round-tripped.

use diagram_format_drawio::DrawioMapping;

/// MATH-001: Parser reads math="1" from mxGraphModel and sets page.math_enabled = true.
#[test]
fn math_001_read_math_flag() {
    let xml = r#"<mxfile>
  <diagram name="Page-1" id="math-test-1">
    <mxGraphModel math="1" dx="800" dy="600" grid="1">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;

    let parser = diagram_format_drawio::DrawioParser::new();
    let doc = parser.parse_str(xml).unwrap();

    assert_eq!(doc.diagrams.len(), 1);
    // graph_model should contain math="1"
    let math_attr = doc.diagrams[0]
        .graph_model
        .iter()
        .find(|(k, _)| k.to_lowercase() == "math");
    assert!(
        math_attr.is_some(),
        "math attribute should be present in graph_model"
    );
    assert_eq!(
        math_attr.unwrap().1,
        "1",
        "math attribute value should be '1'"
    );

    // Mapping should propagate to Page.math_enabled
    let mapper = DrawioMapping::new();
    let (model, _) = mapper.to_domain(&doc).unwrap();
    let page = model.store.pages().next().expect("page should exist");
    assert!(
        page.math_enabled,
        "Page.math_enabled should be true when mxGraphModel has math=\"1\""
    );
}

/// MATH-002: Parser leaves page.math_enabled = false when math attribute is absent.
#[test]
fn math_002_write_math_flag() {
    let xml = r#"<mxfile>
  <diagram name="Page-1" id="no-math-test">
    <mxGraphModel dx="800" dy="600" grid="1">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;

    let parser = diagram_format_drawio::DrawioParser::new();
    let doc = parser.parse_str(xml).unwrap();

    // graph_model should NOT contain math attribute
    let math_attr = doc.diagrams[0]
        .graph_model
        .iter()
        .find(|(k, _)| k.to_lowercase() == "math");
    assert!(
        math_attr.is_none(),
        "math attribute should NOT be present when absent in source"
    );

    // Mapping should set Page.math_enabled = false
    let mapper = DrawioMapping::new();
    let (model, _) = mapper.to_domain(&doc).unwrap();
    let page = model.store.pages().next().expect("page should exist");
    assert!(
        !page.math_enabled,
        "Page.math_enabled should be false when mxGraphModel has no math attribute"
    );
}

/// MATH-003: Default page has math_enabled = false.
#[test]
fn math_003_default_math_false_when_absent() {
    let page = diagram_core::Page::default();
    assert!(
        !page.math_enabled,
        "Page::default() should have math_enabled=false (MATH-003)"
    );
}

/// MATH-004: math flag round-trips through parse → write → parse.
#[test]
fn math_004_math_flag_round_trips() {
    let xml = r#"<mxfile>
  <diagram name="Page-1">
    <mxGraphModel math="1" dx="800" dy="600" grid="1">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;

    // Parse
    let parser = diagram_format_drawio::DrawioParser::new();
    let doc1 = parser.parse_str(xml).unwrap();
    assert!(
        doc1.diagrams[0]
            .graph_model
            .iter()
            .any(|(k, v)| k.to_lowercase() == "math" && v == "1"),
        "First parse should have math=1"
    );

    // Write
    let writer = diagram_format_drawio::DrawioWriter::new();
    let output = writer.write_string(&doc1).unwrap();
    assert!(
        output.contains("math=\"1\""),
        "Written output should contain math=\"1\": {}",
        output
    );

    // Re-parse
    let doc2 = parser.parse_str(&output).unwrap();
    assert!(
        doc2.diagrams[0]
            .graph_model
            .iter()
            .any(|(k, v)| k.to_lowercase() == "math" && v == "1"),
        "Re-parsed document should still have math=1"
    );

    // Verify domain model also round-trips
    let mapper = DrawioMapping::new();
    let (model, _) = mapper.to_domain(&doc2).unwrap();
    let page = model.store.pages().next().expect("page should exist");
    assert!(
        page.math_enabled,
        "Page.math_enabled should be true after round-trip"
    );
}

/// MATH-005: other mxGraphModel attributes round-trip alongside math.
#[test]
fn math_005_other_mxgraphmodel_attrs_round_trip() {
    let xml = r#"<mxfile>
  <diagram name="Page-1">
    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" math="1" page="1">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;

    // Parse
    let parser = diagram_format_drawio::DrawioParser::new();
    let doc1 = parser.parse_str(xml).unwrap();

    // Verify multiple attributes are captured
    let graph_model = &doc1.diagrams[0].graph_model;
    assert!(
        graph_model.iter().any(|(k, _)| k == "dx"),
        "dx attribute should be present"
    );
    assert!(
        graph_model.iter().any(|(k, _)| k == "dy"),
        "dy attribute should be present"
    );
    assert!(
        graph_model.iter().any(|(k, _)| k == "math"),
        "math attribute should be present"
    );

    // Write
    let writer = diagram_format_drawio::DrawioWriter::new();
    let output = writer.write_string(&doc1).unwrap();

    // Re-parse
    let doc2 = parser.parse_str(&output).unwrap();

    // All original attributes should still be present
    let graph_model2 = &doc2.diagrams[0].graph_model;
    assert!(
        graph_model2.iter().any(|(k, _)| k == "dx"),
        "dx should round-trip"
    );
    assert!(
        graph_model2.iter().any(|(k, _)| k == "dy"),
        "dy should round-trip"
    );
    assert!(
        graph_model2.iter().any(|(k, v)| k == "math" && v == "1"),
        "math=1 should round-trip"
    );
}
