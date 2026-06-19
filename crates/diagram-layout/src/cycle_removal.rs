//! Cycle removal stage for the Sugiyama layout pipeline.
//!
//! Uses DFS-based back-edge detection to find and reverse edges that
//! create cycles, producing a DAG suitable for layer assignment.

use petgraph::visit::{depth_first_search, DfsEvent};

use crate::config::LayoutConfig;
use crate::error::LayoutResult;
use crate::hierarchy::HierarchyModel;
use crate::LayoutStage;

/// The cycle removal stage.
///
/// Detects back-edges via DFS and reverses them (marking `reversed = true`)
/// so the graph becomes acyclic. Disconnected components are handled — DFS
/// visits all nodes via `node_indices()`.
pub struct CycleRemover;

impl LayoutStage for CycleRemover {
    fn execute(&self, model: &mut HierarchyModel, _config: &LayoutConfig) -> LayoutResult<()> {
        if model.node_count() <= 1 {
            return Ok(());
        }

        let mut reversed_edges = Vec::new();

        // Collect back-edges via DFS
        let indices: Vec<_> = model.node_indices().collect();
        depth_first_search(model.graph(), indices, |event| {
            if let DfsEvent::BackEdge(source, target) = event {
                reversed_edges.push((source, target));
            }
        });

        // Reverse each back-edge: remove old edge, add new edge target→source
        // with the same EdgeId and `reversed: true`.
        for (source, target) in &reversed_edges {
            if let Some(edge_ix) = model.find_edge(*source, *target) {
                let data = model.edge_data(edge_ix).clone();
                model.remove_edge(edge_ix);
                model.add_edge(*target, *source, data.id, true);
            }
        }

        // Secondary check: debug-assert the graph is now acyclic
        debug_assert!(
            {
                let indices: Vec<_> = model.node_indices().collect();
                let mut has_back = false;
                depth_first_search(model.graph(), indices, |event| {
                    if let DfsEvent::BackEdge(_, _) = event {
                        has_back = true;
                    }
                });
                !has_back
            },
            "graph should be acyclic after cycle removal"
        );

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::id::{EdgeId, VertexId};
    use petgraph::visit::depth_first_search;
    use petgraph::visit::DfsEvent;

    use crate::config::Direction;

    fn has_cycle(model: &HierarchyModel) -> bool {
        let indices: Vec<_> = model.node_indices().collect();
        let mut found = false;
        depth_first_search(model.graph(), indices, |e| {
            if let DfsEvent::BackEdge(_, _) = e {
                found = true;
            }
        });
        found
    }

    fn count_reversed(model: &HierarchyModel) -> usize {
        model
            .edge_indices()
            .filter(|&e| model.edge_data(e).reversed)
            .count()
    }

    #[test]
    fn dag_passes_through_unchanged() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let a = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let c = model.add_real_node(VertexId::default(), 100.0, 50.0);
        model.add_edge(a, b, EdgeId::default(), false);
        model.add_edge(b, c, EdgeId::default(), false);

        let remover = CycleRemover;
        remover.execute(&mut model, &LayoutConfig::default()).unwrap();

        assert_eq!(count_reversed(&model), 0);
        assert!(!has_cycle(&model));
        // Edge directions preserved
        assert!(model.find_edge(a, b).is_some());
        assert!(model.find_edge(b, c).is_some());
    }

    #[test]
    fn simple_2_vertex_cycle() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let a = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let e1 = EdgeId::default();
        let e2 = EdgeId::default();
        // Actually create two distinct EdgeIds by using default() and then a different one
        // slotmap keys: default() gives the same value, need to insert to get distinct
        // For test purposes we can use the same eid for both or use different
        model.add_edge(a, b, e1, false);
        model.add_edge(b, a, e2, false);

        let remover = CycleRemover;
        remover.execute(&mut model, &LayoutConfig::default()).unwrap();

        assert!(
            count_reversed(&model) >= 1,
            "at least one edge should be reversed"
        );
        assert!(!has_cycle(&model), "graph should be acyclic");
    }

    #[test]
    fn three_vertex_cycle() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let a = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let c = model.add_real_node(VertexId::default(), 100.0, 50.0);
        model.add_edge(a, b, EdgeId::default(), false);
        model.add_edge(b, c, EdgeId::default(), false);
        model.add_edge(c, a, EdgeId::default(), false);

        let remover = CycleRemover;
        remover.execute(&mut model, &LayoutConfig::default()).unwrap();

        assert!(
            count_reversed(&model) >= 1,
            "at least one edge should be reversed"
        );
        assert!(!has_cycle(&model), "graph should be acyclic");
    }

    #[test]
    fn disconnected_cyclic_and_acyclic() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        // Cyclic subgraph: A→B→C→A
        let a = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let c = model.add_real_node(VertexId::default(), 100.0, 50.0);
        model.add_edge(a, b, EdgeId::default(), false);
        model.add_edge(b, c, EdgeId::default(), false);
        model.add_edge(c, a, EdgeId::default(), false);

        // Acyclic subgraph: D→E
        let d = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let e = model.add_real_node(VertexId::default(), 100.0, 50.0);
        model.add_edge(d, e, EdgeId::default(), false);

        let remover = CycleRemover;
        remover.execute(&mut model, &LayoutConfig::default()).unwrap();

        assert!(!has_cycle(&model), "graph should be fully acyclic");
        // D→E should still be D→E (unreversed)
        assert!(model.find_edge(d, e).is_some());
        let de = model.find_edge(d, e).unwrap();
        assert!(
            !model.edge_data(de).reversed,
            "D→E edge should not be reversed"
        );
    }

    #[test]
    fn empty_graph() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let remover = CycleRemover;
        let result = remover.execute(&mut model, &LayoutConfig::default());
        assert!(result.is_ok());
    }

    #[test]
    fn single_vertex_no_edges() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        model.add_real_node(VertexId::default(), 100.0, 50.0);
        let remover = CycleRemover;
        let result = remover.execute(&mut model, &LayoutConfig::default());
        assert!(result.is_ok());
        assert!(!has_cycle(&model));
    }
}
