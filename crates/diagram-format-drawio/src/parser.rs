//! `quick-xml` based parser for `.drawio` files.
//!
//! This module only produces a [`RawDrawioDocument`]. Domain mapping lives in
//! the sibling [`crate::mapping`] module.

use crate::error::{FormatError, FormatResult};
use crate::raw::RawDrawioDocument;

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
    pub fn parse_str(&self, _source: &str) -> FormatResult<RawDrawioDocument> {
        // Bootstrap stub: we deliberately keep the parser surface small until
        // the XML traversal strategy is locked in. Future revisions will
        // switch to a streaming reader driven by `quick-xml::events::Event`.
        Err(FormatError::InvalidStructure(
            "diagram-format-drawio parser is a bootstrap stub".to_owned(),
        ))
    }
}