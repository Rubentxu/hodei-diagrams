//! Compatibility diagnostics surfaced by the testkit.
//!
//! Diagnostics are structured so they can be aggregated across a corpus and
//! summarized in a report. They are NOT panics — a single unknown style
//! attribute should not fail an entire test run.

use serde::{Deserialize, Serialize};

/// Severity of a [`Diagnostic`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    /// Informational note; safe to ignore.
    Info,
    /// Recoverable loss of information that the engine may need to revisit.
    Warning,
    /// Likely semantic difference from the upstream behavior.
    Degradation,
}

/// A single compatibility diagnostic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    /// Where in the input the diagnostic was produced.
    pub location: String,
    /// Severity bucket.
    pub severity: Severity,
    /// Human-readable message.
    pub message: String,
}

impl Diagnostic {
    /// Create a new diagnostic with [`Severity::Info`].
    pub fn info(location: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            location: location.into(),
            severity: Severity::Info,
            message: message.into(),
        }
    }

    /// Create a new diagnostic with [`Severity::Warning`].
    pub fn warning(location: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            location: location.into(),
            severity: Severity::Warning,
            message: message.into(),
        }
    }

    /// Create a new diagnostic with [`Severity::Degradation`].
    pub fn degradation(location: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            location: location.into(),
            severity: Severity::Degradation,
            message: message.into(),
        }
    }
}
