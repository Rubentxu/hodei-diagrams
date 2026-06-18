//! Domain mapping: convert the raw `.drawio` model into a
//! [`diagram_core::DiagramModel`] and back.
//!
//! The raw model is the source of truth for round-trip fidelity; the domain
//! model is the source of truth for editing and rendering. This module is
//! where we reconcile the two without leaking `.drawio` semantics upward.
//!
//! See `docs/adr/0009-rust-native-model-with-drawio-mapping.md` and
//! `docs/adr/0024-preserve-unknown-when-safe-degrade-explicitly.md`.

use diagram_core::DiagramModel;

use crate::error::FormatResult;
use crate::raw::RawDrawioDocument;

/// Stateless mapper from raw `.drawio` documents to the diagram-core domain
/// model.
#[derive(Debug, Default, Clone, Copy)]
pub struct DrawioMapping;

impl DrawioMapping {
    /// Create a new mapping instance.
    pub fn new() -> Self {
        Self
    }

    /// Convert a [`RawDrawioDocument`] into a [`DiagramModel`].
    pub fn to_domain(&self, _raw: &RawDrawioDocument) -> FormatResult<DiagramModel> {
        // Bootstrap stub: returns an empty model. The real implementation will:
        // 1. Allocate one `Page` per `RawDrawioDiagram`.
        // 2. Allocate engine IDs for cells in deterministic order.
        // 3. Map style attributes into a `StyleMap`.
        // 4. Record diagnostics (not errors) for unknown attributes.
        Ok(DiagramModel::new())
    }
}