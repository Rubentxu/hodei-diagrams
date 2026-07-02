//! Selection resolution service.
//!
//! Uses a `dyn HitTester` to resolve geometric hits into selection targets,
//! applying the engine's selection semantics (SEL-015, SEL-016).

use diagram_core::DiagramModel;
use diagram_core::selection::{HitTester, SelectionModifiers, SelectionTarget};

/// Resolves a point + modifiers into the intended `SelectionTarget`.
///
/// This is the ENGINE'S selection semantics resolver. It interprets click + modifiers
/// to determine what should be selected.
pub struct SelectionService<'a> {
    hit_tester: &'a dyn HitTester,
    model: &'a DiagramModel,
}

impl<'a> SelectionService<'a> {
    /// Create a new selection service.
    pub fn new(hit_tester: &'a dyn HitTester, model: &'a DiagramModel) -> Self {
        Self { hit_tester, model }
    }

    /// Resolve the intended selection target from a point and modifiers.
    ///
    /// # Selection semantics
    /// - Plain click: select top-most unlocked target (SEL-015)
    /// - Alt+click: bypass group hits, select top-most unlocked non-group (SEL-016)
    /// - Locked targets are always skipped
    pub fn resolve(&self, x: f64, y: f64, modifiers: &SelectionModifiers) -> SelectionTarget {
        let hits = self.hit_tester.hit_test(x, y);

        if hits.is_empty() {
            return SelectionTarget::None;
        }

        if modifiers.alt {
            // Alt+click: skip group hits entirely, select topmost unlocked non-group (SEL-016)
            for hit in &hits {
                let target: SelectionTarget = hit.clone().into();
                // Bypass groups with alt — only consider vertex/edge hits
                if matches!(target, SelectionTarget::Group(_)) {
                    continue;
                }
                if !target.is_locked(self.model) {
                    return target;
                }
            }
            return SelectionTarget::None;
        }

        // Plain click: select topmost unlocked target (SEL-015)
        for hit in &hits {
            let target: SelectionTarget = hit.clone().into();
            if !target.is_locked(self.model) {
                return target;
            }
        }
        SelectionTarget::None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::selection::HitResult;

    struct MockHitTester {
        hits: Vec<HitResult>,
    }

    impl HitTester for MockHitTester {
        fn hit_test(&self, _: f64, _: f64) -> Vec<HitResult> {
            self.hits.clone()
        }
    }

    fn make_model() -> DiagramModel {
        DiagramModel::new()
    }

    #[test]
    fn resolve_returns_none_when_no_hits() {
        let hit_tester = MockHitTester { hits: vec![] };
        let model = make_model();
        let service = SelectionService::new(&hit_tester, &model);
        let mods = SelectionModifiers::default();

        let result = service.resolve(0.0, 0.0, &mods);
        assert_eq!(result, SelectionTarget::None);
    }

    #[test]
    fn resolve_returns_topmost_unlockable_target() {
        // Simulate a hit on a group containing a vertex
        let vid = diagram_core::VertexId::default();
        let gid = diagram_core::GroupId::default();
        let hit_tester = MockHitTester {
            hits: vec![HitResult::Group(gid), HitResult::Vertex(vid)],
        };
        let model = make_model();
        let service = SelectionService::new(&hit_tester, &model);
        let mods = SelectionModifiers::default();

        // Topmost is group — should select it (group is unlocked in empty model)
        let result = service.resolve(0.0, 0.0, &mods);
        assert!(matches!(result, SelectionTarget::Group(_)));
    }

    #[test]
    fn resolve_alt_click_bypasses_group() {
        let vid = diagram_core::VertexId::default();
        let gid = diagram_core::GroupId::default();
        let hit_tester = MockHitTester {
            hits: vec![HitResult::Group(gid), HitResult::Vertex(vid)],
        };
        let model = make_model();
        let service = SelectionService::new(&hit_tester, &model);
        let mods = SelectionModifiers {
            alt: true,
            ..Default::default()
        };

        // Alt+click: should skip group, select vertex
        let result = service.resolve(0.0, 0.0, &mods);
        assert!(matches!(result, SelectionTarget::Vertex(_)));
    }
}
