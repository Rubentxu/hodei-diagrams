//! Selection mutation payloads.
//!
//! These payloads operate on the engine-side `SelectionState` held by
//! `DiagramModel`. They are undoable in principle, but `ClearSelection`
//! cannot restore the previous selection without a snapshot mechanism.

use diagram_core::selection::SelectionTarget;
use serde::{Deserialize, Serialize};

use crate::error::CommandResult;

/// Payload for selecting a specific target (additive — does not clear existing selection).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectTargetPayload {
    /// The target to select.
    pub target: SelectionTarget,
}

impl SelectTargetPayload {
    /// Create a new payload for selecting a target.
    pub fn new(target: SelectionTarget) -> Self {
        Self { target }
    }

    /// Apply: add the target to the selection.
    pub fn apply(&mut self, model: &mut diagram_core::DiagramModel) -> CommandResult<()> {
        model.selection_mut().select(self.target.clone());
        Ok(())
    }

    /// Undo: remove the target we just selected.
    ///
    /// If the target was already selected before this command, this is a
    /// best-effort restore — we don't track prior state.
    pub fn undo(&mut self, model: &mut diagram_core::DiagramModel) -> CommandResult<()> {
        model.selection_mut().deselect(&self.target);
        Ok(())
    }
}

/// Payload for deselecting a specific target.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeselectTargetPayload {
    /// The target to deselect.
    pub target: SelectionTarget,
}

impl DeselectTargetPayload {
    /// Create a new payload for deselecting a target.
    pub fn new(target: SelectionTarget) -> Self {
        Self { target }
    }

    /// Apply: remove the target from the selection.
    pub fn apply(&mut self, model: &mut diagram_core::DiagramModel) -> CommandResult<()> {
        model.selection_mut().deselect(&self.target);
        Ok(())
    }

    /// Undo: re-select the target (best-effort without snapshot).
    pub fn undo(&mut self, model: &mut diagram_core::DiagramModel) -> CommandResult<()> {
        model.selection_mut().select(self.target.clone());
        Ok(())
    }
}

/// Payload for clearing the entire selection.
///
/// This command has no meaningful inverse without a snapshot mechanism.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ClearSelectionPayload;

impl ClearSelectionPayload {
    /// Create a new clear selection payload.
    pub fn new() -> Self {
        Self
    }

    /// Apply: clear all selections.
    pub fn apply(&mut self, model: &mut diagram_core::DiagramModel) -> CommandResult<()> {
        model.selection_mut().clear();
        Ok(())
    }

    /// Undo: no-op. Cannot restore previous selection without a snapshot.
    pub fn undo(&mut self, _model: &mut diagram_core::DiagramModel) -> CommandResult<()> {
        Ok(())
    }
}

/// Payload for toggling a target's selection state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToggleSelectionPayload {
    /// The target to toggle.
    pub target: SelectionTarget,
}

impl ToggleSelectionPayload {
    /// Create a new payload for toggling a target.
    pub fn new(target: SelectionTarget) -> Self {
        Self { target }
    }

    /// Apply: toggle the target's selection state.
    pub fn apply(&mut self, model: &mut diagram_core::DiagramModel) -> CommandResult<()> {
        model.selection_mut().toggle(self.target.clone());
        Ok(())
    }

    /// Undo: toggle again to restore prior state.
    pub fn undo(&mut self, model: &mut diagram_core::DiagramModel) -> CommandResult<()> {
        model.selection_mut().toggle(self.target.clone());
        Ok(())
    }
}
