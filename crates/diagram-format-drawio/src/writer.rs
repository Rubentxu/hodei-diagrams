//! `.drawio` writer.
//!
//! Serializes a [`RawDrawioDocument`] back to `.drawio` XML.

use std::io;

use quick_xml::Writer;
use quick_xml::events::{BytesEnd, BytesStart, Event};

use crate::error::{FormatError, FormatResult};
use crate::raw::{RawDrawioDocument, RawDrawioGeometry};

/// Stateless `.drawio` writer.
#[derive(Debug, Default, Clone, Copy)]
pub struct DrawioWriter;

impl DrawioWriter {
    /// Create a new writer instance.
    pub fn new() -> Self {
        Self
    }

    /// Serialize a [`RawDrawioDocument`] back to a `.drawio` XML string.
    pub fn write_string(&self, document: &RawDrawioDocument) -> FormatResult<String> {
        if document.diagrams.is_empty() {
            return Ok(String::from(
                r#"<mxfile><diagram><mxGraphModel><root/></mxGraphModel></diagram></mxfile>"#,
            ));
        }

        let mut buf = Vec::new();
        {
            let mut writer = Writer::new_with_indent(&mut buf, b' ', 2);

            write_mxfile(&mut writer, document)?;
        }

        let result = String::from_utf8(buf)
            .map_err(|e| FormatError::InvalidStructure(format!("UTF-8 encoding error: {}", e)))?;

        Ok(result)
    }
}

fn write_mxfile(writer: &mut Writer<&mut Vec<u8>>, document: &RawDrawioDocument) -> io::Result<()> {
    writer.write_event(Event::Start(BytesStart::new("mxfile")))?;

    for diagram in &document.diagrams {
        write_diagram(writer, diagram)?;
    }

    writer.write_event(Event::End(BytesEnd::new("mxfile")))?;
    Ok(())
}

fn write_diagram(
    writer: &mut Writer<&mut Vec<u8>>,
    diagram: &crate::raw::RawDrawioDiagram,
) -> io::Result<()> {
    let mut diagram_start = BytesStart::new("diagram");
    if let Some(ref name) = diagram.name {
        diagram_start.push_attribute(("name", name.as_str()));
    }
    writer.write_event(Event::Start(diagram_start))?;

    writer.write_event(Event::Start(BytesStart::new("mxGraphModel")))?;
    writer.write_event(Event::Start(BytesStart::new("root")))?;

    // Hardcoded A4 portrait page size (draw.io point units)
    let mut geo = BytesStart::new("mxGeometry");
    geo.push_attribute(("width", "827"));
    geo.push_attribute(("height", "1169"));
    geo.push_attribute(("as", "graph"));
    writer.write_event(Event::Empty(geo))?;

    for cell in &diagram.cells {
        write_cell(writer, cell)?;
    }

    writer.write_event(Event::End(BytesEnd::new("root")))?;
    writer.write_event(Event::End(BytesEnd::new("mxGraphModel")))?;
    writer.write_event(Event::End(BytesEnd::new("diagram")))?;
    Ok(())
}

fn write_geometry(writer: &mut Writer<&mut Vec<u8>>, geo: &RawDrawioGeometry) -> io::Result<()> {
    let mut geo_start = BytesStart::new("mxGeometry");
    geo_start.push_attribute(("x", format!("{}", geo.x).as_str()));
    geo_start.push_attribute(("y", format!("{}", geo.y).as_str()));
    geo_start.push_attribute(("width", format!("{}", geo.width).as_str()));
    geo_start.push_attribute(("height", format!("{}", geo.height).as_str()));
    if !geo.r#as.is_empty() {
        geo_start.push_attribute(("as", geo.r#as.as_str()));
    }
    if let Some(rot) = geo.rotation {
        geo_start.push_attribute(("rotation", format!("{}", rot).as_str()));
    }
    if geo.flip_h == Some(true) {
        geo_start.push_attribute(("flipH", "1"));
    }
    if geo.flip_v == Some(true) {
        geo_start.push_attribute(("flipV", "1"));
    }

    if geo.points.is_empty() {
        writer.write_event(Event::Empty(geo_start))
    } else {
        // Emit geometry with nested Array/points for edges with waypoints
        writer.write_event(Event::Start(geo_start))?;
        write_points_array(writer, &geo.points)?;
        writer.write_event(Event::End(BytesEnd::new("mxGeometry")))?;
        Ok(())
    }
}

fn write_points_array(writer: &mut Writer<&mut Vec<u8>>, points: &[(f64, f64)]) -> io::Result<()> {
    let mut array_start = BytesStart::new("Array");
    array_start.push_attribute(("as", "points"));
    writer.write_event(Event::Start(array_start))?;

    for &(x, y) in points {
        let mut pt_start = BytesStart::new("mxPoint");
        pt_start.push_attribute(("x", format!("{}", x).as_str()));
        pt_start.push_attribute(("y", format!("{}", y).as_str()));
        writer.write_event(Event::Empty(pt_start))?;
    }

    writer.write_event(Event::End(BytesEnd::new("Array")))?;
    Ok(())
}

fn write_cell(
    writer: &mut Writer<&mut Vec<u8>>,
    cell: &crate::raw::RawDrawioCell,
) -> io::Result<()> {
    let mut cell_start = BytesStart::new("mxCell");
    cell_start.push_attribute(("id", cell.id.as_str()));

    if let Some(ref value) = cell.value {
        cell_start.push_attribute(("value", value.as_str()));
    }

    if let Some(ref style) = cell.style {
        cell_start.push_attribute(("style", style.as_str()));
    }

    if cell.vertex {
        cell_start.push_attribute(("vertex", "1"));
    }

    if cell.edge {
        cell_start.push_attribute(("edge", "1"));
    }

    if let Some(ref parent) = cell.parent {
        cell_start.push_attribute(("parent", parent.as_str()));
    }

    if let Some(ref source) = cell.source {
        cell_start.push_attribute(("source", source.as_str()));
    }

    if let Some(ref target) = cell.target {
        cell_start.push_attribute(("target", target.as_str()));
    }

    for (k, v) in &cell.extra {
        cell_start.push_attribute((k.as_str(), v.as_str()));
    }

    // Determine output shape based on cell type and presence of geometry
    if cell.vertex {
        writer.write_event(Event::Start(cell_start))?;
        if let Some(geo) = &cell.geometry {
            // Emit captured geometry as child element
            write_geometry(writer, geo)?;
        } else {
            // Phase 1 fallback: emit empty <mxGeometry/>
            writer.write_event(Event::Empty(BytesStart::new("mxGeometry")))?;
        }
        writer.write_event(Event::End(BytesEnd::new("mxCell")))?;
    } else if cell.edge {
        writer.write_event(Event::Start(cell_start))?;
        if let Some(geo) = &cell.geometry {
            write_geometry(writer, geo)?;
        }
        // No geometry for edge: emit no mxGeometry element
        writer.write_event(Event::End(BytesEnd::new("mxCell")))?;
    } else {
        // Group container (neither vertex nor edge)
        writer.write_event(Event::Start(cell_start))?;
        if let Some(geo) = &cell.geometry {
            write_geometry(writer, geo)?;
        }
        writer.write_event(Event::End(BytesEnd::new("mxCell")))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::raw::{RawDrawioCell, RawDrawioDiagram, RawDrawioDocument, RawDrawioGeometry};

    #[test]
    fn test_vertex_with_geometry_roundtrip() {
        // Build a RawDrawioCell with vertex + geometry and verify round-trip
        let cell = RawDrawioCell {
            id: "v1".to_owned(),
            value: Some("TestVertex".to_owned()),
            style: Some("fillColor=#ff0000".to_owned()),
            vertex: true,
            edge: false,
            parent: None,
            source: None,
            target: None,
            geometry: Some(RawDrawioGeometry {
                x: 10.0,
                y: 20.0,
                width: 80.0,
                height: 40.0,
                rotation: None,
                flip_h: None,
                flip_v: None,
                r#as: "geometry".to_owned(),
                points: Vec::new(),
            }),
            extra: Default::default(),
        };

        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Page-1".to_owned()),
                background: None,
                cells: vec![cell],
            }],
        };

        let writer = DrawioWriter::new();
        let output = writer.write_string(&doc).unwrap();

        // Verify geometry attributes appear in the output
        assert!(
            output.contains(r#"x="10""#),
            "x attribute missing: {}",
            output
        );
        assert!(
            output.contains(r#"y="20""#),
            "y attribute missing: {}",
            output
        );
        assert!(
            output.contains(r#"width="80""#),
            "width attribute missing: {}",
            output
        );
        assert!(
            output.contains(r#"height="40""#),
            "height attribute missing: {}",
            output
        );
        assert!(
            output.contains(r#"as="geometry""#),
            "as attribute missing: {}",
            output
        );
    }
}
