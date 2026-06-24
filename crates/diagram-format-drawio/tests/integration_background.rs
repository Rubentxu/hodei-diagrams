//! Integration tests for page background color (v0.49).
//!
//! Tests cover:
//! - Parser reads background attribute from XML
//! - Parser handles missing background attribute
//! - Round-trip preserves background color through parse → map → unmap → write
//! - Page with no background serializes without background attribute
//!
//! Run with:
//!   cargo test -p diagram-format-drawio --test integration_background

use diagram_format_drawio::{DrawioMapping, DrawioParser, DrawioWriter};
use diagram_format_drawio::raw::{RawDrawioCell, RawDrawioDiagram, RawDrawioDocument};

const XML_WITH_BACKGROUND: &str = "<mxfile>\
  <diagram name=\"Page-1\" background=\"#ff0000\">\
    <mxGraphModel>\
      <root>\
        <mxCell id=\"0\"/>\
        <mxCell id=\"1\"/>\
        <mxCell id=\"2\" value=\"Test\" vertex=\"1\">\
          <mxGeometry x=\"10\" y=\"20\" width=\"80\" height=\"40\"/>\
        </mxCell>\
      </root>\
    </mxGraphModel>\
  </diagram>\
</mxfile>";

const XML_WITHOUT_BACKGROUND: &str = "<mxfile>\
  <diagram name=\"Page-1\">\
    <mxGraphModel>\
      <root>\
        <mxCell id=\"0\"/>\
        <mxCell id=\"1\"/>\
        <mxCell id=\"2\" value=\"Test\" vertex=\"1\">\
          <mxGeometry x=\"10\" y=\"20\" width=\"80\" height=\"40\"/>\
        </mxCell>\
      </root>\
    </mxGraphModel>\
  </diagram>\
</mxfile>";

#[test]
fn parser_reads_background_attribute() {
    let parser = DrawioParser::new();
    let doc = parser.parse_str(XML_WITH_BACKGROUND).unwrap();

    assert_eq!(doc.diagrams.len(), 1, "should have one diagram");
    let diagram = &doc.diagrams[0];
    assert_eq!(
        diagram.background,
        Some("#ff0000".to_owned()),
        "background should be #ff0000"
    );
    assert_eq!(
        diagram.name,
        Some("Page-1".to_owned()),
        "name should be Page-1"
    );
}

#[test]
fn parser_handles_missing_background() {
    let parser = DrawioParser::new();
    let doc = parser.parse_str(XML_WITHOUT_BACKGROUND).unwrap();

    assert_eq!(doc.diagrams.len(), 1, "should have one diagram");
    let diagram = &doc.diagrams[0];
    assert!(
        diagram.background.is_none(),
        "background should be None when not present in XML"
    );
    assert_eq!(
        diagram.name,
        Some("Page-1".to_owned()),
        "name should still be parsed"
    );
}

#[test]
fn roundtrip_preserves_background_color() {
    // Parse XML with background → map to domain → map back to raw → write XML
    let parser = DrawioParser::new();
    let doc = parser.parse_str(XML_WITH_BACKGROUND).unwrap();

    // Verify raw model has background
    assert_eq!(
        doc.diagrams[0].background,
        Some("#ff0000".to_owned())
    );

    // Map to domain
    let mapper = DrawioMapping::new();
    let (model, id_map) = mapper.to_domain(&doc).unwrap();

    // Verify domain model has background
    let page = model.store.pages().next().expect("should have one page");
    assert_eq!(
        page.background,
        Some("#ff0000".to_owned()),
        "domain page should have background"
    );

    // Map back to raw
    let mut diags = Vec::new();
    let raw = mapper.to_raw(&model, &id_map, &mut diags).unwrap();

    // Verify raw model still has background
    assert_eq!(
        raw.diagrams[0].background,
        Some("#ff0000".to_owned()),
        "round-tripped raw should preserve background"
    );

    // Write to XML
    let writer = DrawioWriter::new();
    let output = writer.write_string(&raw).unwrap();

    // Verify output XML contains background attribute
    assert!(
        output.contains("background=\"#ff0000\""),
        "output XML should contain background attribute: {}",
        output
    );
}

#[test]
fn background_none_serializes_without_attribute() {
    // Create a domain model with no background on the page
    let parser = DrawioParser::new();
    let doc = parser.parse_str(XML_WITHOUT_BACKGROUND).unwrap();

    let mapper = DrawioMapping::new();
    let (model, id_map) = mapper.to_domain(&doc).unwrap();

    // Verify domain model has no background
    let page = model.store.pages().next().expect("should have one page");
    assert!(page.background.is_none());

    // Map back to raw
    let mut diags = Vec::new();
    let raw = mapper.to_raw(&model, &id_map, &mut diags).unwrap();

    // Verify raw model has no background
    assert!(raw.diagrams[0].background.is_none());

    // Write to XML
    let writer = DrawioWriter::new();
    let output = writer.write_string(&raw).unwrap();

    // Verify output XML does NOT contain background attribute
    assert!(
        !output.contains("background="),
        "output XML should NOT contain background attribute: {}",
        output
    );
}

#[test]
fn background_parsed_from_raw_document_roundtrips_correctly() {
    // Directly create a RawDrawioDocument with background and verify round-trip
    let doc = RawDrawioDocument {
        diagrams: vec![RawDrawioDiagram {
            name: Some("TestPage".to_owned()),
            background: Some("#00ff00".to_owned()),
            cells: vec![RawDrawioCell {
                id: "v1".to_owned(),
                value: Some("Box".to_owned()),
                style: Some("fillColor=#ffffff".to_owned()),
                vertex: true,
                edge: false,
                parent: None,
                source: None,
                target: None,
                geometry: None,
                extra: Default::default(),
            }],
        }],
    };

    // Write to XML
    let writer = DrawioWriter::new();
    let output = writer.write_string(&doc).unwrap();

    // Verify background is in output
    assert!(
        output.contains("background=\"#00ff00\""),
        "output should contain background: {}",
        output
    );

    // Parse it back
    let parser = DrawioParser::new();
    let reparsed = parser.parse_str(&output).unwrap();

    assert_eq!(
        reparsed.diagrams[0].background,
        Some("#00ff00".to_owned()),
        "reparsed document should preserve background"
    );
}

#[test]
fn multiple_pages_with_different_backgrounds() {
    let xml = "<mxfile>\
  <diagram name=\"Page-1\" background=\"#ff0000\">\
    <mxGraphModel>\
      <root>\
        <mxCell id=\"0\"/>\
        <mxCell id=\"1\"/>\
      </root>\
    </mxGraphModel>\
  </diagram>\
  <diagram name=\"Page-2\" background=\"#0000ff\">\
    <mxGraphModel>\
      <root>\
        <mxCell id=\"0\"/>\
        <mxCell id=\"1\"/>\
      </root>\
    </mxGraphModel>\
  </diagram>\
</mxfile>";

    let parser = DrawioParser::new();
    let doc = parser.parse_str(xml).unwrap();

    assert_eq!(doc.diagrams.len(), 2);
    assert_eq!(doc.diagrams[0].background, Some("#ff0000".to_owned()));
    assert_eq!(doc.diagrams[1].background, Some("#0000ff".to_owned()));
}

#[test]
fn empty_background_string_preserved() {
    // An explicit empty background string should be preserved
    let doc = RawDrawioDocument {
        diagrams: vec![RawDrawioDiagram {
            name: Some("Page-1".to_owned()),
            background: Some("".to_owned()),
            cells: vec![],
        }],
    };

    let writer = DrawioWriter::new();
    let output = writer.write_string(&doc).unwrap();

    // Empty background should still produce the attribute (empty value)
    assert!(
        output.contains("background=\"\""),
        "empty background should be serialized: {}",
        output
    );
}
