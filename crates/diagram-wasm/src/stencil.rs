//! Stencil XML parsing — WASM adapter.
//!
//! Thin bridge between JS and the `diagram-stencils` parser. All logic lives in
//! the engine crate; this module only translates errors to `JsValue`.

use diagram_stencils::Stencil;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct StencilDto {
    library: String,
    name: String,
    width: f64,
    height: f64,
    aspect: String,
    bg_len: usize,
    fg_len: usize,
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
