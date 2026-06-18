//! Style storage for the Diagram Engine.
//!
//! The bootstrap cut models styles as a flexible `String → String` map so we
//! can ingest arbitrary `.drawio` style attributes without prematurely
//! committing to a typed schema. A typed layer can be layered on top later
//! without breaking the public surface.
//!
//! See `docs/adr/0021-start-styles-as-flexible-map-then-type-gradually.md`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// A style value carried in a [`StyleMap`].
///
/// Stringly-typed for the bootstrap cut so unknown attributes from `.drawio`
/// inputs survive a round-trip without loss. This is a deliberate trade-off
/// until we have enough corpus coverage to safely promote hot keys to typed
/// variants.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct StyleValue(pub String);

impl StyleValue {
    /// Borrow the underlying string.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for StyleValue {
    fn from(value: &str) -> Self {
        Self(value.to_owned())
    }
}

impl From<String> for StyleValue {
    fn from(value: String) -> Self {
        Self(value)
    }
}

/// Ordered collection of style key/value pairs.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StyleMap {
    /// Underlying map; `BTreeMap` for deterministic iteration order.
    entries: BTreeMap<String, StyleValue>,
}

impl StyleMap {
    /// Create an empty style map.
    pub fn new() -> Self {
        Self::default()
    }

    /// Borrow a style value by key.
    pub fn get(&self, key: &str) -> Option<&StyleValue> {
        self.entries.get(key)
    }

    /// Insert or overwrite a style value.
    pub fn insert(&mut self, key: impl Into<String>, value: impl Into<StyleValue>) {
        self.entries.insert(key.into(), value.into());
    }

    /// Remove a style value, returning it if it was present.
    pub fn remove(&mut self, key: &str) -> Option<StyleValue> {
        self.entries.remove(key)
    }

    /// Iterate over `(key, value)` pairs in lexicographic key order.
    pub fn iter(&self) -> impl Iterator<Item = (&str, &StyleValue)> {
        self.entries.iter().map(|(k, v)| (k.as_str(), v))
    }

    /// Number of style entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Returns `true` if the style map has no entries.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}
