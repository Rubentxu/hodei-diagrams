//! Typed errors for the Diagram Engine core.
//!
//! Keep errors explicit and actionable. Avoid `anyhow` here — every error
//! variant should carry enough context for callers to handle the failure or
//! produce a meaningful diagnostic.

use thiserror::Error;

/// Errors that can occur while building or mutating a [`crate::DiagramModel`].
#[derive(Debug, Error)]
pub enum CoreError {
    /// A [`crate::VertexId`] referenced by an operation was not present in the
    /// store. Indicates stale IDs after removal, or a programming mistake.
    #[error("vertex `{0}` not found in model store")]
    VertexNotFound(crate::VertexId),

    /// An [`crate::EdgeId`] referenced by an operation was not present in the
    /// store.
    #[error("edge `{0}` not found in model store")]
    EdgeNotFound(crate::EdgeId),

    /// A [`crate::PageId`] referenced by an operation was not present in the
    /// store.
    #[error("page `{0}` not found in model store")]
    PageNotFound(crate::PageId),

    /// A [`crate::GroupId`] referenced by an operation was not present in the
    /// store.
    #[error("group `{0}` not found in model store")]
    GroupNotFound(crate::GroupId),

    /// A [`crate::StyleId`] referenced by an operation was not present in the
    /// store.
    #[error("style `{0}` not found in model store")]
    StyleNotFound(crate::StyleId),

    /// An attempt to insert into a slotmap failed because the underlying key
    /// space was exhausted. Indicates runaway growth in the engine core.
    #[error("slotmap key space exhausted for `{store}`")]
    SlotmapExhausted {
        /// Name of the slotmap that ran out of keys.
        store: &'static str,
    },

    /// A geometry operation received invalid arguments (negative size,
    /// non-finite coordinate, etc.).
    #[error("invalid geometry: {0}")]
    InvalidGeometry(String),

    /// An invariant of the core model was violated. This usually signals a
    /// programming bug rather than user input.
    #[error("model invariant violated: {0}")]
    InvariantViolation(String),
}

/// Convenience alias for `Result<T, CoreError>` in the core crate.
pub type CoreResult<T> = Result<T, CoreError>;
