//! Round-trip tests for image import (style-driven Image shapes).

use diagram_format_drawio::{parse_drawio, write_drawio};
use std::fs;

#[test]
fn image_datauri_roundtrip_preserves_style() {
    let xml = fs::read_to_string("fixtures/image-datauri.drawio").unwrap();
    let parsed = parse_drawio(&xml).unwrap();
    assert_eq!(parsed.diagrams.len(), 1, "expected 1 diagram");

    let diagram = &parsed.diagrams[0];
    let cells = &diagram.cells;

    // Find the image vertex
    let image_cell = cells
        .iter()
        .find(|c| c.vertex && c.geometry.is_some())
        .expect("should have an image vertex cell");

    // Verify shape=image style is preserved
    let style = image_cell.style.as_ref().expect("cell should have style");
    assert!(
        style.contains("shape=image"),
        "style should contain 'shape=image', got: {}",
        style
    );
    assert!(
        style.contains("image=data:"),
        "style should contain image data-URI, got: {}",
        style
    );

    // Round-trip: write back and parse again
    let written = write_drawio(&parsed).unwrap();
    let reparsed = parse_drawio(&written).unwrap();
    assert_eq!(reparsed.diagrams.len(), 1);

    let reparsed_cell = reparsed.diagrams[0]
        .cells
        .iter()
        .find(|c| c.vertex && c.geometry.is_some())
        .expect("reparsed should have image vertex");

    let reparsed_style = reparsed_cell.style.as_ref().expect("reparsed cell should have style");
    assert!(
        reparsed_style.contains("shape=image"),
        "reparsed style should contain 'shape=image', got: {}",
        reparsed_style
    );
}

#[test]
fn image_url_roundtrip_preserves_style() {
    let xml = fs::read_to_string("fixtures/image-url.drawio").unwrap();
    let parsed = parse_drawio(&xml).unwrap();
    assert_eq!(parsed.diagrams.len(), 1);

    let diagram = &parsed.diagrams[0];
    let image_cell = diagram
        .cells
        .iter()
        .find(|c| c.vertex && c.geometry.is_some())
        .expect("should have an image vertex cell");

    let style = image_cell.style.as_ref().expect("cell should have style");
    assert!(
        style.contains("shape=image"),
        "style should contain 'shape=image', got: {}",
        style
    );
    assert!(
        style.contains("image=https://"),
        "style should contain image URL, got: {}",
        style
    );

    // Round-trip
    let written = write_drawio(&parsed).unwrap();
    let reparsed = parse_drawio(&written).unwrap();

    let reparsed_cell = reparsed.diagrams[0]
        .cells
        .iter()
        .find(|c| c.vertex && c.geometry.is_some())
        .expect("reparsed should have image vertex");

    let reparsed_style = reparsed_cell.style.as_ref().expect("reparsed cell should have style");
    assert!(
        reparsed_style.contains("shape=image"),
        "reparsed style should contain 'shape=image', got: {}",
        reparsed_style
    );
    assert!(
        reparsed_style.contains("image=https://"),
        "reparsed style should contain URL, got: {}",
        reparsed_style
    );
}
