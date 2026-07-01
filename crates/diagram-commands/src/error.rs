//! Error types for the diagram-commands crate.

use diagram_core::CoreError;
use diagram_core::{EdgeId, GroupId, LayerId, PageId, StyleId, VertexId};
use thiserror::Error;

/// Errors that can occur while applying or undoing commands.
#[derive(Debug, Error)]
pub enum CommandError {
    /// Delegation from core errors.
    #[error(transparent)]
    Core(#[from] CoreError),

    /// A vertex was not found when applying a command.
    #[error("vertex `{0}` not found for command application")]
    VertexNotFound(VertexId),

    /// An edge was not found when applying a command.
    #[error("edge `{0}` not found")]
    EdgeNotFound(EdgeId),

    /// A group was not found when applying a command.
    #[error("group `{0}` not found")]
    GroupNotFound(GroupId),

    /// A page was not found when applying a command.
    #[error("page `{0}` not found")]
    PageNotFound(PageId),

    /// A layer was not found when applying a command.
    #[error("layer `{0}` not found")]
    LayerNotFound(LayerId),

    /// A style was not found when applying a command.
    #[error("style `{0}` not found")]
    StyleNotFound(StyleId),

    /// Cannot add an edge with a dangling source or target vertex.
    #[error("cannot add edge: dangling source `{0}` or target `{1}`")]
    DanglingEdge(VertexId, VertexId),

    /// A command was not previously applied; nothing to undo.
    #[error("command was not previously applied; nothing to undo")]
    NotApplied,

    /// Transaction aborted after applying some commands.
    #[error("transaction aborted after applying {applied} command(s)")]
    TransactionAborted {
        /// Number of commands successfully applied before the abort.
        applied: usize,
    },

    /// Undo requires re-inserting items but ID remap references were not found.
    #[error("undo requires re-inserting items; ID remap references not found")]
    UndoIdRemap,

    /// IP-E: A command was scaffolded but its full implementation is deferred
    /// to a follow-up cycle. The TS layer falls back to a UI-loop or
    /// surfaces a diagnostic.
    #[error("not implemented: {0}")]
    NotImplemented(String),
}

/// Convenience alias for `Result<T, CommandError>`.
pub type CommandResult<T> = Result<T, CommandError>;
