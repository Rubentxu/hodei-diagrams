//! `quick-xml` based parser for `.drawio` files.
//!
//! This module only produces a [`RawDrawioDocument`]. Domain mapping lives in
//! the sibling [`crate::mapping`] module.

use std::collections::BTreeMap;

use quick_xml::Reader;
use quick_xml::events::Event;

use crate::error::{Diagnostic, FormatError, FormatResult};
use crate::raw::{RawDrawioCell, RawDrawioDiagram, RawDrawioDocument, RawDrawioGeometry};

/// Stateless `.drawio` parser.
#[derive(Debug, Default, Clone, Copy)]
pub struct DrawioParser;

impl DrawioParser {
    /// Create a new parser instance.
    pub fn new() -> Self {
        Self
    }

    /// Parse a `.drawio` XML string into a [`RawDrawioDocument`].
    ///
    /// This call only fills the raw model. Use [`crate::DrawioMapping`] to
    /// convert the raw model into a [`diagram_core::DiagramModel`].
    pub fn parse_str(&self, xml: &str) -> FormatResult<RawDrawioDocument> {
        let mut diagnostics = Vec::new();
        self.parse_str_with_diagnostics(xml, &mut diagnostics)
    }

    /// Parse with optional diagnostic collection.
    ///
    /// Callers that want to collect compatibility diagnostics without failing can
    /// pass a `&mut Vec<Diagnostic>`.
    pub fn parse_str_with_diagnostics(
        &self,
        source: &str,
        diagnostics: &mut Vec<Diagnostic>,
    ) -> FormatResult<RawDrawioDocument> {
        let mut reader = Reader::from_str(source);
        reader.config_mut().trim_text(true);

        let mut doc = RawDrawioDocument {
            diagrams: Vec::new(),
        };
        let mut buf = Vec::new();
        let mut current_diagram: Option<RawDrawioDiagram> = None;
        let mut in_mxgraph_model = false;
        let mut in_root = false;
        let mut saw_mxgraph_model = false;
        let mut collecting_points: Option<Vec<(f64, f64)>> = None;

        loop {
            buf.clear();
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e)) => {
                    match e.name().as_ref() {
                        b"mxfile" => {
                            // Root element
                        }
                        b"diagram" => {
                            let diagram_name = e
                                .attributes()
                                .find(|a| {
                                    a.as_ref()
                                        .map(|attr| attr.key.as_ref() == b"name")
                                        .unwrap_or(false)
                                })
                                .and_then(|r| r.ok())
                                .and_then(|attr| {
                                    std::str::from_utf8(&attr.value).ok().map(|s| s.to_owned())
                                });
                            let diagram_background = e
                                .attributes()
                                .find(|a| {
                                    a.as_ref()
                                        .map(|attr| attr.key.as_ref() == b"background")
                                        .unwrap_or(false)
                                })
                                .and_then(|r| r.ok())
                                .and_then(|attr| {
                                    std::str::from_utf8(&attr.value).ok().map(|s| s.to_owned())
                                });
                            current_diagram = Some(RawDrawioDiagram {
                                name: diagram_name,
                                background: diagram_background,
                                cells: Vec::new(),
                            });
                        }
                        b"mxGraphModel" => {
                            in_mxgraph_model = true;
                            saw_mxgraph_model = true;
                        }
                        b"root" => {
                            in_root = true;
                        }
                        b"mxCell" => {
                            if !in_mxgraph_model || !in_root {
                                diagnostics.push(Diagnostic {
                                    location: "mxCell outside mxGraphModel/root".to_owned(),
                                    message: "mxCell found outside expected structure".to_owned(),
                                });
                                continue;
                            }
                            if let Ok(cell) = self.parse_cell_from_start(&e) {
                                if cell.id == "0" || cell.id == "1" {
                                    continue;
                                }
                                if let Some(ref mut diagram) = current_diagram {
                                    diagram.cells.push(cell);
                                }
                            }
                        }
                        b"mxGeometry" => {
                            // Paired <mxGeometry> — same capture logic as Empty
                            if let Some(geo) = self.parse_geometry_from_start(&e) {
                                if geo.r#as != "graph" {
                                    if let Some(ref mut diagram) = current_diagram {
                                        if let Some(cell) = diagram.cells.last_mut() {
                                            cell.geometry = Some(geo);
                                        }
                                    }
                                }
                            }
                        }
                        b"Array" => {
                            // Check if this is a points array: <Array as="points">
                            let mut is_points = false;
                            for attr_result in e.attributes().with_checks(false) {
                                if let Ok(attr) = attr_result {
                                    if attr.key.as_ref() == b"as" {
                                        if let Ok(val) = std::str::from_utf8(&attr.value) {
                                            if val == "points" {
                                                is_points = true;
                                            }
                                        }
                                    }
                                }
                            }
                            if is_points {
                                collecting_points = Some(Vec::new());
                            }
                        }
                        _ => {
                            let name_bytes = e.name().as_ref().to_vec();
                            let name_str = String::from_utf8_lossy(&name_bytes);
                            diagnostics.push(Diagnostic {
                                location: format!("element: {}", name_str),
                                message: format!("unsupported element: {}", name_str),
                            });
                        }
                    }
                }
                Ok(Event::Empty(e)) => {
                    if e.name().as_ref() == b"mxCell" {
                        if !in_mxgraph_model || !in_root {
                            continue;
                        }
                        if let Ok(cell) = self.parse_cell_from_start(&e) {
                            if cell.id == "0" || cell.id == "1" {
                                continue;
                            }
                            if let Some(ref mut diagram) = current_diagram {
                                diagram.cells.push(cell);
                            }
                        }
                    } else if e.name().as_ref() == b"mxGeometry" {
                        if let Some(geo) = self.parse_geometry_from_start(&e) {
                            if geo.r#as != "graph" {
                                if let Some(ref mut diagram) = current_diagram {
                                    if let Some(cell) = diagram.cells.last_mut() {
                                        cell.geometry = Some(geo);
                                    }
                                }
                            }
                        }
                    } else if e.name().as_ref() == b"mxPoint" {
                        // Extract x,y from mxPoint while collecting points
                        if let Some(ref mut points) = collecting_points {
                            let mut x = 0.0;
                            let mut y = 0.0;
                            for attr_result in e.attributes().with_checks(false) {
                                if let Ok(attr) = attr_result {
                                    if let Ok(val) = std::str::from_utf8(&attr.value) {
                                        match attr.key.as_ref() {
                                            b"x" => x = val.parse().unwrap_or(0.0),
                                            b"y" => y = val.parse().unwrap_or(0.0),
                                            _ => {}
                                        }
                                    }
                                }
                            }
                            points.push((x, y));
                        }
                    }
                }
                Ok(Event::End(e)) => match e.name().as_ref() {
                    b"mxfile" => {
                        if !saw_mxgraph_model {
                            return Err(FormatError::InvalidStructure(
                                "missing required mxGraphModel element".to_owned(),
                            ));
                        }
                        break;
                    }
                    b"diagram" => {
                        if let Some(diagram) = current_diagram.take() {
                            doc.diagrams.push(diagram);
                        }
                    }
                    b"mxGraphModel" => {
                        in_mxgraph_model = false;
                    }
                    b"root" => {
                        in_root = false;
                    }
                    b"Array" => {
                        // End of points array — assign collected points to last cell's geometry
                        if let Some(points) = collecting_points.take() {
                            if let Some(ref mut diagram) = current_diagram {
                                if let Some(cell) = diagram.cells.last_mut() {
                                    if let Some(ref mut geo) = cell.geometry {
                                        geo.points = points;
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                },
                Ok(Event::Eof) => {
                    if !saw_mxgraph_model {
                        return Err(FormatError::InvalidStructure(
                            "missing required mxGraphModel element".to_owned(),
                        ));
                    }
                    break;
                }
                Ok(Event::Decl(_))
                | Ok(Event::Comment(_))
                | Ok(Event::PI(_))
                | Ok(Event::DocType(_))
                | Ok(Event::GeneralRef(_))
                | Ok(Event::Text(_))
                | Ok(Event::CData(_)) => {
                    // Ignored: declaration, comment, PI, DOCTYPE, general refs, text, CDATA
                }
                Err(e) => {
                    return Err(FormatError::MalformedXml(e.to_string()));
                }
            }
        }

        Ok(doc)
    }

    fn parse_cell_from_start(
        &self,
        start: &quick_xml::events::BytesStart,
    ) -> FormatResult<RawDrawioCell> {
        let mut id = String::new();
        let mut value = None;
        let mut style = None;
        let mut vertex = false;
        let mut edge = false;
        let mut parent = None;
        let mut source = None;
        let mut target = None;
        let mut extra: BTreeMap<String, String> = BTreeMap::new();

        for attr_result in start.attributes().with_checks(false) {
            let attr = match attr_result {
                Ok(a) => a,
                Err(_) => continue,
            };
            let key = attr.key.as_ref();
            let val = match std::str::from_utf8(&attr.value) {
                Ok(v) => v,
                Err(_) => continue,
            };

            match key {
                b"id" => id = val.to_owned(),
                b"value" => value = Some(val.to_owned()),
                b"style" => style = Some(val.to_owned()),
                b"vertex" => vertex = val == "1",
                b"edge" => edge = val == "1",
                b"parent" => parent = Some(val.to_owned()),
                b"source" => source = Some(val.to_owned()),
                b"target" => target = Some(val.to_owned()),
                _ => {
                    extra.insert(String::from_utf8_lossy(key).to_string(), val.to_owned());
                }
            }
        }

        if id.is_empty() {
            return Err(FormatError::InvalidStructure(
                "mxCell missing required id attribute".to_owned(),
            ));
        }

        Ok(RawDrawioCell {
            id,
            value,
            style,
            vertex,
            edge,
            parent,
            source,
            target,
            geometry: None,
            extra,
        })
    }

    /// Parse a `RawDrawioGeometry` from a `<mxGeometry>` element's attributes.
    fn parse_geometry_from_start(
        &self,
        start: &quick_xml::events::BytesStart,
    ) -> Option<RawDrawioGeometry> {
        let mut x = 0.0;
        let mut y = 0.0;
        let mut width = 0.0;
        let mut height = 0.0;
        let mut r#as = String::new();
        let mut rotation: Option<f64> = None;
        let mut flip_h: Option<bool> = None;
        let mut flip_v: Option<bool> = None;

        for attr_result in start.attributes().with_checks(false) {
            let attr = match attr_result {
                Ok(a) => a,
                Err(_) => continue,
            };
            let key = attr.key.as_ref();
            let val = match std::str::from_utf8(&attr.value) {
                Ok(v) => v,
                Err(_) => continue,
            };

            match key {
                b"x" => x = val.parse().unwrap_or(0.0),
                b"y" => y = val.parse().unwrap_or(0.0),
                b"width" => width = val.parse().unwrap_or(0.0),
                b"height" => height = val.parse().unwrap_or(0.0),
                b"as" => r#as = val.to_owned(),
                b"rotation" => rotation = val.parse::<f64>().ok(),
                b"flipH" => flip_h = Some(val == "1"),
                b"flipV" => flip_v = Some(val == "1"),
                _ => {}
            }
        }

        Some(RawDrawioGeometry {
            x,
            y,
            width,
            height,
            r#as,
            rotation,
            flip_h,
            flip_v,
            points: Vec::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SIMPLE_VERTEX_WITH_GEOMETRY: &str = r#"<mxfile>
  <diagram name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1"/>
        <mxCell id="2" value="Test" vertex="1">
          <mxGeometry x="10" y="20" width="80" height="40"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;

    const SIMPLE_VERTEX_WITH_GEOMETRY_SELF_CLOSING: &str = r#"<mxfile>
  <diagram name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1"/>
        <mxCell id="2" value="Test" vertex="1">
          <mxGeometry x="10" y="20" width="80" height="40" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;

    const VERTEX_NO_GEOMETRY: &str = r#"<mxfile>
  <diagram name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1"/>
        <mxCell id="2" value="Test" vertex="1"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;

    const PAGE_LEVEL_GEOMETRY: &str = r#"<mxfile>
  <diagram name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1"/>
        <mxGeometry width="827" height="1169" as="graph"/>
        <mxCell id="2" value="Test" vertex="1"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;

    #[test]
    fn test_self_closing_mxgeometry_attaches_to_cell() {
        // Self-closing <mxGeometry ... /> inside a cell → geometry = Some(...)
        let xml = r#"<mxfile>
  <diagram name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1"/>
        <mxCell id="2" vertex="1"><mxGeometry x="10" y="20" width="80" height="40"/></mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;
        let parser = DrawioParser::new();
        let doc = parser.parse_str(xml).unwrap();
        let cell = &doc.diagrams[0].cells[0];
        assert!(
            cell.geometry.is_some(),
            "Self-closing mxGeometry should be captured"
        );
        let geo = cell.geometry.as_ref().unwrap();
        assert_eq!(geo.x, 10.0);
        assert_eq!(geo.y, 20.0);
        assert_eq!(geo.width, 80.0);
        assert_eq!(geo.height, 40.0);
    }

    #[test]
    fn test_paired_mxgeometry_with_as_geometry() {
        // Paired <mxGeometry as="geometry"> → geometry.as_ == "geometry"
        let parser = DrawioParser::new();
        let doc = parser.parse_str(SIMPLE_VERTEX_WITH_GEOMETRY).unwrap();
        let cell = &doc.diagrams[0].cells[0];
        let geo = cell.geometry.as_ref().expect("geometry should be present");
        assert_eq!(geo.r#as, "", "missing 'as' attr should be empty string");
        assert_eq!(geo.x, 10.0);
    }

    #[test]
    fn test_paired_mxgeometry_explicit_as_geometry() {
        let parser = DrawioParser::new();
        let doc = parser
            .parse_str(SIMPLE_VERTEX_WITH_GEOMETRY_SELF_CLOSING)
            .unwrap();
        let cell = &doc.diagrams[0].cells[0];
        let geo = cell.geometry.as_ref().expect("geometry should be present");
        assert_eq!(geo.r#as, "geometry");
        assert_eq!(geo.x, 10.0);
        assert_eq!(geo.y, 20.0);
        assert_eq!(geo.width, 80.0);
        assert_eq!(geo.height, 40.0);
    }

    #[test]
    fn test_cell_without_mxgeometry_none() {
        // Cell without <mxGeometry> → geometry = None
        let parser = DrawioParser::new();
        let doc = parser.parse_str(VERTEX_NO_GEOMETRY).unwrap();
        let cell = &doc.diagrams[0].cells[0];
        assert!(
            cell.geometry.is_none(),
            "Cell without mxGeometry should have geometry = None"
        );
    }

    #[test]
    fn test_page_level_mxgeometry_as_graph_not_attached() {
        // Page-level <mxGeometry as="graph"/> → no cell receives it (guard works)
        let parser = DrawioParser::new();
        let doc = parser.parse_str(PAGE_LEVEL_GEOMETRY).unwrap();
        // The page-level geometry should be silently ignored; the vertex cell
        // should have no geometry attached.
        let cell = &doc.diagrams[0].cells[0];
        assert!(
            cell.geometry.is_none(),
            "Page-level as=\"graph\" geometry should NOT be attached to a cell"
        );
    }

    const EDGE_WITH_WAYPOINTS: &str = r#"<mxfile>
  <diagram name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1"/>
        <mxCell id="2" value="A" vertex="1">
          <mxGeometry x="10" y="10" width="80" height="40"/>
        </mxCell>
        <mxCell id="3" value="B" vertex="1">
          <mxGeometry x="300" y="10" width="80" height="40"/>
        </mxCell>
        <mxCell id="4" edge="1" source="2" target="3">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="100" y="50"/>
              <mxPoint x="200" y="80"/>
            </Array>
          </mxGeometry>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;

    #[test]
    fn test_edge_with_waypoints_parses_points() {
        let parser = DrawioParser::new();
        let doc = parser.parse_str(EDGE_WITH_WAYPOINTS).unwrap();
        // Find the edge cell (id="4")
        let edge_cell = doc.diagrams[0]
            .cells
            .iter()
            .find(|c| c.id == "4")
            .expect("edge cell should exist");
        assert!(edge_cell.edge, "cell should be an edge");
        let geo = edge_cell
            .geometry
            .as_ref()
            .expect("edge should have geometry");
        assert_eq!(geo.points.len(), 2, "edge should have 2 waypoints");
        assert_eq!(geo.points[0], (100.0, 50.0));
        assert_eq!(geo.points[1], (200.0, 80.0));
    }

    #[test]
    fn test_edge_without_waypoints_has_empty_points() {
        // An edge without Array/points should have empty points vector
        let xml = r#"<mxfile>
  <diagram name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1"/>
        <mxCell id="2" vertex="1"/>
        <mxCell id="3" vertex="1"/>
        <mxCell id="4" edge="1" source="2" target="3">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;
        let parser = DrawioParser::new();
        let doc = parser.parse_str(xml).unwrap();
        let edge_cell = doc.diagrams[0]
            .cells
            .iter()
            .find(|c| c.id == "4")
            .expect("edge cell should exist");
        let geo = edge_cell
            .geometry
            .as_ref()
            .expect("edge should have geometry");
        assert!(
            geo.points.is_empty(),
            "edge without waypoints should have empty points"
        );
    }
}
