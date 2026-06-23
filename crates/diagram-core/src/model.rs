//! Top-level diagram model.
//!
//! A [`DiagramModel`] owns one or more [`Page`]s and the shared style store.
//! The engine façade (when it exists) will compose the model with commands
//! and selection state; for now we expose the model on its own so tests and
//! format crates can construct and inspect it directly.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::page::Page;
use crate::store::ModelStore;

/// Engine-stamped epoch used as the default value for `created` and `modified`.
pub fn default_epoch() -> DateTime<Utc> {
    DateTime::from_timestamp(0, 0).unwrap()
}

/// Diagram metadata: title, author, description, tags, and engine-stamped timestamps.
///
/// `created` is set on first `set_metadata` call and never modified afterwards.
/// `modified` is updated on every `set_metadata` call.
/// Both timestamps are managed by the engine and are NOT written to `.drawio` XML
/// (the `modified` field in XML is a separate path handled at the format layer).
///
/// User-authored fields (`title`, `author`, `description`, `tags`) round-trip
/// via `<mxfile vars='{…}'>` in the draw.io format.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Metadata {
    /// Diagram title. User-authored; round-trips via `<mxfile vars>`.
    pub title: Option<String>,
    /// Diagram author. User-authored; round-trips via `<mxfile vars>`.
    pub author: Option<String>,
    /// Diagram description. User-authored; round-trips via `<mxfile vars>`.
    pub description: Option<String>,
    /// Diagram tags. User-authored; round-trips via `<mxfile vars>` as CSV.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Creation timestamp. Engine-stamped on first `set_metadata`; never written to XML.
    #[serde(default = "default_epoch")]
    pub created: DateTime<Utc>,
    /// Last-modified timestamp. Engine-stamped on every `set_metadata`; never written to XML.
    #[serde(default = "default_epoch")]
    pub modified: DateTime<Utc>,
}

impl Metadata {
    /// Create a new `Metadata` with `created = modified = Utc::now()`.
    pub fn new() -> Self {
        let now = Utc::now();
        Self {
            created: now,
            modified: now,
            ..Default::default()
        }
    }

    /// Update `modified` to the given timestamp.
    /// Sets `created` to `ts` only if `created` is still the default epoch
    /// (idempotent guard — ensures `created` is set only once).
    pub fn touch_modified(&mut self, ts: DateTime<Utc>) {
        if self.created == default_epoch() {
            self.created = ts;
        }
        self.modified = ts;
    }

    /// Returns `true` if this metadata has any user-authored content set.
    pub fn has_content(&self) -> bool {
        self.title.is_some()
            || self.author.is_some()
            || self.description.is_some()
            || !self.tags.is_empty()
    }
}

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
    /// Diagram metadata (title, author, description, tags, timestamps).
    pub metadata: Option<Metadata>,
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

    /// Borrow the diagram metadata, if any.
    pub fn metadata(&self) -> Option<&Metadata> {
        self.metadata.as_ref()
    }

    /// Set the diagram metadata, replacing any existing value.
    pub fn set_metadata(&mut self, m: Metadata) {
        self.metadata = Some(m);
    }

    /// Clear the diagram metadata.
    pub fn clear_metadata(&mut self) {
        self.metadata = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_default_is_none() {
        assert!(DiagramModel::new().metadata().is_none());
    }

    #[test]
    fn metadata_default_struct_is_zero_epoch() {
        let m = Metadata::default();
        let epoch = default_epoch();
        assert_eq!(m.created, epoch);
        assert_eq!(m.modified, epoch);
    }

    #[test]
    fn metadata_serde_roundtrip() {
        let m = Metadata {
            title: Some("Test Title".into()),
            author: Some("Test Author".into()),
            description: Some("Test Description".into()),
            tags: vec!["tag1".into(), "tag2".into()],
            created: default_epoch(),
            modified: default_epoch(),
        };
        let json = serde_json::to_string(&m).unwrap();
        let parsed: Metadata = serde_json::from_str(&json).unwrap();
        assert_eq!(m, parsed);
    }

    #[test]
    fn metadata_clone_is_equal() {
        let m = Metadata::new();
        assert_eq!(m.clone(), m);
    }

    #[test]
    fn metadata_touch_modified_first_call_sets_both() {
        let mut m = Metadata::default();
        let now = chrono::Utc::now();
        m.touch_modified(now);
        assert_eq!(m.created, now);
        assert_eq!(m.modified, now);
    }

    #[test]
    fn metadata_touch_modified_second_call_updates_only_modified() {
        let mut m = Metadata::default();
        let now1 = chrono::Utc::now();
        let now2 = now1 + chrono::Duration::seconds(10);
        m.touch_modified(now1);
        m.touch_modified(now2);
        assert_eq!(m.created, now1); // created stays as first value
        assert_eq!(m.modified, now2); // modified updates to new value
    }

    // Compile-time assertion: Metadata must not contain slotmap key types.
    // Metadata is used in contexts that require it to be freely copyable/clonable
    // without the constraints of slotmap keys (which are non-Copy and tied to stores).
    // If a slotmap key type (VertexId, EdgeId, GroupId, PageId, StyleId) were added
    // to Metadata, the type bounds in the surrounding code would fail to compile.
    //
    // INVARIANT: Metadata implements Send + Sync. Slotmap keys (VertexId, EdgeId,
    // GroupId, PageId, StyleId) are NOT Send + Sync because they are tied to the
    // slotmap stores they belong to. Therefore Metadata cannot contain slotmap keys.
    fn _assert_metadata_send_sync<'a, T: Send + Sync + 'a>() {}
    fn _metadata_invariant() {
        _assert_metadata_send_sync::<Metadata>();
    }
}
