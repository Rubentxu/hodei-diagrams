//! Golden file storage for compatibility tests.
//!
//! Each golden fixture captures the expected engine output for a given
//! `.drawio` input. When the implementation changes, tests fail loudly and
//! the golden can be regenerated deliberately.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// One golden fixture: input + expected output + optional diagnostics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoldenFixture {
    /// Stable identifier used to name files in the golden store.
    pub name: String,
    /// Expected serialized engine output.
    pub expected: String,
    /// Expected diagnostics (often empty for green-path cases).
    #[serde(default)]
    pub diagnostics: Vec<crate::diagnostics::Diagnostic>,
}

/// On-disk store of [`GoldenFixture`]s, typically rooted at
/// `crates/diagram-compat-testkit/golden/`.
#[derive(Debug, Clone)]
pub struct GoldenStore {
    root: PathBuf,
}

impl GoldenStore {
    /// Create a new golden store rooted at `root`.
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// Borrow the store root.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Load a fixture by name, returning `None` if no such fixture exists.
    pub fn load(&self, _name: &str) -> Option<GoldenFixture> {
        // Bootstrap stub: the real implementation will deserialize from
        // `<root>/<name>.json` and surface a useful error on parse failure.
        None
    }
}