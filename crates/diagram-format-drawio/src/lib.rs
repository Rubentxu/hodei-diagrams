//! # diagram-format-drawio
//!
//! Parser and writer for `.drawio` XML files. This crate depends only on
//! `diagram-core`; it must not reach into layout, routing, scene, or web
//! concerns.
//!
//! The crate first parses XML into a raw drawio model (`raw` module), then
//! maps that raw model to the diagram-core domain model (`mapping` module).
//! Round-tripping is the contract; see `docs/adr/0006-behavior-first-study-upstream-second.md`
//! and `docs/adr/0026-parse-drawio-into-raw-model-before-domain-mapping.md`.
//!
//! See `docs/adr/0014-drawio-format-depends-only-on-diagram-core.md`.

#![deny(missing_docs)]

pub mod error;
pub mod mapping;
pub mod parser;
pub mod raw;
pub mod writer;

pub use error::{Diagnostic, FormatError, FormatResult};
pub use mapping::{DrawioMapping, IdMap, format_style_string, synthesize_id_map};
pub use parser::DrawioParser;
pub use raw::{RawDrawioCell, RawDrawioDiagram, RawDrawioDocument, RawDrawioGeometry};
pub use writer::DrawioWriter;

/// Parse a `.drawio` XML string into a [`RawDrawioDocument`].
///
/// See [`DrawioParser::parse_str`] for the underlying implementation.
pub fn parse_drawio(xml: &str) -> FormatResult<RawDrawioDocument> {
    DrawioParser::new().parse_str(xml)
}

/// Parse with optional diagnostic collection.
///
/// Callers that want to collect compatibility diagnostics without failing can pass
/// a `&mut Vec<Diagnostic>`; those that don't care can pass `&mut Vec::new()`.
pub fn parse_drawio_with_diagnostics(
    xml: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> FormatResult<RawDrawioDocument> {
    DrawioParser::new().parse_str_with_diagnostics(xml, diagnostics)
}

/// Serialize a [`RawDrawioDocument`] to a `.drawio` XML string.
///
/// See [`DrawioWriter::write_string`] for the underlying implementation.
pub fn write_drawio(doc: &RawDrawioDocument) -> FormatResult<String> {
    DrawioWriter::new().write_string(doc)
}
