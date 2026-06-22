//! Error types for stencil parsing.

use thiserror::Error;

/// A parsing or validation error for a stencil.
#[derive(Debug, Error)]
pub enum StencilError {
    /// The XML document is not valid or cannot be parsed.
    #[error("invalid XML: {0}")]
    Xml(String),

    /// No `<shapes>` root element found.
    #[error("missing <shapes> root element")]
    MissingRoot,

    /// No `<shape>` element found within the shapes.
    #[error("no <shape> element found")]
    MissingShape,

    /// A required attribute is missing.
    #[error("missing required attribute '{0}' on <{1}> element")]
    MissingAttribute(&'static str, &'static str),

    /// A numeric attribute has an invalid value.
    #[error("invalid numeric value for '{0}': {1}")]
    InvalidNumber(&'static str, String),
}

/// A warning or informational diagnostic from parsing.
#[derive(Debug, Clone, PartialEq)]
pub struct Diagnostic {
    /// Location in the XML source.
    pub location: String,
    /// Human-readable message.
    pub message: String,
}

impl Diagnostic {
    /// Create a new diagnostic.
    pub fn new(location: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            location: location.into(),
            message: message.into(),
        }
    }

    /// Create a degenerate-aspect diagnostic (w or h is zero).
    pub fn degenerate_aspect() -> Self {
        Self {
            location: "<shape>".into(),
            message: "degenerate aspect ratio (w=0 or h=0) — clamped to 1.0".into(),
        }
    }
}
