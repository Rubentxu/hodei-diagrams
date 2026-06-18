//! Labels for vertices, edges, groups, and pages.
//!
//! Labels are modeled as potentially rich content (plain text now, with room
//! to evolve into styled or structured runs). The engine keeps them as owned
//! `String`s in this initial cut; future revisions may introduce a richer
//! content enum without breaking the public surface.
//!
//! See `docs/adr/0022-model-labels-as-potentially-rich-content.md`.

use serde::{Deserialize, Serialize};

/// A label attached to a vertex, edge, group, or page.
///
/// For the bootstrap cut this is a single owned string. The struct is
/// deliberately non-exhaustive so we can grow into a richer content model
/// without churning every call site.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[non_exhaustive]
pub struct Label {
    /// The visible text of the label.
    pub text: String,
}

impl Label {
    /// Create a new label from owned text.
    pub fn new(text: impl Into<String>) -> Self {
        Self { text: text.into() }
    }

    /// Borrow the label text as a string slice.
    pub fn as_str(&self) -> &str {
        &self.text
    }

    /// Returns `true` if the label has no visible text.
    pub fn is_empty(&self) -> bool {
        self.text.is_empty()
    }
}

impl From<&str> for Label {
    fn from(value: &str) -> Self {
        Self::new(value)
    }
}

impl From<String> for Label {
    fn from(value: String) -> Self {
        Self { text: value }
    }
}
