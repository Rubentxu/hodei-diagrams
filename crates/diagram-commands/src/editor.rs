//! Editor façade and Transaction builder.
//!
//! Full implementation lands in PR2 (history + editor + transaction).

use diagram_core::DiagramModel;

use crate::error::{CommandError, CommandResult};

/// Editor façade for executing commands with undo/redo support.
///
/// Full implementation lands in PR2.
#[derive(Debug)]
pub struct Editor {
    _private: (),
}

// Stub — replaced in PR2
impl Editor {
    /// Create a new editor wrapping the given model.
    pub fn new(_model: DiagramModel) -> Self {
        Self { _private: () }
    }

    /// Execute a single command.
    pub fn execute(&mut self, _cmd: crate::Command) -> CommandResult<()> {
        Err(CommandError::NotApplied)
    }

    /// Undo the last command.
    pub fn undo(&mut self) -> CommandResult<()> {
        Err(CommandError::NotApplied)
    }

    /// Redo the last undone command.
    pub fn redo(&mut self) -> CommandResult<()> {
        Err(CommandError::NotApplied)
    }

    /// Borrow the model.
    pub fn model(&self) -> &DiagramModel {
        unimplemented!()
    }

    /// Consume and return the model.
    pub fn into_model(self) -> DiagramModel {
        unimplemented!()
    }

    /// Check if undo is available.
    pub fn can_undo(&self) -> bool {
        false
    }

    /// Check if redo is available.
    pub fn can_redo(&self) -> bool {
        false
    }
}

// Stub — replaced in PR2
/// Transaction builder for atomic multi-command operations.
///
/// Full implementation lands in PR2.
#[derive(Debug, Default)]
pub struct Transaction {
    _private: (),
}

// Stub — replaced in PR2
impl Transaction {
    /// Create a new empty transaction.
    pub fn new() -> Self {
        Self { _private: () }
    }

    /// Add a vertex to the transaction.
    pub fn add_vertex(self, _v: diagram_core::Vertex) -> Self {
        unimplemented!()
    }

    /// Commit the transaction atomically.
    pub fn commit(self, _editor: &mut Editor) -> CommandResult<()> {
        Err(CommandError::NotApplied)
    }

    /// Number of pending commands in the transaction.
    pub fn pending(&self) -> usize {
        0
    }
}
