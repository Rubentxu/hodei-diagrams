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

/// Raw geometry data captured from an `<mxGeometry>` element.
///
/// The `as` attribute determines the coordinate space:
/// - `"geometry"` — absolute positioning (cell-level)
/// - `"graph"` — page-level geometry (emitted before any cell; safely ignored)
/// - missing or anything else — relative positioning
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawDrawioGeometry {
    /// Horizontal coordinate.
    pub x: f64,
    /// Vertical coordinate.
    pub y: f64,
    /// Width in user-space units.
    pub width: f64,
    /// Height in user-space units.
    pub height: f64,
    /// The raw `as` attribute value, verbatim.
    ///
    /// Possible values: `"geometry"` (absolute), `"graph"` (page-level),
    /// empty string or any other value (relative).
    pub r#as: String,
    /// Rotation angle in degrees (draw.io convention). Default 0.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f64>,
    /// Horizontal flip flag.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flip_h: Option<bool>,
    /// Vertical flip flag.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flip_v: Option<bool>,
    /// Waypoints parsed from `<Array as="points"><mxPoint .../></Array>`.
    /// Empty for vertices; populated for edges with custom routing.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub points: Vec<(f64, f64)>,
}

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
    /// Optional background color (matches the `background` attribute on `<diagram>`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
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
    /// Captured `<mxGeometry>` element for this cell, if present.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry: Option<RawDrawioGeometry>,
    /// Any other attributes we did not specifically model, preserved for
    /// round-trip fidelity.
    #[serde(default)]
    pub extra: BTreeMap<String, String>,
}
