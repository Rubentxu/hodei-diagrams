//! Top-level diagram model.
//!
//! A [`DiagramModel`] owns one or more [`Page`]s and the shared style store.
//! The engine façade (when it exists) will compose the model with commands
//! and selection state; for now we expose the model on its own so tests and
//! format crates can construct and inspect it directly.

use crate::page::Page;
use crate::store::ModelStore;

/// The semantic model of a diagram: pages plus shared style metadata.
///
/// `DiagramModel` is deliberately not `Clone`: the underlying
/// [`ModelStore`] uses slotmap keys, which are not `Clone`. Cloning a
/// diagram is a meaningful operation that should go through an explicit
/// snapshot/serialization API (yet to be designed).
#[derive(Debug, Default)]
pub struct DiagramModel {
    /// Storage for pages, vertices, edges, groups, and styles.
    pub store: ModelStore,
}

impl DiagramModel {
    /// Create an empty diagram model.
    pub fn new() -> Self {
        Self::default()
    }

    /// Borrow the pages stored in the model.
    pub fn pages(&self) -> impl Iterator<Item = &Page> {
        self.store.pages()
    }

    /// Total number of pages currently in the model.
    pub fn page_count(&self) -> usize {
        self.store.page_count()
    }
}
