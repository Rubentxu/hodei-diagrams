//! Stencil XML parsing — WASM adapter.
//!
//! Thin bridge between JS and the `diagram-stencils` parser. All logic lives in
//! the engine crate; this module only translates errors to `JsValue`.

use diagram_stencils::Stencil;
use serde::Serialize;
use wasm_bindgen::prelude::*;

/// Path command DTO with stable discriminator tags for JS consumption.
///
/// Each variant serializes with a `kind` discriminator followed by a `data`
/// object containing the variant fields.
#[derive(Serialize)]
#[serde(tag = "kind", content = "data")]
pub enum PathCommandDto {
    /// `move to x,y`
    Move {
        /// X coordinate.
        x: f64,
        /// Y coordinate.
        y: f64,
    },
    /// `line to x,y`
    Line {
        /// X coordinate.
        x: f64,
        /// Y coordinate.
        y: f64,
    },
    /// `quadratic curve to cx,cy x,y`
    Quad {
        /// Control point X.
        cx: f64,
        /// Control point Y.
        cy: f64,
        /// End point X.
        x: f64,
        /// End point Y.
        y: f64,
    },
    /// `cubic curve to c1x,c1y c2x,c2y x,y`
    Curve {
        /// First control point X.
        c1x: f64,
        /// First control point Y.
        c1y: f64,
        /// Second control point X.
        c2x: f64,
        /// Second control point Y.
        c2y: f64,
        /// End point X.
        x: f64,
        /// End point Y.
        y: f64,
    },
    /// `arc rx,ry x-axis-rotation large-arc sweep x,y`
    Arc {
        /// X radius.
        rx: f64,
        /// Y radius.
        ry: f64,
        /// X-axis rotation in degrees.
        x_axis_rotation: f64,
        /// Large arc flag.
        large_arc: bool,
        /// Sweep flag.
        sweep: bool,
        /// End point X.
        x: f64,
        /// End point Y.
        y: f64,
    },
    /// Close the current subpath.
    Close,
    /// Fill and stroke the current path.
    FillStroke,
}

impl From<&diagram_stencils::PathCommand> for PathCommandDto {
    fn from(cmd: &diagram_stencils::PathCommand) -> Self {
        match cmd {
            diagram_stencils::PathCommand::Move { x, y } => PathCommandDto::Move { x: *x, y: *y },
            diagram_stencils::PathCommand::Line { x, y } => PathCommandDto::Line { x: *x, y: *y },
            diagram_stencils::PathCommand::Quad { cx, cy, x, y } => PathCommandDto::Quad {
                cx: *cx,
                cy: *cy,
                x: *x,
                y: *y,
            },
            diagram_stencils::PathCommand::Curve {
                c1x,
                c1y,
                c2x,
                c2y,
                x,
                y,
            } => PathCommandDto::Curve {
                c1x: *c1x,
                c1y: *c1y,
                c2x: *c2x,
                c2y: *c2y,
                x: *x,
                y: *y,
            },
            diagram_stencils::PathCommand::Arc {
                rx,
                ry,
                x_axis_rotation,
                large_arc,
                sweep,
                x,
                y,
            } => PathCommandDto::Arc {
                rx: *rx,
                ry: *ry,
                x_axis_rotation: *x_axis_rotation,
                large_arc: *large_arc,
                sweep: *sweep,
                x: *x,
                y: *y,
            },
            diagram_stencils::PathCommand::Close => PathCommandDto::Close,
            diagram_stencils::PathCommand::FillStroke => PathCommandDto::FillStroke,
        }
    }
}

#[derive(Serialize)]
struct StencilDto {
    library: String,
    name: String,
    width: f64,
    height: f64,
    aspect: String,
    #[serde(rename = "bgLen")]
    bg_len: usize,
    #[serde(rename = "fgLen")]
    fg_len: usize,
    background: Vec<PathCommandDto>,
    foreground: Vec<PathCommandDto>,
    license: Option<String>,
    diagnostics: Vec<DiagnosticDto>,
}

#[derive(Serialize)]
struct DiagnosticDto {
    code: String,
    message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_stencil_xml_roundtrips_to_json() {
        let xml = r#"<shapes name="test"><shape name="Box" w="80" h="40"/></shapes>"#;
        let json = parse_stencil_xml(xml).expect("should parse");
        assert!(json.contains(r#""name":"Box""#));
        assert!(json.contains(r#""library":"test""#));
        assert!(json.contains(r#""width":80"#));
        assert!(json.contains(r#""height":40"#));
    }

    #[test]
    fn stencil_dto_includes_background_and_foreground_arrays() {
        use diagram_stencils::PathCommand;
        let stencil = diagram_stencils::Stencil {
            library: "test".into(),
            name: "Rect".into(),
            width: 100.0,
            height: 100.0,
            aspect: diagram_stencils::Aspect::Fixed,
            background: vec![
                PathCommand::Move { x: 0.0, y: 0.0 },
                PathCommand::Line { x: 1.0, y: 0.0 },
                PathCommand::Close,
            ],
            foreground: vec![PathCommand::FillStroke],
            license: None,
            diagnostics: vec![],
        };

        let dto = StencilDto::from(&stencil);
        assert_eq!(dto.background.len(), 3);
        assert_eq!(dto.foreground.len(), 1);
        assert_eq!(dto.bg_len, 3);
        assert_eq!(dto.fg_len, 1);
    }

    #[test]
    fn path_command_dto_serializes_with_kind_discriminator() {
        let cmd = PathCommandDto::Move { x: 10.0, y: 20.0 };
        let json = serde_json::to_string(&cmd).unwrap();
        assert!(json.contains(r#""kind":"Move""#));
        assert!(json.contains(r#""x":10"#));
        assert!(json.contains(r#""y":20"#));
    }

    #[test]
    fn parse_stencil_library_xml_parses_multiple_shapes() {
        let xml = r#"<shapes name="test">
            <shape name="Rect" w="100" h="100"/>
            <shape name="Circle" w="80" h="80"/>
        </shapes>"#;
        let json = parse_stencil_library_xml(xml).expect("should parse");
        assert!(json.contains(r#""name":"Rect""#));
        assert!(json.contains(r#""name":"Circle""#));
        assert!(json.starts_with('['));
        assert!(json.ends_with(']'));
    }
}

impl From<&diagram_stencils::Stencil> for StencilDto {
    fn from(s: &Stencil) -> Self {
        Self {
            library: s.library.clone(),
            name: s.name.clone(),
            width: s.width,
            height: s.height,
            aspect: match s.aspect {
                diagram_stencils::Aspect::Fixed => "fixed".into(),
                diagram_stencils::Aspect::Variable => "variable".into(),
            },
            bg_len: s.background.len(),
            fg_len: s.foreground.len(),
            background: s.background.iter().map(PathCommandDto::from).collect(),
            foreground: s.foreground.iter().map(PathCommandDto::from).collect(),
            license: s.license.as_ref().map(|l| match l {
                diagram_stencils::SpdxId::Mit => "MIT".into(),
                diagram_stencils::SpdxId::Apache20 => "Apache-2.0".into(),
                diagram_stencils::SpdxId::Cc010 => "CC0-1.0".into(),
                diagram_stencils::SpdxId::Bsd3 => "BSD-3-Clause".into(),
                diagram_stencils::SpdxId::Unknown(u) => u.clone(),
            }),
            diagnostics: s
                .diagnostics
                .iter()
                .map(|d| DiagnosticDto {
                    code: d.location.clone(),
                    message: d.message.clone(),
                })
                .collect(),
        }
    }
}

/// Parse a draw.io stencil XML string and return a JSON summary.
///
/// This is a standalone function — no engine handle required. It delegates to
/// [`diagram_stencils::parse_stencil`] and translates errors to `JsValue`.
///
/// # Errors
///
/// Returns `Err(JsValue)` if the XML cannot be parsed.
///
/// # JSON output
///
/// Returns a JSON object with shape:
///
/// ```json
/// {
///   "library": "general",
///   "name": "Rectangle",
///   "width": 80.0,
///   "height": 40.0,
///   "aspect": "variable",
///   "bg_len": 1,
///   "fg_len": 1,
///   "license": "MIT",
///   "diagnostics": []
/// }
/// ```
#[wasm_bindgen]
pub fn parse_stencil_xml(xml: &str) -> Result<String, JsValue> {
    let stencil = diagram_stencils::parse_stencil(xml)
        .map_err(|e| JsValue::from_str(&format!("StencilParseError: {e}")))?;

    let dto = StencilDto::from(&stencil);
    serde_json::to_string(&dto)
        .map_err(|e| JsValue::from_str(&format!("StencilSerializeError: {e}")))
}

/// Parses a full stencil library XML file (multiple `<shape>` elements).
///
/// Returns a JSON array string of all successfully parsed stencils, each
/// normalized to [0,1] unit square coordinates with full path arrays.
///
/// Malformed individual shapes emit diagnostics but do not cause the whole
/// file to fail.
///
/// # Errors
///
/// Returns `Err(JsValue)` if the XML cannot be parsed at all.
///
/// # JSON output
///
/// Returns a JSON string containing an array of stencil objects.
#[wasm_bindgen]
pub fn parse_stencil_library_xml(xml: &str) -> Result<String, JsValue> {
    let stencils = diagram_stencils::parse_stencil_library(xml)
        .map_err(|e| JsValue::from_str(&format!("StencilParseError: {e}")))?;

    // Normalize each stencil and convert to DTO
    let normalized: Vec<StencilDto> = stencils
        .iter()
        .map(|s| {
            let normalized = s.normalize();
            StencilDto::from(&normalized)
        })
        .collect();

    serde_json::to_string(&normalized)
        .map_err(|e| JsValue::from_str(&format!("StencilSerializeError: {e}")))
}
