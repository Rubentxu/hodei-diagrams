//! Selection mutation payloads.
//!
//! These payloads operate on the engine-side `SelectionState` held by
//! `DiagramModel`. They are undoable in principle, but `ClearSelection`
//! cannot restore the previous selection without a snapshot mechanism.

use diagram_core::selection::SelectionTarget;
use serde::{Deserialize, Serialize};

use crate::error::CommandResult;

#[cfg(test)]
mod tests {
    use diagram_core::DiagramModel;
    use diagram_core::selection::SelectionTarget;

    use super::*;

    fn make_model() -> DiagramModel {
        DiagramModel::new()
    }

    // ─── SelectTargetPayload ─────────────────────────────────────────────────

    #[test]
    fn test_select_target_apply() {
        let mut model = make_model();
        let target = SelectionTarget::Vertex(diagram_core::VertexId::default());

        let mut payload = SelectTargetPayload::new(target.clone());
        payload.apply(&mut model).unwrap();

        assert!(
            model.selection().contains(&target),
            "target should be selected after apply"
        );
    }

    #[test]
    fn test_select_target_undo() {
        let mut model = make_model();
        let target = SelectionTarget::Vertex(diagram_core::VertexId::default());

        let mut payload = SelectTargetPayload::new(target.clone());
        payload.apply(&mut model).unwrap();
        assert!(model.selection().contains(&target));

        payload.undo(&mut model).unwrap();
        assert!(
            !model.selection().contains(&target),
            "target should be deselected after undo"
        );
    }

    // ─── DeselectTargetPayload ───────────────────────────────────────────────

    #[test]
    fn test_deselect_target_apply() {
        let mut model = make_model();
        let target = SelectionTarget::Vertex(diagram_core::VertexId::default());

        // Pre-select the target
        model.selection_mut().select(target.clone());
        assert!(model.selection().contains(&target));

        let mut payload = DeselectTargetPayload::new(target.clone());
        payload.apply(&mut model).unwrap();

        assert!(
            !model.selection().contains(&target),
            "target should be deselected after apply"
        );
    }

    #[test]
    fn test_deselect_target_undo() {
        let mut model = make_model();
        let target = SelectionTarget::Vertex(diagram_core::VertexId::default());

        // Pre-select the target
        model.selection_mut().select(target.clone());

        let mut payload = DeselectTargetPayload::new(target.clone());
        payload.apply(&mut model).unwrap();
        assert!(!model.selection().contains(&target));

        payload.undo(&mut model).unwrap();
        assert!(
            model.selection().contains(&target),
            "target should be re-selected after undo"
        );
    }

    // ─── ToggleSelectionPayload ──────────────────────────────────────────────

    #[test]
    fn test_toggle_selection_apply() {
        let mut model = make_model();
        let target = SelectionTarget::Vertex(diagram_core::VertexId::default());

        // Start unselected — toggle should select
        assert!(!model.selection().contains(&target));
        let mut payload = ToggleSelectionPayload::new(target.clone());
        payload.apply(&mut model).unwrap();
        assert!(
            model.selection().contains(&target),
            "target should be selected after toggle from unselected"
        );
    }

    #[test]
    fn test_toggle_selection_from_selected() {
        let mut model = make_model();
        let target = SelectionTarget::Vertex(diagram_core::VertexId::default());

        // Start selected — toggle should deselect
        model.selection_mut().select(target.clone());
        assert!(model.selection().contains(&target));

        let mut payload = ToggleSelectionPayload::new(target.clone());
        payload.apply(&mut model).unwrap();
        assert!(
            !model.selection().contains(&target),
            "target should be deselected after toggle from selected"
        );
    }

    #[test]
    fn test_toggle_selection_undo() {
        let mut model = make_model();
        let target = SelectionTarget::Vertex(diagram_core::VertexId::default());

        // Start unselected — toggle select — undo should deselect
        let mut payload = ToggleSelectionPayload::new(target.clone());
        payload.apply(&mut model).unwrap();
        assert!(model.selection().contains(&target));

        payload.undo(&mut model).unwrap();
        assert!(
            !model.selection().contains(&target),
            "target should be unselected after undo"
        );
    }

    // ─── ClearSelectionPayload ───────────────────────────────────────────────

    #[test]
    fn test_clear_selection_apply() {
        let mut model = make_model();
        let target1 = SelectionTarget::Vertex(diagram_core::VertexId::default());
        let target2 = SelectionTarget::Group(diagram_core::GroupId::default());

        // Pre-select multiple targets
        model.selection_mut().select(target1.clone());
        model.selection_mut().select(target2.clone());
        assert_eq!(model.selection().len(), 2);

        let mut payload = ClearSelectionPayload::new();
        payload.apply(&mut model).unwrap();

        assert!(
            model.selection().is_empty(),
            "selection should be empty after clear"
        );
    }

    #[test]
    fn test_clear_selection_undo_is_noop() {
        let mut model = make_model();
        let target = SelectionTarget::Vertex(diagram_core::VertexId::default());

        model.selection_mut().select(target.clone());
        assert!(model.selection().contains(&target));

        let mut payload = ClearSelectionPayload::new();
        payload.apply(&mut model).unwrap();
        assert!(model.selection().is_empty());

        // Undo cannot restore previous selection without a snapshot
        payload.undo(&mut model).unwrap();
        assert!(
            model.selection().is_empty(),
            "undo of clear_selection is a no-op"
        );
    }
}

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
