//! Typed errors for the `.drawio` format crate.
//!
//! Format errors must distinguish between three failure modes so the
//! compatibility testkit and the eventual engine façade can produce useful
//! diagnostics:
//!
//! 1. The XML itself is malformed (parser-level failure).
//! 2. The structure is well-formed XML but does not conform to `.drawio`
//!    expectations (semantic-level failure).
//! 3. The mapping into the diagram-core domain model loses or transforms
//!    information that the user wants surfaced as a warning rather than a
//!    hard failure.

use thiserror::Error;

/// Errors produced while reading or writing `.drawio` files.
#[derive(Debug, Error)]
pub enum FormatError {
    /// The XML input could not be parsed at all.
    #[error("malformed .drawio XML: {0}")]
    MalformedXml(String),

    /// The XML was well-formed but did not match the `.drawio` schema
    /// (`<mxfile>` / `<diagram>` / `<mxGraphModel>`).
    #[error("invalid .drawio structure: {0}")]
    InvalidStructure(String),

    /// The mapping from the raw model into `diagram-core` failed because of
    /// a missing or invalid attribute.
    #[error("could not map raw drawio model to diagram-core: {0}")]
    MappingFailed(String),

    /// A compression or decompression step failed.
    #[error("deflate compression error: {0}")]
    Deflate(String),

    /// A base64 decoding step failed.
    #[error("base64 decode error: {0}")]
    Base64(String),

    /// A compatibility diagnostic that the caller may choose to surface as a
    /// warning rather than a hard error.
    #[error("compatibility diagnostic at {location}: {message}")]
    CompatibilityDiagnostic {
        /// Where in the document the diagnostic was produced (e.g., a path
        /// like `mxfile/diagram[2]/mxGraphModel/root/cell[5]`).
        location: String,
        /// Human-readable message describing the diagnostic.
        message: String,
    },
}

/// Convenience alias for `Result<T, FormatError>` in the format crate.
pub type FormatResult<T> = Result<T, FormatError>;

impl From<std::io::Error> for FormatError {
    fn from(e: std::io::Error) -> Self {
        FormatError::InvalidStructure(format!("I/O error: {e}"))
    }
}

/// A compatibility diagnostic produced during parsing.
///
/// Unlike [`FormatError`], a diagnostic is not a hard failure — callers may
/// collect these in a vector and surface them as warnings without aborting the
/// parse.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    /// Path-like location in the document, e.g. `mxfile/diagram[0]/mxCell[2]`.
    pub location: String,
    /// Human-readable message describing the diagnostic.
    pub message: String,
}
