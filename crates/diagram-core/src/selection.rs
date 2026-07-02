//! Engine-owned selection state.
//!
//! Selection is a pure engine-side concern: the engine tracks which targets
//! (vertices, groups, edges) are currently selected. The WASM boundary
//! exposes this state and allows mutation via commands.

use crate::{EdgeId, GroupId, VertexId};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// A selected target in the diagram.
//
// INVARIANT: `SelectionTarget` must remain serde-transparent (untagged) so the
// WASM boundary can serialize/deserialize it as a simple JSON object with a
// `type` field matching the variant name.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "type", content = "id")]
pub enum SelectionTarget {
    /// A vertex is selected.
    Vertex(VertexId),
    /// A group is selected.
    Group(GroupId),
    /// An edge is selected.
    Edge(EdgeId),
}

impl SelectionTarget {
    /// Returns `true` if this target is locked.
    ///
    /// Currently a stub — real implementation requires access to the model store.
    /// Locked targets cannot be selected or manipulated by the user.
    pub fn is_locked(&self) -> bool {
        // TODO: Delegate to model store once selection lives in DiagramModel.
        // For now, no target is locked.
        false
    }
}

/// The engine's current selection state.
#[derive(Default, Debug, Clone, PartialEq, Eq)]
pub struct SelectionState {
    selected: HashSet<SelectionTarget>,
}

impl SelectionState {
    /// Select a target, adding it to the current selection.
    pub fn select(&mut self, target: SelectionTarget) {
        self.selected.insert(target);
    }

    /// Deselect a specific target.
    pub fn deselect(&mut self, target: &SelectionTarget) {
        self.selected.remove(target);
    }

    /// Clear the entire selection.
    pub fn clear(&mut self) {
        self.selected.clear();
    }

    /// Returns `true` if the given target is currently selected.
    pub fn contains(&self, target: &SelectionTarget) -> bool {
        self.selected.contains(target)
    }

    /// Returns `true` if nothing is selected.
    pub fn is_empty(&self) -> bool {
        self.selected.is_empty()
    }

    /// Returns the number of selected targets.
    pub fn len(&self) -> usize {
        self.selected.len()
    }

    /// Returns an iterator over all selected targets.
    pub fn all(&self) -> impl Iterator<Item = &SelectionTarget> {
        self.selected.iter()
    }

    /// Toggle a target: select it if not selected, deselect it if selected.
    pub fn toggle(&mut self, target: SelectionTarget) {
        if self.selected.contains(&target) {
            self.selected.remove(&target);
        } else {
            self.selected.insert(target);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_vid() -> VertexId {
        VertexId::default()
    }

    fn default_gid() -> GroupId {
        GroupId::default()
    }

    fn default_eid() -> EdgeId {
        EdgeId::default()
    }

    #[test]
    fn selection_target_variant_vertex() {
        let target = SelectionTarget::Vertex(default_vid());
        assert!(matches!(target, SelectionTarget::Vertex(_)));
        assert!(!target.is_locked());
    }

    #[test]
    fn selection_target_variant_group() {
        let target = SelectionTarget::Group(default_gid());
        assert!(matches!(target, SelectionTarget::Group(_)));
    }

    #[test]
    fn selection_target_variant_edge() {
        let target = SelectionTarget::Edge(default_eid());
        assert!(matches!(target, SelectionTarget::Edge(_)));
    }

    #[test]
    fn selection_target_equality() {
        let vid = default_vid();
        let target1 = SelectionTarget::Vertex(vid);
        let target2 = SelectionTarget::Vertex(vid);
        assert_eq!(target1, target2);
    }

    #[test]
    fn selection_target_inequality_different_variant() {
        let target1 = SelectionTarget::Vertex(default_vid());
        let target2 = SelectionTarget::Group(default_gid());
        assert_ne!(target1, target2);
    }

    #[test]
    fn selection_state_default_is_empty() {
        let state = SelectionState::default();
        assert!(state.is_empty());
        assert_eq!(state.len(), 0);
    }

    #[test]
    fn selection_state_select_and_contains() {
        let mut state = SelectionState::default();
        let target = SelectionTarget::Vertex(default_vid());

        assert!(!state.contains(&target));
        state.select(target.clone());
        assert!(state.contains(&target));
    }

    #[test]
    fn selection_state_clear() {
        let mut state = SelectionState::default();
        let target = SelectionTarget::Vertex(default_vid());

        state.select(target);
        assert!(!state.is_empty());

        state.clear();
        assert!(state.is_empty());
    }

    #[test]
    fn selection_state_deselect() {
        let mut state = SelectionState::default();
        let vid = default_vid();
        let target = SelectionTarget::Vertex(vid);

        state.select(target.clone());
        assert!(state.contains(&target));

        state.deselect(&target);
        assert!(!state.contains(&target));
    }

    #[test]
    fn selection_state_toggle_select() {
        let mut state = SelectionState::default();
        let target = SelectionTarget::Vertex(default_vid());

        // Not selected → toggle → selected
        state.toggle(target);
        assert!(state.contains(&SelectionTarget::Vertex(default_vid())));
    }

    #[test]
    fn selection_state_toggle_deselect() {
        let mut state = SelectionState::default();
        let target = SelectionTarget::Vertex(default_vid());

        state.select(target.clone());
        // Selected → toggle → deselected
        state.toggle(target.clone());
        assert!(!state.contains(&target));
    }

    #[test]
    fn selection_state_all_iter() {
        let mut state = SelectionState::default();
        let vid = default_vid();

        state.select(SelectionTarget::Vertex(vid));

        let collected: Vec<_> = state.all().cloned().collect();
        assert_eq!(collected.len(), 1);
    }

    #[test]
    fn selection_state_len_after_operations() {
        let mut state = SelectionState::default();
        assert_eq!(state.len(), 0);

        state.select(SelectionTarget::Vertex(default_vid()));
        assert_eq!(state.len(), 1);

        state.select(SelectionTarget::Group(default_gid()));
        assert_eq!(state.len(), 2);

        state.clear();
        assert_eq!(state.len(), 0);
    }
}
