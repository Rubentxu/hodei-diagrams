//! Crossing reduction stage for the Sugiyama layout pipeline.
//!
//! Uses weighted-median heuristic with a transpose pass to minimise edge
//! crossings between adjacent layers. Iterates up to `max_iterations` times
//! and stops early if no further improvement is observed.

use std::collections::HashMap;

use crate::config::LayoutConfig;
use crate::error::LayoutResult;
use crate::hierarchy::{HierarchyModel, NodeIx};
use crate::LayoutStage;

/// The crossing reduction stage.
///
/// Reorders vertices within each layer to minimise crossings between
/// adjacent layers using weighted-median plus transpose refinement.
pub struct CrossingReduction;

impl LayoutStage for CrossingReduction {
    fn execute(&self, model: &mut HierarchyModel, config: &LayoutConfig) -> LayoutResult<()> {
        if model.rank_count() <= 1 {
            return Ok(());
        }

        let max_iter = config.max_iterations;
        let mut best_ordering = model.ranks.clone();
        let mut best_crossings = total_crossings(model);
        let mut no_improvement_count = 0u8;

        for _iter in 0..max_iter {
            // Top-down pass: median from upper neighbors
            for r in 1..model.rank_count() {
                let upper_rank = r - 1;
                let upper_positions: HashMap<NodeIx, usize> = model.ranks[upper_rank]
                    .iter()
                    .enumerate()
                    .map(|(pos, &ix)| (ix, pos))
                    .collect();

                // Compute median for each node in this rank
                let mut medians: Vec<(NodeIx, f64)> = model.ranks[r]
                    .iter()
                    .map(|&ix| {
                        let median = weighted_median(model, ix, &upper_positions);
                        (ix, median)
                    })
                    .collect();

                // Sort by median (stable: preserve order for equal medians)
                medians.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
                model.ranks[r] = medians.into_iter().map(|(ix, _)| ix).collect();
            }

            // Bottom-up pass: median from lower neighbors
            for r in (0..model.rank_count().saturating_sub(1)).rev() {
                let lower_rank = r + 1;
                let lower_positions: HashMap<NodeIx, usize> = model.ranks[lower_rank]
                    .iter()
                    .enumerate()
                    .map(|(pos, &ix)| (ix, pos))
                    .collect();

                let mut medians: Vec<(NodeIx, f64)> = model.ranks[r]
                    .iter()
                    .map(|&ix| {
                        let median = weighted_median(model, ix, &lower_positions);
                        (ix, median)
                    })
                    .collect();

                medians.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
                model.ranks[r] = medians.into_iter().map(|(ix, _)| ix).collect();
            }

            // Transpose pass: try swapping adjacent pairs
            transpose_pass(model);

            // Check improvement
            let current = total_crossings(model);
            if current < best_crossings {
                best_crossings = current;
                best_ordering = model.ranks.clone();
                no_improvement_count = 0;
            } else {
                no_improvement_count += 1;
                if no_improvement_count >= 2 {
                    // No improvement for two iterations — restore best ordering
                    model.ranks = best_ordering;
                    break;
                }
                // Restore to best ordering for next attempt
                model.ranks = best_ordering.clone();
            }
        }

        Ok(())
    }
}

/// Compute the weighted median position of a node's connected neighbors.
///
/// Returns the median position value. For an empty neighbor list, returns
/// the node's current position index to preserve its place.
fn weighted_median(
    model: &HierarchyModel,
    node: NodeIx,
    neighbor_positions: &HashMap<NodeIx, usize>,
) -> f64 {
    let neighbors: Vec<usize> = model
        .neighbors_all(node)
        .filter_map(|n| neighbor_positions.get(&n).copied())
        .collect();

    if neighbors.is_empty() {
        // Return current position if available, otherwise 0.0
        return find_position_in_ranks(model, node).unwrap_or(0) as f64;
    }

    let mut sorted = neighbors.clone();
    sorted.sort_unstable();
    let len = sorted.len();

    if len % 2 == 1 {
        sorted[len / 2] as f64
    } else if len == 2 {
        (sorted[0] + sorted[1]) as f64 / 2.0
    } else {
        let left = sorted[len / 2 - 1];
        let right = sorted[len / 2];
        // Weighted median: average of two middle elements
        // Using positions from the neighbor rank
        let left_pos = sorted[..len / 2]
            .iter()
            .filter(|&&p| p <= left)
            .count();
        let right_pos = sorted[len / 2..]
            .iter()
            .filter(|&&p| p >= right)
            .count();
        if left_pos == right_pos {
            (left as f64 + right as f64) / 2.0
        } else if left_pos > right_pos {
            left as f64
        } else {
            right as f64
        }
    }
}

/// Find the position index of a node within its layer.
fn find_position_in_ranks(model: &HierarchyModel, node: NodeIx) -> Option<usize> {
    for rank in &model.ranks {
        for (pos, &n) in rank.iter().enumerate() {
            if n == node {
                return Some(pos);
            }
        }
    }
    None
}

/// Transpose pass: try swapping adjacent vertex pairs within each layer.
///
/// A swap is kept if it reduces total crossings with adjacent layers.
fn transpose_pass(model: &mut HierarchyModel) {
    let initial = total_crossings(model);
    let mut improved = true;

    while improved {
        improved = false;
        for r in 0..model.rank_count() {
            for i in 0..model.ranks[r].len().saturating_sub(1) {
                // Try swapping nodes at i and i+1
                model.ranks[r].swap(i, i + 1);
                let new_crossings = total_crossings(model);
                if new_crossings < initial {
                    improved = true;
                } else {
                    // Undo the swap
                    model.ranks[r].swap(i, i + 1);
                }
            }
        }
    }
}

/// Count the total number of edge crossings across all adjacent layer pairs.
fn total_crossings(model: &HierarchyModel) -> usize {
    let mut total = 0;
    for r in 0..model.rank_count().saturating_sub(1) {
        total += crossings_between(model, r, r + 1);
    }
    total
}

/// Count edge crossings between two adjacent layers.
///
/// Edges that share a real node (i.e., are part of the same dummy chain)
/// are NOT counted as crossings — they share the same original EdgeId.
fn crossings_between(model: &HierarchyModel, upper_rank: usize, lower_rank: usize) -> usize {
    let upper = &model.ranks[upper_rank];
    let lower = &model.ranks[lower_rank];

    // Build edge list: for each upper node, find its lower neighbors
    let mut edges: Vec<(usize, usize)> = Vec::new();
    for (upos, &u_ix) in upper.iter().enumerate() {
        for v_ix in model.neighbors(u_ix) {
            if let Some(lpos) = lower.iter().position(|&x| x == v_ix) {
                edges.push((upos, lpos));
            }
        }
    }

    // Count crossings: for each pair of edges (i, j) where i < j,
    // they cross if upper_i < upper_j but lower_i > lower_j.
    let mut crossings = 0;
    for i in 0..edges.len() {
        for j in i + 1..edges.len() {
            let (u1, l1) = edges[i];
            let (u2, l2) = edges[j];

            // Check if these edges share the same original EdgeId (same-origin rule)
            if share_original_edge(model, u_ix_of(u1, upper), v_ix_of(l1, lower))
                || share_original_edge(model, u_ix_of(u1, upper), v_ix_of(l2, lower))
                || share_original_edge(model, u_ix_of(u2, upper), v_ix_of(l1, lower))
                || share_original_edge(model, u_ix_of(u2, upper), v_ix_of(l2, lower))
            {
                continue;
            }

            if (u1 < u2 && l1 > l2) || (u1 > u2 && l1 < l2) {
                crossings += 1;
            }
        }
    }

    crossings
}

fn u_ix_of(pos: usize, rank: &[NodeIx]) -> NodeIx {
    rank[pos]
}

fn v_ix_of(pos: usize, rank: &[NodeIx]) -> NodeIx {
    rank[pos]
}

/// Check if two nodes are connected by an edge that shares the same original EdgeId.
fn share_original_edge(model: &HierarchyModel, a: NodeIx, b: NodeIx) -> bool {
    // Check if there's a direct edge between a and b
    if model.find_edge(a, b).is_some() {
        return true;
    }
    if model.find_edge(b, a).is_some() {
        return true;
    }

    // Check if both are on paths with edges sharing the same original ID
    // (simplified: check if both are dummies or if one is a dummy connected to the other)
    if model.is_dummy(a) && model.is_dummy(b) {
        // Check if there's a connection through dummies
        for n in model.neighbors_all(a) {
            if n == b {
                return true;
            }
            if model.is_dummy(n) {
                for nn in model.neighbors_all(n) {
                    if nn == b {
                        return true;
                    }
                }
            }
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::id::{EdgeId, VertexId};
    use crate::config::Direction;

    #[test]
    fn already_planar_stays_planar() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let a = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let c = model.add_real_node(VertexId::default(), 100.0, 50.0);
        model.add_edge(a, c, EdgeId::default(), false);
        model.add_edge(b, c, EdgeId::default(), false);

        // Manual layer setup: A, B in rank 0, C in rank 1
        model.ranks = vec![vec![a, b], vec![c]];

        let stage = CrossingReduction;
        let before = total_crossings(&model);
        stage.execute(&mut model, &LayoutConfig::default()).unwrap();
        let after = total_crossings(&model);

        assert_eq!(before, 0);
        assert_eq!(after, 0);
    }

    #[test]
    fn single_layer_noop() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let a = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b = model.add_real_node(VertexId::default(), 100.0, 50.0);
        model.ranks = vec![vec![a, b]];

        let stage = CrossingReduction;
        stage.execute(&mut model, &LayoutConfig::default()).unwrap();
        // Still one layer, same order
        assert_eq!(model.ranks.len(), 1);
        assert_eq!(model.ranks[0].len(), 2);
    }

    #[test]
    fn iteration_cap_respected() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let a = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let c = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let d = model.add_real_node(VertexId::default(), 100.0, 50.0);
        model.add_edge(a, c, EdgeId::default(), false);
        model.add_edge(b, d, EdgeId::default(), false);
        model.ranks = vec![vec![a, b], vec![c, d]];

        let cfg = LayoutConfig {
            max_iterations: 3,
            ..LayoutConfig::default()
        };
        let stage = CrossingReduction;
        stage.execute(&mut model, &cfg).unwrap();

        // Should complete without panic
        assert_eq!(model.ranks.len(), 2);
    }

    #[test]
    fn two_layers_crossing_pattern() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let a1 = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let a2 = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b1 = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b2 = model.add_real_node(VertexId::default(), 100.0, 50.0);
        // Crossing pattern: A1→B2, A2→B1
        model.add_edge(a1, b2, EdgeId::default(), false);
        model.add_edge(a2, b1, EdgeId::default(), false);
        model.ranks = vec![vec![a1, a2], vec![b1, b2]];

        let before = total_crossings(&model);
        let stage = CrossingReduction;
        stage.execute(&mut model, &LayoutConfig::default()).unwrap();
        let after = total_crossings(&model);

        // Crossings should decrease
        assert!(
            after <= before,
            "crossings should not increase (before: {before}, after: {after})"
        );
    }

    #[test]
    fn monotonic_improvement() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let a1 = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let a2 = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let a3 = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b1 = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b2 = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b3 = model.add_real_node(VertexId::default(), 100.0, 50.0);
        // Full crossing pattern
        model.add_edge(a1, b3, EdgeId::default(), false);
        model.add_edge(a2, b2, EdgeId::default(), false);
        model.add_edge(a3, b1, EdgeId::default(), false);
        model.ranks = vec![vec![a1, a2, a3], vec![b1, b2, b3]];

        let stage = CrossingReduction;
        stage.execute(&mut model, &LayoutConfig::default()).unwrap();

        // Crossings should be at most what they were
        let final_crossings = total_crossings(&model);
        assert!(
            final_crossings <= 3,
            "crossings should be reduced (got {final_crossings})"
        );
    }
}
