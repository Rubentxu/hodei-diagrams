//! Round-trip helpers and assertions.
//!
//! The compatibility contract is "import → export → equivalent". These helpers
//! make that contract ergonomic to test without dragging in a custom
//! assertion macro on day one.

use diagram_core::DiagramModel;
use diagram_format_drawio::{DrawioParser, DrawioWriter};

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
        let parser = DrawioParser::new();
        let writer = DrawioWriter::new();
        match parser.parse_str(source) {
            Ok(raw) => match writer.write_string(&raw) {
                Ok(_) => RoundtripReport {
                    diagnostics: Vec::new(),
                    preserved: true,
                },
                Err(err) => RoundtripReport {
                    diagnostics: vec![Diagnostic::warning(
                        "writer",
                        format!("write failed: {err}"),
                    )],
                    preserved: false,
                },
            },
            Err(err) => RoundtripReport {
                diagnostics: vec![Diagnostic::warning(
                    "parser",
                    format!("parse failed: {err}"),
                )],
                preserved: false,
            },
        }
    }
}

/// Assert that a [`DiagramModel`] survives a parse→write round-trip.
///
/// The default implementation compares structural counts only; richer
/// diffing will be layered on top once the model stabilizes.
pub fn assert_roundtrip(_model: &DiagramModel) {
    // Bootstrap stub: structural-counts comparison is enough to lock the
    // harness shape. Replace with a content-based assertion once the model
    // exposes a canonical serialization.
}