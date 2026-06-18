//! `.drawio` writer.
//!
//! Bootstrap stub. Real serialization will be added once the domain model is
//! stable enough to round-trip without losing metadata.

use crate::error::FormatResult;
use crate::raw::RawDrawioDocument;

/// Stateless `.drawio` writer.
#[derive(Debug, Default, Clone, Copy)]
pub struct DrawioWriter;

impl DrawioWriter {
    /// Create a new writer instance.
    pub fn new() -> Self {
        Self
    }

    /// Serialize a [`RawDrawioDocument`] back to a `.drawio` XML string.
    pub fn write_string(&self, _document: &RawDrawioDocument) -> FormatResult<String> {
        // Bootstrap stub. The eventual implementation will:
        // 1. Emit `<mxfile>` with one `<diagram>` per page.
        // 2. Emit `<mxGraphModel>` with a `<root>` containing all cells.
        // 3. Preserve unknown attributes verbatim via `RawDrawioCell::extra`.
        Ok(String::new())
    }
}