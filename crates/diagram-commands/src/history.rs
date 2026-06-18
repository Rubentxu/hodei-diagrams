//! History for undo/redo tracking.
//!
//! Full implementation lands in PR2.

use crate::Command;

/// History store for undo/redo entries.
///
/// Full implementation lands in PR2.
#[derive(Debug, Default)]
pub struct History {
    _private: (),
}

// Stub — replaced in PR2
impl History {
    /// Create a new empty history.
    pub fn new() -> Self {
        Self { _private: () }
    }

    /// Push a new history entry.
    pub fn push(&mut self, _commands: Vec<Command>) {}

    /// Check if undo is available.
    pub fn can_undo(&self) -> bool {
        false
    }

    /// Check if redo is available.
    pub fn can_redo(&self) -> bool {
        false
    }

    /// Number of applied history entries.
    pub fn len(&self) -> usize {
        0
    }

    /// Returns true if history is empty.
    pub fn is_empty(&self) -> bool {
        true
    }

    /// Total capacity (number of entries).
    pub fn capacity(&self) -> usize {
        0
    }
}
