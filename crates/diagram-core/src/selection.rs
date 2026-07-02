//! Engine-owned selection state.
//!
//! Selection is a pure engine-side concern: the engine tracks which targets
//! (vertices, groups, edges) are currently selected. The WASM boundary
//! exposes this state and allows mutation via commands.

use crate::{DiagramModel, EdgeId, GroupId, VertexId};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// A geometric hit-test result returned by the hit tester.
#[derive(Debug, Clone, PartialEq)]
pub enum HitResult {
    /// A vertex was hit.
    Vertex(VertexId),
    /// A group was hit.
    Group(GroupId),
    /// An edge was hit.
    Edge(EdgeId),
}

/// Trait for hit-testing geometric shapes at a point.
/// Implemented by infrastructure layers (scene) that have access to geometry.
pub trait HitTester: Send + Sync {
    /// Returns all entities at the given point, ordered from top-most to bottom-most.
    fn hit_test(&self, x: f64, y: f64) -> Vec<HitResult>;
}

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
    /// No target (sentinel for "no hit" or "clear selection").
    None,
}

impl From<HitResult> for SelectionTarget {
    fn from(h: HitResult) -> Self {
        match h {
            HitResult::Vertex(id) => SelectionTarget::Vertex(id),
            HitResult::Group(id) => SelectionTarget::Group(id),
            HitResult::Edge(id) => SelectionTarget::Edge(id),
        }
    }
}

impl SelectionTarget {
    /// Returns `true` if this target is locked.
    ///
    /// Locked targets cannot be selected or manipulated by the user.
    pub fn is_locked(&self, model: &DiagramModel) -> bool {
        match self {
            SelectionTarget::Vertex(id) => {
                model.store.vertex(*id).map(|v| v.locked).unwrap_or(false)
            }
            SelectionTarget::Group(id) => model.store.group(*id).map(|g| g.locked).unwrap_or(false),
            SelectionTarget::Edge(id) => model.store.edge(*id).map(|e| e.locked).unwrap_or(false),
            SelectionTarget::None => false,
        }
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

/// A stack of selection targets ordered from top-most (visible) to bottom-most.
/// Produced by hit-testing at a given point.
#[derive(Default, Debug, Clone, PartialEq, Eq)]
pub struct HitStack(Vec<SelectionTarget>);

impl HitStack {
    /// Create a new `HitStack` from a vector of targets (topmost = index 0).
    pub fn new(targets: Vec<SelectionTarget>) -> Self {
        Self(targets)
    }

    /// Returns the topmost (first) target, if any.
    pub fn topmost(&self) -> Option<&SelectionTarget> {
        self.0.first()
    }

    /// Returns the target directly under the given target in the stack.
    pub fn under(&self, target: &SelectionTarget) -> Option<&SelectionTarget> {
        let idx = self.0.iter().position(|t| t == target)?;
        self.0.get(idx + 1)
    }

    /// Returns all children of the given group target.
    /// Note: Scene graph traversal is needed to implement this fully.
    pub fn children_of(&self, group: &SelectionTarget) -> Vec<&SelectionTarget> {
        // TODO: Scene graph traversal needed — requires access to Scene/VisualElement
        // from diagram-scene crate. Currently returns empty Vec as placeholder.
        let _ = group;
        Vec::new()
    }
}

/// Input modifiers from the Web Shell.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SelectionModifiers {
    /// Alt key pressed.
    pub alt: bool,
    /// Shift key pressed.
    pub shift: bool,
    /// Ctrl key pressed.
    pub ctrl: bool,
    /// Meta (Command on Mac) key pressed.
    pub meta: bool,
}

/// Check if a target is locked according to the model.
///
/// Locked targets should be skipped during selection resolution.
pub fn is_target_locked(target: &SelectionTarget, model: &DiagramModel) -> bool {
    target.is_locked(model)
}

/// Compute the hit stack at a given point by querying the scene.
///
/// This function lives in `diagram-core` but requires `diagram-scene`'s `Scene`
/// and `VisualElement` types. A direct import would create a circular dependency
/// (diagram-scene depends on diagram-core). Therefore this is a stub that will
/// be implemented in a crate that can depend on both, or via a trait abstraction
/// in a future slice.
///
/// SeeSlice 3 for proper scene integration.
pub fn compute_hit_stack(_point: (f64, f64), _scene: &impl SceneAccess) -> HitStack {
    // TODO: Implement scene traversal using VisualElement::contains_point
    // Requires Scene type from diagram-scene crate.
    HitStack::default()
}

/// Trait to abstract scene access for hit-testing.
///
/// Used to avoid a direct dependency on diagram-scene while allowing
/// hit-testing to be implemented once the scene types are available.
pub trait SceneAccess {
    /// Returns all targets at the given point, ordered topmost-first.
    fn targets_at_point(&self, point: (f64, f64)) -> Vec<SelectionTarget>;
}

/// Resolve the intended selection target from a point, scene, current selection, and modifiers.
///
/// This is the ENGINE'S selection semantics resolver. It interprets click + modifiers
/// to determine what should be selected.
///
/// # Arguments
/// * `point` - The (x, y) coordinate of the click
/// * `scene` - Access to the scene for hit-testing
/// * `current_selection` - The current selection state
/// * `modifiers` - Keyboard modifiers from the Web Shell
///
/// # Returns
/// The `SelectionTarget` to select, or `SelectionTarget::None` if no hit.
pub fn resolve_selection_intent(
    _point: (f64, f64),
    _scene: &impl SceneAccess,
    _current_selection: &SelectionState,
    _modifiers: &SelectionModifiers,
) -> SelectionTarget {
    // TODO: Implement full selection semantics:
    // - Plain click: if topmost is a group, select it
    // - Second click on selected group: drill down to child
    // - Alt+click: bypass group, select topmost child
    // - Skip locked targets
    // Requires scene traversal from diagram-scene
    SelectionTarget::None
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
        // Vertex not in model store → locked check returns false
        let model = DiagramModel::new();
        assert!(!target.is_locked(&model));
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

    // ─── HitStack tests ─────────────────────────────────────────────────────────

    #[test]
    fn hit_stack_topmost_returns_first() {
        let vid = default_vid();
        let gid = default_gid();
        let targets = vec![SelectionTarget::Vertex(vid), SelectionTarget::Group(gid)];
        let stack = HitStack::new(targets);

        assert_eq!(stack.topmost(), Some(&SelectionTarget::Vertex(vid)));
    }

    #[test]
    fn hit_stack_under_returns_next() {
        let vid = default_vid();
        let gid = default_gid();
        let targets = vec![SelectionTarget::Vertex(vid), SelectionTarget::Group(gid)];
        let stack = HitStack::new(targets);

        assert_eq!(
            stack.under(&SelectionTarget::Vertex(vid)),
            Some(&SelectionTarget::Group(gid))
        );
    }

    #[test]
    fn hit_stack_under_none_if_last() {
        let gid = default_gid();
        let targets = vec![SelectionTarget::Group(gid)];
        let stack = HitStack::new(targets);

        assert!(stack.under(&SelectionTarget::Group(gid)).is_none());
    }

    #[test]
    fn hit_stack_children_of_group_stub() {
        // children_of currently returns empty Vec (stub implementation)
        let gid = default_gid();
        let targets = vec![SelectionTarget::Group(gid)];
        let stack = HitStack::new(targets);

        let children = stack.children_of(&SelectionTarget::Group(gid));
        assert!(children.is_empty());
    }

    #[test]
    fn hit_stack_empty_returns_none() {
        let stack = HitStack::new(Vec::new());
        assert!(stack.topmost().is_none());
    }

    // ─── SelectionModifiers tests ───────────────────────────────────────────────

    #[test]
    fn selection_modifiers_default_is_false() {
        let mods = SelectionModifiers::default();
        assert!(!mods.alt);
        assert!(!mods.shift);
        assert!(!mods.ctrl);
        assert!(!mods.meta);
    }

    #[test]
    fn selection_modifiers_with_alt() {
        let mods = SelectionModifiers {
            alt: true,
            ..Default::default()
        };
        assert!(mods.alt);
        assert!(!mods.shift);
    }

    // ─── is_target_locked tests ────────────────────────────────────────────────

    #[test]
    fn is_target_locked_vertex_not_in_store() {
        let model = DiagramModel::new();
        let target = SelectionTarget::Vertex(default_vid());
        // Vertex not in model → false
        assert!(!is_target_locked(&target, &model));
    }

    #[test]
    fn is_target_locked_none_returns_false() {
        let model = DiagramModel::new();
        let target = SelectionTarget::None;
        assert!(!is_target_locked(&target, &model));
    }

    // ─── resolve_selection_intent stub tests ──────────────────────────────────

    #[test]
    fn resolve_selection_intent_stub_returns_none() {
        struct EmptyScene;
        impl SceneAccess for EmptyScene {
            fn targets_at_point(&self, _: (f64, f64)) -> Vec<SelectionTarget> {
                Vec::new()
            }
        }

        let scene = EmptyScene;
        let selection = SelectionState::default();
        let modifiers = SelectionModifiers::default();

        let result = resolve_selection_intent((0.0, 0.0), &scene, &selection, &modifiers);
        assert_eq!(result, SelectionTarget::None);
    }
}
