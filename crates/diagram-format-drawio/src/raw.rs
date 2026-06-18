//! Raw `.drawio` model.
//!
//! Parsing produces a raw view of the document before we map it into the
//! diagram-core domain. Keeping the raw model around — for now — means we can
//! faithfully round-trip XML while the domain mapping layer matures.
//!
//! See `docs/adr/0026-parse-drawio-into-raw-model-before-domain-mapping.md`
//! and `docs/adr/0027-keep-raw-drawio-model-inside-format-crate-for-now.md`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// Root document of a `.drawio` file: `<mxfile>` containing one or more
/// diagrams.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct RawDrawioDocument {
    /// Diagrams (`<diagram>` elements) inside the document, in document order.
    pub diagrams: Vec<RawDrawioDiagram>,
}

/// A single `<diagram>` element, which corresponds to a [`crate::page::Page`]
/// in the domain model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawDrawioDiagram {
    /// Optional diagram name (matches the `name` attribute on `<diagram>`).
    pub name: Option<String>,
    /// Cells (vertices, edges, groups) belonging to this diagram.
    pub cells: Vec<RawDrawioCell>,
}

/// A single `<mxCell>` element.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawDrawioCell {
    /// Raw `id` attribute, kept as `String` to preserve whatever the source
    /// document used.
    pub id: String,
    /// Raw `value` attribute (label text).
    pub value: Option<String>,
    /// Raw `style` attribute.
    pub style: Option<String>,
    /// Raw `vertex` attribute (`"1"` for a vertex).
    pub vertex: bool,
    /// Raw `edge` attribute (`"1"` for an edge).
    pub edge: bool,
    /// Raw `parent` attribute (group membership).
    pub parent: Option<String>,
    /// Raw `source` attribute (edge source cell ID).
    pub source: Option<String>,
    /// Raw `target` attribute (edge target cell ID).
    pub target: Option<String>,
    /// Any other attributes we did not specifically model, preserved for
    /// round-trip fidelity.
    #[serde(default)]
    pub extra: BTreeMap<String, String>,
}