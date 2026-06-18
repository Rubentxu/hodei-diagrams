//! Corpus walking utilities.
//!
//! The compatibility testkit needs a way to discover `.drawio` files inside a
//! directory tree, honoring `.gitignore`-style exclusions when present.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// One entry returned by [`CorpusWalker`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorpusEntry {
    /// Absolute path to the entry on disk.
    pub path: PathBuf,
    /// Relative path from the corpus root, useful for diagnostics and
    /// golden-file naming.
    pub relative: PathBuf,
}

/// Walks a directory tree and yields `.drawio` files as [`CorpusEntry`]
/// values.
#[derive(Debug, Clone)]
pub struct CorpusWalker {
    root: PathBuf,
}

impl CorpusWalker {
    /// Create a new walker rooted at `root`.
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// Borrow the corpus root.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Collect every `.drawio` entry reachable from the root.
    ///
    /// Bootstrap stub: returns an empty vector. The real implementation will
    /// combine `walkdir` for traversal with `ignore` for `.gitignore`-aware
    /// filtering.
    pub fn collect(&self) -> Vec<CorpusEntry> {
        Vec::new()
    }
}