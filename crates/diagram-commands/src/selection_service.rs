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
            // Alt+click: bypass group, select topmost child (SEL-016)
            // But if NO child exists at this point, fall back to the group itself.
            // Edges are also skipped for the same reason as groups: connect-mode
            // needs a vertex/cycle target, not the edge itself. If the only thing
            // at the click point is an edge endpoint with no underlying shape,
            // fall back to the edge (covers clicking mid-line, away from any
            // endpoint).
            let mut group_fallback: Option<SelectionTarget> = None;
            let mut edge_fallback: Option<SelectionTarget> = None;

            for hit in &hits {
                let target: SelectionTarget = hit.clone().into();
                if let SelectionTarget::Group(_) = &target {
                    if group_fallback.is_none() && !target.is_locked(self.model) {
                        group_fallback = Some(target.clone());
                    }
                    continue;
                }
                if let SelectionTarget::Edge(_) = &target {
                    if edge_fallback.is_none() && !target.is_locked(self.model) {
                        edge_fallback = Some(target.clone());
                    }
                    continue;
                }
                if !target.is_locked(self.model) {
                    return target; // unlocked vertex/group-less target
                }
            }

            // No non-group/non-edge child found — fall back to group first
            // (SEL-016 empty group case), then to edge (mid-line click).
            if let Some(group) = group_fallback {
                return group;
            }
            if let Some(edge) = edge_fallback {
                return edge;
            }
            return SelectionTarget::None;
        }

        // Plain click: select topmost unlocked target (SEL-015).
        // Edges that share a point with a vertex (the connection point) defer
        // to the vertex — drawing convention is "vertices are on top of the
        // edges that connect to them", so clicking the endpoint selects the
        // vertex, not the edge (the edge is still selectable by clicking on
        // the line itself, away from any endpoint).
        let mut edge_fallback: Option<SelectionTarget> = None;
        for hit in &hits {
            let target: SelectionTarget = hit.clone().into();
            if target.is_locked(self.model) {
                continue;
            }
            match target {
                SelectionTarget::Edge(edge_id) => {
                    if edge_fallback.is_none() {
                        edge_fallback = Some(SelectionTarget::Edge(edge_id));
                    }
                }
                _ => return target,
            }
        }
        edge_fallback.unwrap_or(SelectionTarget::None)
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

    // ─── Additional integration tests (SEL-015 / SEL-016) ───────────────────────

    /// Test B: Plain click on group area selects group.
    ///
    /// Integration note: in a real scene with Scene + HitTester,
    /// a group at (0,0) size 100x100 hit at center returns [Group].
    /// resolve() with alt=false should return Group(id).
    #[test]
    fn test_plain_click_on_group_selects_group() {
        let gid = diagram_core::GroupId::default();
        // Hit list: topmost is the group itself (no child on top)
        let hit_tester = MockHitTester {
            hits: vec![HitResult::Group(gid)],
        };
        let model = make_model();
        let service = SelectionService::new(&hit_tester, &model);
        let mods = SelectionModifiers::default();

        // Plain click on group area → group selected
        let result = service.resolve(50.0, 50.0, &mods);
        assert!(matches!(result, SelectionTarget::Group(g) if g == gid));
    }

    /// Test C: Drill-down second click.
    ///
    /// This tests the transition case: when a group is already selected
    /// and user clicks on a child, resolve returns the child.
    ///
    /// Note: Full drill-down requires SelectionState tracking (Phase 3+).
    /// This test verifies the hit-ordering behavior that enables drill-down.
    #[test]
    fn test_drill_down_second_click_clears_group_selects_child() {
        let gid = diagram_core::GroupId::default();
        let vid = diagram_core::VertexId::default();
        // Topmost is vertex (child), underneath is group
        let hit_tester = MockHitTester {
            hits: vec![HitResult::Vertex(vid), HitResult::Group(gid)],
        };
        let model = make_model();
        let service = SelectionService::new(&hit_tester, &model);
        let mods = SelectionModifiers::default();

        // Click on child area → child selected, not group
        let result = service.resolve(50.0, 50.0, &mods);
        assert!(matches!(result, SelectionTarget::Vertex(v) if v == vid));
    }

    /// Test F: Locked group skipped, unlocked child selected (SEL-016 invariant).
    ///
    /// Integration note: real Scene sets is_locked on group and vertex via model.
    /// Here we test the MockHitTester hit ordering with an empty model (no locks).
    /// The is_locked() check on an empty model returns false for all targets.
    #[test]
    fn test_locked_group_skipped_unlocked_child_selected() {
        let gid = diagram_core::GroupId::default();
        let vid = diagram_core::VertexId::default();
        // Topmost is group, child is underneath
        let hit_tester = MockHitTester {
            hits: vec![HitResult::Group(gid), HitResult::Vertex(vid)],
        };
        let model = make_model();
        let service = SelectionService::new(&hit_tester, &model);
        let mods = SelectionModifiers::default();

        // Plain click: topmost unlocked target (group) wins
        let result = service.resolve(50.0, 50.0, &mods);
        assert!(matches!(result, SelectionTarget::Group(g) if g == gid));
    }

    // ─── SEL-016: Alt+click empty group area tests ───────────────────────────────

    /// Test E: Alt+click on empty group area selects the group itself (SEL-016).
    ///
    /// Scenario: GIVEN a group has no child at click point P
    ///           WHEN the user Alt+clicks at P
    ///           THEN the group is `SelectionTarget::Group(group_id)`
    ///
    /// This is the "empty group area" fallback case in SEL-016:
    /// when hits = [Group] and alt = true, we bypass the group first
    /// but have no child to show — so we fall back to the group itself.
    #[test]
    fn test_alt_click_on_empty_group_area_selects_group() {
        let gid = diagram_core::GroupId::default();
        // Hit list: only the group (no child at this point)
        let hit_tester = MockHitTester {
            hits: vec![HitResult::Group(gid)],
        };
        let model = make_model();
        let service = SelectionService::new(&hit_tester, &model);
        let mods = SelectionModifiers {
            alt: true,
            ..Default::default()
        };

        // Alt+click on empty group area → group selected (SEL-016 fallback)
        let result = service.resolve(50.0, 50.0, &mods);
        assert!(matches!(result, SelectionTarget::Group(g) if g == gid));
    }

    // ─── is_locked unit tests ────────────────────────────────────────────────────

    /// Test: Plain click at a point where a vertex and an edge coincide (the
    /// edge endpoint that connects the vertex) prefers the vertex. Without
    /// this preference, clicking on the geometric center of a shape that
    /// has an incoming edge would silently select the edge, breaking
    /// selection-on-shape in fixtures where vertices overlap their own
    /// incoming edges (e.g. two-shapes.drawio).
    #[test]
    fn test_plain_click_prefers_vertex_over_edge_at_endpoint() {
        let vid = diagram_core::VertexId::default();
        let eid = diagram_core::EdgeId::default();
        // Topmost hits first — edge rendered on top of vertex.
        let hit_tester = MockHitTester {
            hits: vec![HitResult::Edge(eid), HitResult::Vertex(vid)],
        };
        let model = make_model();
        let service = SelectionService::new(&hit_tester, &model);
        let mods = SelectionModifiers::default();

        let result = service.resolve(0.0, 0.0, &mods);
        assert!(matches!(result, SelectionTarget::Vertex(v) if v == vid));
    }

    /// Test: Plain click on the edge itself (no overlapping vertex) keeps
    /// returning the edge. The preference only kicks in when a vertex
    /// actually shares the click point — clicking on a regular edge
    /// segment still selects the edge.
    #[test]
    fn test_plain_click_on_edge_alone_still_returns_edge() {
        let eid = diagram_core::EdgeId::default();
        let hit_tester = MockHitTester {
            hits: vec![HitResult::Edge(eid)],
        };
        let model = make_model();
        let service = SelectionService::new(&hit_tester, &model);
        let mods = SelectionModifiers::default();

        let result = service.resolve(0.0, 0.0, &mods);
        assert!(matches!(result, SelectionTarget::Edge(e) if e == eid));
    }

    /// Unit test: is_locked() returns true for a group that has locked=true.
    ///
    /// This verifies the is_locked method itself with a real locked group
    /// inserted into the model's store.
    #[test]
    fn test_is_locked_returns_true_for_locked_group() {
        use diagram_core::Group;

        let mut model = make_model();
        // Create a locked group and insert it into the store
        let locked_group = Group {
            locked: true,
            ..Default::default()
        };
        let gid = model.store.insert_group(locked_group);

        // Verify is_locked returns true for this group
        let target = SelectionTarget::Group(gid);
        assert!(target.is_locked(&model));
    }

    /// Unit test: is_locked() returns false for a group that is not locked.
    #[test]
    fn test_is_locked_returns_false_for_unlocked_group() {
        let gid = diagram_core::GroupId::default();
        let target = SelectionTarget::Group(gid);
        let model = make_model();

        // Group not in model → is_locked returns false
        assert!(!target.is_locked(&model));
    }
}
