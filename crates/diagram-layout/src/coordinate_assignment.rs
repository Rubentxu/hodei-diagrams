//! Coordinate assignment stage for the Sugiyama layout pipeline.
//!
//! Computes final (x, y) positions for each node using median positioning
//! within layers, minPath edge straightening for dummy chains, and spacing
//! constraint resolution.

use crate::config::LayoutConfig;
use crate::error::LayoutResult;
use crate::hierarchy::{HierarchyModel, NodeIx};
use crate::LayoutStage;

/// The coordinate assignment stage.
///
/// Computes x positions via iterative median refinement with overlap
/// resolution, and y positions from layer index and inter-rank spacing.
pub struct CoordinateAssignment;

impl LayoutStage for CoordinateAssignment {
    fn execute(&self, model: &mut HierarchyModel, config: &LayoutConfig) -> LayoutResult<()> {
        if model.rank_count() == 0 {
            return Ok(());
        }

        let intra = config.intra_cell_spacing;
        let inter = config.inter_rank_spacing;

        // Step 1: Initial x placement for each layer
        compute_initial_x(model, intra);

        // Step 2: Iterative median refinement
        let max_iter = config.max_iterations;
        for _iter in 0..max_iter {
            let prev_positions = collect_positions(model);

            // Median refinement
            median_refine(model, intra);

            // Resolve overlaps (left-to-right sweep)
            resolve_overlaps(model, intra);

            // Check convergence
            if positions_converged(model, &prev_positions, 0.01) {
                break;
            }
        }

        // Step 3: minPath edge straightening for dummy chains
        straighten_dummy_chains(model);

        // Step 4: Compute final y positions
        compute_y_positions(model, inter);

        // Bounds check
        for ix in model.node_indices() {
            if let Some((x, y)) = model.node_position(ix) {
                assert!(
                    x.is_finite() && y.is_finite(),
                    "coordinates must be finite: ({x}, {y})"
                );
                assert!(
                    x.abs() <= 1e6 && y.abs() <= 1e6,
                    "coordinates must be within ±1e6: ({x}, {y})"
                );
            }
        }

        Ok(())
    }
}

/// Collect current positions into a vec for convergence checking.
fn collect_positions(model: &HierarchyModel) -> Vec<f64> {
    model
        .node_indices()
        .filter_map(|ix| model.node_position(ix))
        .flat_map(|(x, _)| vec![x])
        .collect()
}

/// Check if positions have converged (max delta < threshold).
fn positions_converged(model: &HierarchyModel, prev: &[f64], threshold: f64) -> bool {
    let current: Vec<f64> = model
        .node_indices()
        .filter_map(|ix| model.node_position(ix))
        .flat_map(|(x, _)| vec![x])
        .collect();
    if current.len() != prev.len() {
        return false;
    }
    for (&c, &p) in current.iter().zip(prev.iter()) {
        if (c - p).abs() >= threshold {
            return false;
        }
    }
    true
}

/// Compute initial x positions for all nodes.
///
/// Centers nodes within each layer with `intra_cell_spacing` gap.
fn compute_initial_x(model: &mut HierarchyModel, intra_cell_spacing: f64) {
    for r in 0..model.rank_count() {
        let nodes: Vec<NodeIx> = model.ranks[r].clone();
        let total_width: f64 = nodes
            .iter()
            .map(|&ix| node_width(model, ix))
            .sum();
        let gaps = (nodes.len().saturating_sub(1)) as f64 * intra_cell_spacing;
        let start_x = -total_width / 2.0 - gaps / 2.0;

        let mut cx = start_x;
        for &ix in &nodes {
            let w = node_width(model, ix);
            model.set_position(ix, cx + w / 2.0, 0.0);
            cx += w + intra_cell_spacing;
        }
    }
}

/// Get the width of a node (either real or dummy with default).
fn node_width(model: &HierarchyModel, ix: NodeIx) -> f64 {
    if model.is_real(ix) {
        model.real_node_size(ix).map(|(w, _)| w).unwrap_or(120.0)
    } else {
        0.0 // Dummy nodes have zero visual width
    }
}

/// Median refinement: for each node, set x to median of its neighbors' x.
fn median_refine(model: &mut HierarchyModel, _intra_cell_spacing: f64) {
    for r in 0..model.rank_count() {
        let nodes: Vec<NodeIx> = model.ranks[r].clone();
        // Collect (node, median) pairs and sort by median, then by node index for stability
        let mut medians: Vec<(NodeIx, f64)> = nodes
            .iter()
            .map(|&ix| {
                let neighbor_xs: Vec<f64> = model
                    .neighbors_all(ix)
                    .filter_map(|n| model.node_position(n))
                    .map(|(x, _)| x)
                    .collect();

                if neighbor_xs.is_empty() {
                    // No neighbors — keep current x, use existing position if available
                    let current_x = model.node_position(ix).map(|(x, _)| x).unwrap_or(0.0);
                    return (ix, current_x);
                }

                let mut sorted = neighbor_xs.clone();
                sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
                let median = sorted[sorted.len() / 2];
                (ix, median)
            })
            .collect();

        // Stable sort by median only — equal medians preserve original order (stable sort)
        medians.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

        // Apply sorted positions — first in sorted order gets the leftmost x
        let intra = _intra_cell_spacing;
        let mut cx = compute_start_x_for_rank(model, &medians, intra);
        for &(ix, _) in &medians {
            let w = node_width(model, ix);
            model.set_position(ix, cx + w / 2.0, 0.0);
            cx += w + intra;
        }
    }
}

/// Compute starting x position for median-sorted nodes so the layer is centered.
fn compute_start_x_for_rank(model: &HierarchyModel, medians: &[(NodeIx, f64)], intra: f64) -> f64 {
    if medians.is_empty() {
        return 0.0;
    }
    let total_width: f64 = medians
        .iter()
        .map(|&(ix, _)| node_width(model, ix))
        .sum();
    let gaps = (medians.len().saturating_sub(1)) as f64 * intra;
    -(total_width + gaps) / 2.0
}

/// Resolve overlaps within each layer via left-to-right sweep.
fn resolve_overlaps(model: &mut HierarchyModel, intra_cell_spacing: f64) {
    for r in 0..model.rank_count() {
        let nodes = model.ranks[r].clone();
        if nodes.len() <= 1 {
            continue;
        }

        // First pass: enforce minimum spacing
        let mut prev_right = f64::NEG_INFINITY;
        for &ix in &nodes {
            let (x, _) = model.node_position(ix).unwrap_or((0.0, 0.0));
            let w = node_width(model, ix);
            let left = x - w / 2.0;
            let right = x + w / 2.0;

            if prev_right > f64::NEG_INFINITY && left < prev_right + intra_cell_spacing {
                // Push right to satisfy spacing
                let new_left = prev_right + intra_cell_spacing;
                let new_x = new_left + w / 2.0;
                model.set_position(ix, new_x, 0.0);
                prev_right = new_x + w / 2.0;
            } else {
                prev_right = right;
            }
        }

        // Center the layer if needed (re-center to maintain balance)
        if !nodes.is_empty() {
            let first = nodes[0];
            let last = nodes[nodes.len() - 1];
            let (fx, _) = model.node_position(first).unwrap_or((0.0, 0.0));
            let (lx, _) = model.node_position(last).unwrap_or((0.0, 0.0));
            let fw = node_width(model, first);
            let lw = node_width(model, last);
            let layer_left = fx - fw / 2.0;
            let layer_right = lx + lw / 2.0;
            let layer_center = (layer_left + layer_right) / 2.0;

            // Shift all nodes so layer is centered at 0
            if layer_center.abs() > 0.01 {
                for &ix in &nodes {
                    let (x, y) = model.node_position(ix).unwrap_or((0.0, 0.0));
                    model.set_position(ix, x - layer_center, y);
                }
            }
        }
    }
}

/// Straighten dummy node chains so long edges are smooth.
fn straighten_dummy_chains(model: &mut HierarchyModel) {
    // Find chains of dummy nodes between real nodes
    let dummies: Vec<NodeIx> = model
        .node_indices()
        .filter(|&ix| model.is_dummy(ix))
        .collect();

    // Group dummies by path: trace from each dummy to its real endpoints
    let mut processed = std::collections::HashSet::new();
    for &dummy in &dummies {
        if processed.contains(&dummy) {
            continue;
        }

        // Trace forward to find all dummies in this chain
        let mut chain = Vec::new();
        let mut current = dummy;
        loop {
            processed.insert(current);
            chain.push(current);

            // Find next dummy in the chain
            let next: Vec<NodeIx> = model
                .neighbors(current)
                .filter(|&n| model.is_dummy(n) && !processed.contains(&n))
                .collect();

            if next.is_empty() {
                break;
            }
            current = next[0];
        }

        if chain.len() <= 1 {
            continue;
        }

        // Align all dummies in the chain to the same x position
        let xs: Vec<f64> = chain
            .iter()
            .filter_map(|&ix| model.node_position(ix))
            .map(|(x, _)| x)
            .collect();

        if xs.is_empty() {
            continue;
        }

        let median_x = {
            let mut sorted = xs.clone();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
            sorted[sorted.len() / 2]
        };

        // Also get the real endpoints' x for better alignment
        let endpoints_x: Vec<f64> = chain
            .iter()
            .flat_map(|&ix| {
                model
                    .neighbors_all(ix)
                    .filter(|&n| model.is_real(n))
                    .filter_map(|n| model.node_position(n))
                    .map(|(x, _)| x)
            })
            .collect();

        let align_x = if endpoints_x.is_empty() {
            median_x
        } else {
            let mut sorted = endpoints_x.clone();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
            sorted[sorted.len() / 2]
        };

        for &ix in &chain {
            if let Some((_, y)) = model.node_position(ix) {
                model.set_position(ix, align_x, y);
            }
        }
    }
}

/// Compute final y positions based on layer index and inter-rank spacing.
fn compute_y_positions(model: &mut HierarchyModel, inter_rank_spacing: f64) {
    for r in 0..model.rank_count() {
        let y = r as f64 * inter_rank_spacing;
        let nodes: Vec<NodeIx> = model.ranks[r].clone();
        for &ix in &nodes {
            let x = model.node_position(ix).map(|p| p.0).unwrap_or(0.0);
            model.set_position(ix, x, y);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::id::{EdgeId, VertexId};
    use crate::config::Direction;

    #[test]
    fn vertices_get_finite_positions() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let a = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let c = model.add_real_node(VertexId::default(), 100.0, 50.0);
        model.add_edge(a, b, EdgeId::default(), false);
        model.add_edge(b, c, EdgeId::default(), false);
        model.ranks = vec![vec![a], vec![b], vec![c]];

        let cfg = LayoutConfig::default();
        let stage = CoordinateAssignment;
        stage.execute(&mut model, &cfg).unwrap();

        for ix in model.node_indices() {
            let (x, y) = model.node_position(ix).unwrap();
            assert!(x.is_finite(), "x must be finite for node {ix:?}");
            assert!(y.is_finite(), "y must be finite for node {ix:?}");
        }
    }

    #[test]
    fn layers_stacked_vertically() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let a = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let c = model.add_real_node(VertexId::default(), 100.0, 50.0);
        model.add_edge(a, b, EdgeId::default(), false);
        model.add_edge(b, c, EdgeId::default(), false);
        model.ranks = vec![vec![a], vec![b], vec![c]];

        let cfg = LayoutConfig {
            inter_rank_spacing: 100.0,
            ..LayoutConfig::default()
        };
        let stage = CoordinateAssignment;
        stage.execute(&mut model, &cfg).unwrap();

        // Check y positions
        for r in 0..model.rank_count() {
            for &ix in &model.ranks[r] {
                let (_, y) = model.node_position(ix).unwrap();
                let expected = r as f64 * 100.0;
                assert!(
                    (y - expected).abs() < 1.0,
                    "layer {r} node should have y ≈ {expected}, got {y}"
                );
            }
        }
    }

    #[test]
    fn intra_cell_spacing_honored() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let a = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b = model.add_real_node(VertexId::default(), 100.0, 50.0);
        model.ranks = vec![vec![a, b]];

        let cfg = LayoutConfig {
            intra_cell_spacing: 30.0,
            ..LayoutConfig::default()
        };
        let stage = CoordinateAssignment;
        stage.execute(&mut model, &cfg).unwrap();

        // Two vertices in same layer: gap should be ≥ 30
        let (ax, _) = model.node_position(a).unwrap();
        let (bx, _) = model.node_position(b).unwrap();
        let gap = (bx - ax).abs() - 50.0; // subtract half widths (100/2 each)
        assert!(
            gap >= 30.0 - 1.0,
            "gap should be >= intra_cell_spacing (30), got {gap}"
        );
    }

    #[test]
    fn width_height_preserved() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let v = model.add_real_node(VertexId::default(), 120.0, 60.0);
        model.ranks = vec![vec![v]];

        let cfg = LayoutConfig::default();
        let stage = CoordinateAssignment;
        stage.execute(&mut model, &cfg).unwrap();

        // Real node size should be preserved
        assert_eq!(model.real_node_size(v), Some((120.0, 60.0)));
    }

    #[test]
    fn bounded_positions() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        // Create a model with many layers
        let mut prev = None;
        for _i in 0..50 {
            let v = model.add_real_node(VertexId::default(), 100.0, 50.0);
            if let Some(p) = prev {
                model.add_edge(p, v, EdgeId::default(), false);
            }
            prev = Some(v);
        }

        // Manual ranks
        let indices: Vec<_> = model.node_indices().collect();
        model.ranks = indices.iter().map(|&ix| vec![ix]).collect();

        let cfg = LayoutConfig {
            inter_rank_spacing: 100.0,
            ..LayoutConfig::default()
        };
        let stage = CoordinateAssignment;
        stage.execute(&mut model, &cfg).unwrap();

        for ix in model.node_indices() {
            let (x, y) = model.node_position(ix).unwrap();
            assert!(
                x.abs() <= 1e6,
                "x ({x}) must be within ±1e6"
            );
            assert!(
                y.abs() <= 1e6,
                "y ({y}) must be within ±1e6"
            );
        }
    }

    #[test]
    fn single_vertex_single_layer() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let v = model.add_real_node(VertexId::default(), 100.0, 50.0);
        model.ranks = vec![vec![v]];

        let cfg = LayoutConfig::default();
        let stage = CoordinateAssignment;
        stage.execute(&mut model, &cfg).unwrap();

        let (x, y) = model.node_position(v).unwrap();
        assert!(x.is_finite());
        assert!((y - 0.0).abs() < 0.01, "y should be ~0, got {y}");
    }
}
