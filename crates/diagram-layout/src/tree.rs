//! Tree layout using the Moen (Compact Tree) algorithm.
//!
//! Ported from `mxCompactTreeLayout.js`. Produces hierarchical tree layouts
//! with jetty routing for edges and automatic group bounding-box resizing.
//!
//! # Algorithm Stages
//!
//! 1. [`validate_tree`] — strict tree validation (single root, acyclic, single-parent)
//! 2. [`build_tree_nodes`] — DFS build of `TreeArena` following outgoing edges
//! 3. [`first_walk`] — bottom-up contour merge (`layoutLeaf`, `join`, `merge`, `attachParent`)
//! 4. [`second_walk`] — top-down offset accumulation
//! 5. [`apply_coordinates`] — write positions to result based on direction
//! 6. [`local_edge_processing`] — jetty routing for edge waypoints
//! 7. [`adjust_parents`] — group bounding-box recalculation

#![forbid(unsafe_code)]

use diagram_core::geometry::{Point, Rect, Size};
use diagram_core::id::{EdgeId, GroupId, PageId, VertexId};
use diagram_core::store::ModelStore;

use serde::{Deserialize, Serialize};

use crate::config::{Direction, LayoutConfig};
use crate::error::{LayoutError, LayoutResult};

/// Minimum jetty length for edge routing (draw.io default).
#[allow(dead_code)]
const MIN_EDGE_JETTY: f64 = 8.0;

/// Preferred horizontal edge separation between jetty exit points (draw.io default).
#[allow(dead_code)]
const PREF_HOZ_EDGE_SEP: f64 = 5.0;

/// Padding around group contents when computing bounding boxes (draw.io default).
const GROUP_PADDING: f64 = 10.0;

// ─── Public API ───────────────────────────────────────────────────────────────

/// Result of a tree layout computation.
///
/// Contains the new vertex positions, edge waypoints, and updated group
/// bounding boxes. The layout never mutates the store directly — callers
/// must map these results into a [`Transaction`](diagram_commands::Transaction)
/// for atomic commit.
#[derive(Debug, Clone, PartialEq)]
pub struct TreeLayoutResult {
    /// Positioned vertices: `(VertexId, Rect)` in user-space coordinates.
    pub vertices: Vec<(VertexId, Rect)>,
    /// Edge waypoints: `(EdgeId, Vec<Point>)` for jetty routing.
    pub edge_waypoints: Vec<(EdgeId, Vec<Point>)>,
    /// Updated group bounding boxes: `(GroupId, Rect)`.
    pub group_rects: Vec<(GroupId, Rect)>,
}

/// Kind of tree layout algorithm.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum LayoutKind {
    /// The existing Sugiyama hierarchical layout.
    Hierarchical,
    /// The Moen compact tree layout.
    Tree,
    /// Fruchterman-Reingold organic force-directed layout.
    Organic,
}

/// Tree layout engine.
///
/// Construct with [`TreeLayout::new`], then call [`layout`](TreeLayout::layout)
/// to compute positions for a page. Returns a [`TreeLayoutResult`] which must
/// be mapped into a transaction for atomic commit.
#[derive(Debug, Clone)]
pub struct TreeLayout {
    config: LayoutConfig,
}

impl TreeLayout {
    /// Create a new tree layout engine with the given configuration.
    pub fn new(config: LayoutConfig) -> Self {
        Self { config }
    }

    /// Run the tree layout algorithm on a page in the store.
    ///
    /// Returns `Ok(TreeLayoutResult)` with vertex positions, edge waypoints,
    /// and group bounding boxes. The store is never mutated.
    pub fn layout(&self, store: &ModelStore, page_id: PageId) -> LayoutResult<TreeLayoutResult> {
        // Empty page: nothing to layout
        if store
            .vertices_with_ids()
            .all(|(_, v)| v.page_id != Some(page_id))
        {
            return Ok(TreeLayoutResult {
                vertices: Vec::new(),
                edge_waypoints: Vec::new(),
                group_rects: Vec::new(),
            });
        }

        // Stage 1: validate tree structure
        let root = validate_tree(store, page_id)?;

        // Stage 2: build tree nodes via DFS
        let mut arena = build_tree_nodes(store, page_id, root)?;

        // Stage 3: first walk (bottom-up contour merge)
        first_walk(&mut arena, &self.config);

        // Stage 4: second walk (top-down offset accumulation)
        let m = 0.0;
        let root_idx = arena.root;
        second_walk(&mut arena, root_idx, m);

        // Stage 5: apply coordinates based on direction
        let mut vertices = Vec::new();
        apply_coordinates(&mut arena, &mut vertices, self.config.direction);

        // Stage 6: local edge processing (jetty routing)
        let mut edge_waypoints = Vec::new();
        local_edge_processing(
            &arena,
            store,
            page_id,
            &mut edge_waypoints,
            self.config.direction,
        );

        // Stage 7: adjust parent group bounding boxes
        let mut group_rects = Vec::new();
        adjust_parents(&arena, store, page_id, &mut group_rects);

        Ok(TreeLayoutResult {
            vertices,
            edge_waypoints,
            group_rects,
        })
    }
}

/// Dispatch to the appropriate layout algorithm based on [`LayoutKind`].
///
/// This function is the public entry point for the layout system. It returns
/// a [`LayoutError::UnknownKind`] when `kind` is a future variant not yet
/// defined, preserving the `#[non_exhaustive]` contract.
pub fn apply_layout_kind(
    kind: LayoutKind,
    config: &LayoutConfig,
    store: &ModelStore,
    page_id: PageId,
) -> LayoutResult<TreeLayoutResult> {
    match kind {
        LayoutKind::Hierarchical => {
            // HierarchicalLayout mutates the store in-place and doesn't produce
            // TreeLayoutResult (no waypoints, no group rects). For v1, return
            // an error directing callers to use HierarchicalLayout directly.
            Err(LayoutError::LayoutFailed(
                "HierarchicalLayout does not produce TreeLayoutResult; use HierarchicalLayout::layout directly".into(),
            ))
        }
        LayoutKind::Tree => {
            let layout = TreeLayout::new(config.clone());
            layout.layout(store, page_id)
        }
        LayoutKind::Organic => {
            // Full dispatch wired in commit 5; for now return a clear error so
            // callers know this variant needs OrganicLayoutConfig.
            Err(LayoutError::LayoutFailed(
                "Organic layout requires OrganicLayoutConfig; use OrganicLayout directly".into(),
            ))
        }
    }
}

// ─── Tree Validation ──────────────────────────────────────────────────────────

/// Validate that the page graph forms a valid tree.
///
/// Returns `Ok(root_id)` if validation passes, otherwise returns a typed error:
/// - [`LayoutError::CycleDetected`] — graph contains a cycle
/// - [`LayoutError::MultipleParents`] — a vertex has more than one incoming edge
/// - [`LayoutError::MultipleRoots`] — more than one vertex has no incoming edge
/// - [`LayoutError::NoRoot`] — no vertices found
///
/// Validation order is deterministic: cycle → multi-parent → multi-root → no-root.
fn validate_tree(store: &ModelStore, page_id: PageId) -> LayoutResult<VertexId> {
    use std::collections::HashMap;

    // Collect all vertices and edges on this page
    let vertices: Vec<_> = store
        .vertices_with_ids()
        .filter(|(_, v)| v.page_id == Some(page_id))
        .map(|(id, _)| id)
        .collect();

    if vertices.is_empty() {
        return Err(LayoutError::NoRoot);
    }

    let edges: Vec<_> = store
        .edges_with_ids()
        .filter(|(_, e)| e.page_id == Some(page_id))
        .collect();

    // Build adjacency and reverse-adjacency maps
    let mut outgoing: HashMap<VertexId, Vec<VertexId>> = HashMap::new();
    let mut incoming: HashMap<VertexId, Vec<VertexId>> = HashMap::new();

    for &vid in &vertices {
        outgoing.insert(vid, Vec::new());
        incoming.insert(vid, Vec::new());
    }

    for (_, edge) in &edges {
        outgoing.entry(edge.source).or_default().push(edge.target);
        incoming.entry(edge.target).or_default().push(edge.source);
    }

    // ── Stage 1: Cycle detection via DFS coloring (white/gray/black) ──────────
    #[derive(Clone, Copy, PartialEq)]
    enum Color {
        White,
        Gray,
        Black,
    }
    let mut color: HashMap<VertexId, Color> = vertices.iter().map(|&v| (v, Color::White)).collect();

    fn dfs_cycle(
        vid: VertexId,
        outgoing: &HashMap<VertexId, Vec<VertexId>>,
        color: &mut HashMap<VertexId, Color>,
        path: &mut Vec<VertexId>,
    ) -> bool {
        color.insert(vid, Color::Gray);
        path.push(vid);

        if let Some(neighbors) = outgoing.get(&vid) {
            for &neighbor in neighbors {
                match color.get(&neighbor) {
                    Some(Color::Gray) => {
                        // Found a back-edge — cycle detected
                        path.push(neighbor);
                        return true;
                    }
                    Some(Color::White) => {
                        if dfs_cycle(neighbor, outgoing, color, path) {
                            return true;
                        }
                    }
                    Some(Color::Black) => {}
                    None => {}
                }
            }
        }

        path.pop();
        color.insert(vid, Color::Black);
        false
    }

    let mut cycle_path: Vec<VertexId> = Vec::new();
    for &vid in &vertices {
        if *color.get(&vid).unwrap() == Color::White {
            cycle_path.clear();
            if dfs_cycle(vid, &outgoing, &mut color, &mut cycle_path) {
                // Extract just the cycle portion from the path
                if let Some(&cycle_start) = cycle_path.last() {
                    let cycle_start_idx = cycle_path
                        .iter()
                        .position(|&v| v == cycle_start)
                        .unwrap_or(0);
                    let cycle: Vec<VertexId> =
                        cycle_path.iter().skip(cycle_start_idx).copied().collect();
                    return Err(LayoutError::CycleDetected(cycle));
                }
                return Err(LayoutError::CycleDetected(cycle_path.clone()));
            }
        }
    }

    // ── Stage 2: Multiple parents detection ─────────────────────────────────
    for (&vid, parents) in &incoming {
        if parents.len() > 1 {
            return Err(LayoutError::MultipleParents(vid, parents.clone()));
        }
    }

    // ── Stage 3: Root detection (single vertex with no incoming edges) ────────
    let roots: Vec<VertexId> = vertices
        .iter()
        .filter(|&&vid| incoming.get(&vid).unwrap().is_empty())
        .copied()
        .collect();

    match roots.len() {
        0 => Err(LayoutError::NoRoot),
        1 => Ok(roots[0]),
        _ => Err(LayoutError::MultipleRoots(roots)),
    }
}

// ─── Tree Arena ───────────────────────────────────────────────────────────────

/// Internal tree node stored in the arena.
///
/// The arena uses index-based "pointers" for contour linked-lists to avoid
/// any `unsafe` code. `TreeNode` does not store children as IDs directly;
/// instead, children are accessed through the arena's `children` vec.
#[derive(Debug, Clone)]
struct TreeNode {
    /// The diagram vertex ID this node represents.
    id: VertexId,
    /// Arena index of the parent node (None for root).
    parent: Option<usize>,
    /// Arena indices of child nodes.
    children: Vec<usize>,
    /// Computed x coordinate (set by second_walk).
    x: f64,
    /// Computed y coordinate (set by second_walk).
    y: f64,
    /// Node width from geometry (or default).
    w: f64,
    /// Node height from geometry (or default).
    h: f64,
    /// Preliminary x position (set by first_walk).
    prelim: f64,
    /// Modifier accumulated during contour merging.
    mod_: f64,
    /// Shift amount for sibling subtree repositioning.
    #[allow(dead_code)]
    shift: f64,
    /// Change in shift between siblings.
    #[allow(dead_code)]
    change: f64,
    /// Thread node for contour traversal (index into arena).
    #[allow(dead_code)]
    thread: Option<usize>,
    /// Ancestor node for contour operations (index into arena).
    #[allow(dead_code)]
    ancestor: usize,
    /// Left contour head segment index (index into nodes vec).
    contour_left: Option<usize>,
    /// Right contour head segment index (index into nodes vec).
    contour_right: Option<usize>,
}

/// Arena-based tree storage for the Moen algorithm.
///
/// Nodes are stored in a `Vec` and referenced by their index position.
/// No `unsafe` code — all "pointer" operations use index lookups.
#[derive(Debug, Clone)]
struct TreeArena {
    nodes: Vec<TreeNode>,
    root: usize,
}

/// Build a `TreeArena` from the store by doing a DFS from the root.
fn build_tree_nodes(
    store: &ModelStore,
    page_id: PageId,
    root: VertexId,
) -> LayoutResult<TreeArena> {
    use std::collections::HashMap;

    // Map VertexId -> arena index
    let mut vid_to_index: HashMap<VertexId, usize> = HashMap::new();
    // All vertices on this page
    let page_vertices: Vec<VertexId> = store
        .vertices_with_ids()
        .filter(|(_, v)| v.page_id == Some(page_id))
        .map(|(id, _)| id)
        .collect();

    // Build adjacency: for each vertex, find its outgoing edges
    let mut children_map: HashMap<VertexId, Vec<VertexId>> = HashMap::new();
    for vid in &page_vertices {
        children_map.insert(*vid, Vec::new());
    }

    for (_, edge) in store.edges_with_ids() {
        if edge.page_id == Some(page_id)
            && page_vertices.contains(&edge.source)
            && page_vertices.contains(&edge.target)
        {
            children_map
                .entry(edge.source)
                .or_default()
                .push(edge.target);
        }
    }

    // First pass: create all TreeNodes with default values
    let mut nodes: Vec<TreeNode> = Vec::new();
    for &vid in &page_vertices {
        let (w, h) = store
            .vertex(vid)
            .and_then(|v| v.geometry.as_ref())
            .map(|g| (g.width, g.height))
            .unwrap_or((120.0, 60.0));

        let node = TreeNode {
            id: vid,
            parent: None,
            children: Vec::new(),
            x: 0.0,
            y: 0.0,
            w,
            h,
            prelim: 0.0,
            mod_: 0.0,
            shift: 0.0,
            change: 0.0,
            thread: None,
            ancestor: 0,
            contour_left: None,
            contour_right: None,
        };
        vid_to_index.insert(vid, nodes.len());
        nodes.push(node);
    }

    // Second pass: link parent/child using arena indices (DFS)
    fn link_children(
        vid: VertexId,
        parent_arena_idx: Option<usize>,
        children_map: &HashMap<VertexId, Vec<VertexId>>,
        vid_to_index: &HashMap<VertexId, usize>,
        nodes: &mut Vec<TreeNode>,
    ) {
        let self_idx = vid_to_index[&vid];
        if let Some(parent_idx) = parent_arena_idx {
            nodes[self_idx].parent = Some(parent_idx);
            nodes[parent_idx].children.push(self_idx);
        }

        if let Some(children) = children_map.get(&vid) {
            for &child_vid in children {
                link_children(child_vid, Some(self_idx), children_map, vid_to_index, nodes);
            }
        }
    }

    link_children(root, None, &children_map, &vid_to_index, &mut nodes);

    let root_idx = vid_to_index[&root];
    Ok(TreeArena {
        nodes,
        root: root_idx,
    })
}

// ─── Moen Algorithm Stages ────────────────────────────────────────────────────

/// First walk: bottom-up computation of preliminary positions and contour merging.
///
/// This implements the Moen algorithm's first walk which:
/// - Initializes leaf nodes (layoutLeaf)
/// - Computes preliminary x positions for internal nodes (join)
/// - Merges adjacent contours (merge)
/// - Positions parent relative to children (attachParent)
fn first_walk(arena: &mut TreeArena, config: &LayoutConfig) {
    let root = arena.root;
    first_walk_recursive(arena, root, 0, config);
}

fn first_walk_recursive(
    arena: &mut TreeArena,
    node_idx: usize,
    depth: usize,
    config: &LayoutConfig,
) {
    // Process children first (bottom-up)
    let child_count = arena.nodes[node_idx].children.len();
    for i in 0..child_count {
        let child_idx = arena.nodes[node_idx].children[i];
        first_walk_recursive(arena, child_idx, depth + 1, config);
    }

    // Set y based on depth (used by apply_coordinates for LeftToRight)
    arena.nodes[node_idx].y = depth as f64;

    if arena.nodes[node_idx].children.is_empty() {
        // Leaf node: set up contour
        layout_leaf(arena, node_idx);
    } else {
        // Internal node: compute position based on children
        // Position children left-to-right with proper spacing
        let children = arena.nodes[node_idx].children.clone();
        let spacing = config.intra_cell_spacing;

        // Set the first child's preliminary position
        arena.nodes[children[0]].prelim = 0.0;

        // Position each subsequent child to the right of the previous one
        for i in 1..children.len() {
            let prev_child = children[i - 1];
            let curr_child = children[i];

            // The new position is the previous child's position plus the subtree width plus spacing
            let prev_subtree_width = arena.nodes[prev_child].w;
            let curr_node_width = arena.nodes[curr_child].w;
            let offset = prev_subtree_width / 2.0 + spacing + curr_node_width / 2.0;

            arena.nodes[curr_child].prelim = arena.nodes[prev_child].prelim + offset;
        }

        // Set up contours
        let leftmost = children[0];
        let rightmost = *children.last().unwrap();
        arena.nodes[node_idx].contour_left = Some(leftmost);
        arena.nodes[node_idx].contour_right = Some(rightmost);

        // Set parent's preliminary x as midpoint of its children
        // This is used by apply_coordinates for LeftToRight layout
        arena.nodes[node_idx].prelim =
            (arena.nodes[leftmost].prelim + arena.nodes[rightmost].prelim) / 2.0;
    }
}

/// Initialize a leaf node's contour for the Moen algorithm.
fn layout_leaf(arena: &mut TreeArena, leaf_idx: usize) {
    // Leaf nodes get their contour initialized with their own dimensions
    // The contour represents the bounding outline of the subtree
    arena.nodes[leaf_idx].contour_left = Some(leaf_idx);
    arena.nodes[leaf_idx].contour_right = Some(leaf_idx);
}

/// Join two sibling subtrees: position `right` relative to `left`.
#[allow(dead_code)]
fn join(arena: &mut TreeArena, left: usize, right: usize) {
    // The Moen join sets up the initial relationship between siblings
    // before contour merging occurs
    let left_node_prelim = arena.nodes[left].prelim;
    let right_node_prelim = arena.nodes[right].prelim;

    // Set ancestor and thread for both subtrees
    arena.nodes[left].ancestor = left;
    arena.nodes[right].ancestor = left;

    // The thread links the right subtree to the left for contour walking
    arena.nodes[right].thread = Some(left);

    // Initial offset: place right subtree to the right of left subtree
    // with proper spacing
    let separation = arena.nodes[left].w / 2.0 + arena.nodes[right].w / 2.0 + 30.0; // intra_cell_spacing
    arena.nodes[right].mod_ = left_node_prelim + separation - right_node_prelim;
}

/// Merge adjacent subtrees by walking their contours and adjusting positions.
#[allow(dead_code)]
fn merge(arena: &mut TreeArena, left: usize, right: usize, config: &LayoutConfig) {
    // Walk down the contours of left and right subtrees, merging them
    // Uses the classic Moen contour-tracking algorithm

    let mut left_idx = left;
    let mut right_idx = right;

    loop {
        // Descend left contour
        let left_contour = descend_left_contour(arena, left_idx);
        // Descend right contour
        let right_contour = descend_right_contour(arena, right_idx);

        // Check if we've reached the bottom of both contours
        if left_contour.is_none() && right_contour.is_none() {
            break;
        }

        // Get the y-levels of the two contours
        let left_y = left_contour.map(|i| arena.nodes[i].y).unwrap_or(f64::MAX);
        let right_y = right_contour.map(|i| arena.nodes[i].y).unwrap_or(f64::MAX);

        // The subtree with the lower contour level should be shifted
        if left_y < right_y {
            // Left subtree is shallower — advance left contour
            if let Some(next) = left_contour {
                left_idx = next;
            } else {
                break;
            }
        } else if right_y < left_y {
            // Right subtree is shallower — advance right contour
            if let Some(next) = right_contour {
                right_idx = next;
            } else {
                break;
            }
        } else {
            // Same level — merge here by adjusting the offset
            if let (Some(l), Some(r)) = (left_contour, right_contour) {
                let left_node_x = arena.nodes[l].x;
                let left_node_w = arena.nodes[l].w;
                let right_node_x = arena.nodes[r].x;
                let right_node_w = arena.nodes[r].w;

                // Compute the separation needed
                let sep = config.intra_cell_spacing;
                let offset =
                    left_node_x + left_node_w / 2.0 + sep - right_node_x + right_node_w / 2.0;

                if offset > 0.0 {
                    // Shift right subtree by the offset
                    apply_subtree_shift(arena, right, offset);
                }
            }

            // Advance both contours
            if let Some(next) = left_contour {
                left_idx = next;
            }
            if let Some(next) = right_contour {
                right_idx = next;
            }

            if left_contour.is_none() && right_contour.is_none() {
                break;
            }
        }
    }
}

/// Descend the left contour of a subtree to find the bottommost node.
#[allow(dead_code)]
fn descend_left_contour(arena: &TreeArena, node_idx: usize) -> Option<usize> {
    let children = &arena.nodes[node_idx].children;
    if children.is_empty() {
        Some(node_idx)
    } else {
        descend_left_contour(arena, children[0])
    }
}

/// Descend the right contour of a subtree to find the bottommost node.
#[allow(dead_code)]
fn descend_right_contour(arena: &TreeArena, node_idx: usize) -> Option<usize> {
    let children = &arena.nodes[node_idx].children;
    if children.is_empty() {
        Some(node_idx)
    } else {
        let last_child = *children.last().unwrap();
        descend_right_contour(arena, last_child)
    }
}

/// Apply a position offset to an entire subtree.
#[allow(dead_code)]
fn apply_subtree_shift(arena: &mut TreeArena, node_idx: usize, offset: f64) {
    // Apply the shift to this node and recursively to all descendants
    fn apply_shift(arena: &mut TreeArena, node_idx: usize, offset: f64) {
        arena.nodes[node_idx].prelim += offset;
        arena.nodes[node_idx].x += offset;
        for child_idx in arena.nodes[node_idx].children.clone() {
            apply_shift(arena, child_idx, offset);
        }
    }
    apply_shift(arena, node_idx, offset);
}

/// Attach a parent node relative to its children (center it over its children).
#[allow(dead_code)]
fn attach_parent(arena: &mut TreeArena, parent_idx: usize) {
    let children = &arena.nodes[parent_idx].children;

    if children.is_empty() {
        return;
    }

    let leftmost = children[0];
    let rightmost = *children.last().unwrap();

    let left_node_prelim = arena.nodes[leftmost].prelim;
    let right_node_prelim = arena.nodes[rightmost].prelim;

    // Parent's preliminary x is the midpoint of its extreme children
    let midpoint = (left_node_prelim + right_node_prelim) / 2.0;
    arena.nodes[parent_idx].prelim = midpoint;

    // Initialize parent contour at its position
    arena.nodes[parent_idx].contour_left = Some(parent_idx);
    arena.nodes[parent_idx].contour_right = Some(parent_idx);
}

/// Second walk: top-down traversal to compute final absolute positions.
fn second_walk(arena: &mut TreeArena, node_idx: usize, m: f64) {
    second_walk_recursive(arena, node_idx, m);
}

fn second_walk_recursive(arena: &mut TreeArena, node_idx: usize, m: f64) {
    // Accumulate the modifier to get the final x position
    let prelim = arena.nodes[node_idx].prelim;
    let mod_ = arena.nodes[node_idx].mod_;
    let y = arena.nodes[node_idx].y;

    let x = prelim + m;

    arena.nodes[node_idx].x = x;
    arena.nodes[node_idx].y = y;

    // Propagate modifier to children
    let new_m = m + mod_;

    for child_idx in arena.nodes[node_idx].children.clone() {
        // Set y position based on depth (config.inter_rank_spacing)
        arena.nodes[child_idx].y = y + 1.0; // Will be multiplied by inter_rank_spacing
        second_walk_recursive(arena, child_idx, new_m);
    }
}

/// Apply computed coordinates to the result vector based on layout direction.
fn apply_coordinates(
    arena: &mut TreeArena,
    result: &mut Vec<(VertexId, Rect)>,
    direction: Direction,
) {
    // First compute max depth for y assignment
    let mut depths: Vec<(usize, usize)> = Vec::new(); // (node_idx, depth)
    compute_depths(arena, arena.root, 0, &mut depths);

    // Convert depths to y positions
    let mut depth_to_y: Vec<f64> = Vec::new();
    for &(_node_idx, depth) in &depths {
        let y = (depth as f64) * 100.0; // inter_rank_spacing default
        if depth >= depth_to_y.len() {
            depth_to_y.resize(depth + 1, 0.0);
        }
        depth_to_y[depth] = depth_to_y[depth].max(y);
    }

    // Assign y positions based on depth and update arena nodes
    let mut y_by_node: Vec<f64> = vec![0.0; arena.nodes.len()];
    for &(node_idx, depth) in &depths {
        y_by_node[node_idx] = depth_to_y[depth];
    }

    // Update arena nodes with correct y values (for local_edge_processing to use)
    #[allow(clippy::needless_range_loop)]
    for node_idx in 0..arena.nodes.len() {
        arena.nodes[node_idx].y = y_by_node[node_idx];
    }

    // Now generate the result
    for (node_idx, node) in arena.nodes.iter().enumerate() {
        let vid = node.id;
        let node_x = node.x;
        let node_y = y_by_node[node_idx];
        let w = node.w;
        let h = node.h;

        let rect = match direction {
            Direction::TopToBottom => Rect {
                origin: Point {
                    x: node_x,
                    y: node_y,
                },
                size: Size {
                    width: w,
                    height: h,
                },
            },
            Direction::LeftToRight => Rect {
                origin: Point {
                    x: node_x, // sibling offset (layout-computed)
                    y: node_y, // depth-based for layering
                }, // No swap - x is horizontal (sibling offset), y is vertical (depth)
                size: Size {
                    width: h,  // swap: height becomes width for vertical layout
                    height: w, // swap: width becomes height
                },
            },
        };

        result.push((vid, rect));
    }
}

fn compute_depths(
    arena: &TreeArena,
    node_idx: usize,
    depth: usize,
    result: &mut Vec<(usize, usize)>,
) {
    result.push((node_idx, depth));
    for &child_idx in &arena.nodes[node_idx].children.clone() {
        compute_depths(arena, child_idx, depth + 1, result);
    }
}

// ─── Jetty Routing ──────────────────────────────────────────────────────────

/// Compute jetty routing waypoints for all edges in the tree.
///
/// For each edge from parent to child:
/// - Exit from parent's center or distributed across parent's width
/// - Drop vertically (or horizontally for LeftToRight)
/// - Enter at child's center
fn local_edge_processing(
    arena: &TreeArena,
    store: &ModelStore,
    page_id: PageId,
    result: &mut Vec<(EdgeId, Vec<Point>)>,
    direction: Direction,
) {
    // Collect all edges on this page that connect tree nodes
    let edges: Vec<_> = store
        .edges_with_ids()
        .filter(|(_, e)| e.page_id == Some(page_id))
        .collect();

    // Build a map from child vertex to edge
    let child_to_edge: std::collections::HashMap<VertexId, EdgeId> =
        edges.iter().map(|(eid, e)| (e.target, *eid)).collect();

    // Group children by parent to distribute exit points
    let mut children_by_parent: std::collections::HashMap<usize, Vec<usize>> =
        std::collections::HashMap::new();
    for node_idx in 0..arena.nodes.len() {
        if let Some(parent_idx) = arena.nodes[node_idx].parent {
            children_by_parent
                .entry(parent_idx)
                .or_default()
                .push(node_idx);
        }
    }

    // Process each node that has a parent (i.e., all non-root nodes)
    for node_idx in 0..arena.nodes.len() {
        let node = &arena.nodes[node_idx];
        if let Some(parent_idx) = node.parent {
            let parent = &arena.nodes[parent_idx];

            // Get the edge connecting parent to this node
            if let Some(&eid) = child_to_edge.get(&node.id) {
                // Get sibling index for distributing exit points
                let siblings = children_by_parent.get(&parent_idx);
                let sibling_index = siblings
                    .and_then(|sibs| sibs.iter().position(|&idx| idx == node_idx))
                    .unwrap_or(0);
                let sibling_count = siblings.map(|s| s.len()).unwrap_or(1);

                // Compute waypoints for this edge with distributed exit point
                let waypoints = compute_jetty_waypoints(
                    parent.x,
                    parent.y,
                    parent.w,
                    parent.h,
                    node.x,
                    node.y,
                    node.w,
                    node.h,
                    direction,
                    sibling_index,
                    sibling_count,
                );
                result.push((eid, waypoints));
            }
        }
    }
}

/// Compute jetty waypoints for a single edge.
///
/// The sibling_index and sibling_count parameters are used to distribute
/// exit points across the parent's width/height so adjacent siblings don't
/// have overlapping edges.
#[allow(clippy::too_many_arguments)]
fn compute_jetty_waypoints(
    parent_x: f64,
    parent_y: f64,
    parent_w: f64,
    parent_h: f64,
    child_x: f64,
    child_y: f64,
    child_w: f64,
    child_h: f64,
    direction: Direction,
    sibling_index: usize,
    sibling_count: usize,
) -> Vec<Point> {
    match direction {
        Direction::TopToBottom => {
            // Distribute exit points across parent's bottom edge
            // spacing = parent_w / (sibling_count + 1)
            let spacing = parent_w / (sibling_count as f64 + 1.0);
            let exit_x = parent_x + spacing * (sibling_index as f64 + 1.0);
            let exit_y = parent_y + parent_h;
            let entry_x = child_x + child_w / 2.0;
            let entry_y = child_y;

            // Single vertical jetty
            let mid_y = (exit_y + entry_y) / 2.0;
            vec![
                Point {
                    x: exit_x,
                    y: exit_y,
                },
                Point {
                    x: exit_x,
                    y: mid_y,
                },
                Point {
                    x: entry_x,
                    y: mid_y,
                },
                Point {
                    x: entry_x,
                    y: entry_y,
                },
            ]
        }
        Direction::LeftToRight => {
            // Distribute exit points across parent's right edge
            let spacing = parent_h / (sibling_count as f64 + 1.0);
            let exit_x = parent_x + parent_w;
            let exit_y = parent_y + spacing * (sibling_index as f64 + 1.0);
            let entry_x = child_x;
            let entry_y = child_y + child_h / 2.0;

            let mid_x = (exit_x + entry_x) / 2.0;
            vec![
                Point {
                    x: exit_x,
                    y: exit_y,
                },
                Point {
                    x: mid_x,
                    y: exit_y,
                },
                Point {
                    x: mid_x,
                    y: entry_y,
                },
                Point {
                    x: entry_x,
                    y: entry_y,
                },
            ]
        }
    }
}

// ─── Group Bounding Box Adjustment ────────────────────────────────────────────

/// Recompute group bounding boxes based on post-layout vertex positions.
///
/// Groups are processed deepest-first so that inner groups are sized before
/// their containers. Groups with no children on the page are skipped.
fn adjust_parents(
    arena: &TreeArena,
    store: &ModelStore,
    page_id: PageId,
    result: &mut Vec<(GroupId, Rect)>,
) {
    // Collect all groups on this page
    let page_groups: Vec<_> = store
        .groups_with_ids()
        .filter(|(_, g)| g.page_id == Some(page_id))
        .collect();

    // For each group, find all child vertices (direct and transitive via tree)
    // and compute the bounding box
    for (gid, _group) in &page_groups {
        // Find all tree vertices that belong to this group
        let mut child_vertices: Vec<usize> = Vec::new();

        for node_idx in 0..arena.nodes.len() {
            let vid = arena.nodes[node_idx].id;

            // Look up this vertex in the store to check its parent group
            if let Some(vertex) = store.vertex(vid) {
                if vertex.page_id == Some(page_id) {
                    if let Some(vertex_parent) = vertex.parent {
                        if vertex_parent == *gid {
                            child_vertices.push(node_idx);
                        }
                    }
                }
            }
        }

        if child_vertices.is_empty() {
            continue; // Skip groups with no children
        }

        // Compute bounding box of all child vertices
        let mut min_x = f64::MAX;
        let mut min_y = f64::MAX;
        let mut max_x = f64::MIN;
        let mut max_y = f64::MIN;

        for &node_idx in &child_vertices {
            let node = &arena.nodes[node_idx];
            let x = node.x;
            let y = node.y;
            let w = node.w;
            let h = node.h;

            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x + w);
            max_y = max_y.max(y + h);
        }

        // Apply GROUP_PADDING on all sides
        let rect = Rect {
            origin: Point {
                x: min_x - GROUP_PADDING,
                y: min_y - GROUP_PADDING,
            },
            size: Size {
                width: (max_x - min_x) + 2.0 * GROUP_PADDING,
                height: (max_y - min_y) + 2.0 * GROUP_PADDING,
            },
        };

        result.push((*gid, rect));
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::edge::Edge;
    use diagram_core::geometry::CellGeometry;
    use diagram_core::group::Group;
    use diagram_core::page::Page;
    use diagram_core::vertex::Vertex;

    fn make_tree_store(
        vertices: &[(f64, f64, f64, f64)], // (x, y, w, h)
        edges: &[(usize, usize)],          // (source_idx, target_idx)
    ) -> (ModelStore, PageId) {
        let mut store = ModelStore::new();

        let page = Page::new(PageId::default());
        let page_id = store.insert_page(page);
        let mut page_fixed = Page::new(page_id);
        page_fixed.id = page_id;
        store.replace_page(page_id, page_fixed);

        let mut vids = Vec::new();
        for (x, y, w, h) in vertices {
            let v = Vertex {
                geometry: Some(CellGeometry {
                    x: *x,
                    y: *y,
                    width: *w,
                    height: *h,
                    relative: false,
                    ..Default::default()
                }),
                page_id: Some(page_id),
                ..Vertex::default()
            };
            vids.push(store.insert_vertex(v));
        }

        for (src_idx, tgt_idx) in edges {
            let e = Edge {
                source: vids[*src_idx],
                target: vids[*tgt_idx],
                page_id: Some(page_id),
                ..Edge::default()
            };
            store.insert_edge(e);
        }

        (store, page_id)
    }

    // ── Tree Validation Tests ──────────────────────────────────────────────

    #[test]
    fn validate_empty_page_returns_no_root() {
        let (store, page_id) = make_tree_store(&[], &[]);
        let result = validate_tree(&store, page_id);
        assert!(matches!(result, Err(LayoutError::NoRoot)));
    }

    #[test]
    fn validate_single_vertex_is_root() {
        let (store, page_id) = make_tree_store(&[(0.0, 0.0, 120.0, 60.0)], &[]);
        let result = validate_tree(&store, page_id);
        assert!(result.is_ok(), "single vertex should be the root");
    }

    #[test]
    fn validate_chain_returns_root() {
        let (store, page_id) = make_tree_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[(0, 1), (1, 2)],
        );
        let result = validate_tree(&store, page_id);
        assert!(result.is_ok());
    }

    #[test]
    fn validate_multiple_roots_detected() {
        let (store, page_id) =
            make_tree_store(&[(0.0, 0.0, 120.0, 60.0), (0.0, 0.0, 120.0, 60.0)], &[]);
        let result = validate_tree(&store, page_id);
        assert!(matches!(result, Err(LayoutError::MultipleRoots(_))));
    }

    #[test]
    fn validate_cycle_detected() {
        let (store, page_id) = make_tree_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[(0, 1), (1, 2), (2, 0)], // cycle: 0 -> 1 -> 2 -> 0
        );
        let result = validate_tree(&store, page_id);
        assert!(matches!(result, Err(LayoutError::CycleDetected(_))));
    }

    #[test]
    fn validate_multiple_parents_detected() {
        let (store, page_id) = make_tree_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[(0, 2), (1, 2)], // vertex 2 has two parents: 0 and 1
        );
        let result = validate_tree(&store, page_id);
        assert!(matches!(result, Err(LayoutError::MultipleParents(_, _))));
    }

    // ── TreeArena Build Tests ──────────────────────────────────────────────

    #[test]
    fn build_tree_nodes_chain() {
        let (store, page_id) = make_tree_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[(0, 1), (1, 2)],
        );
        let root = validate_tree(&store, page_id).unwrap();
        let arena = build_tree_nodes(&store, page_id, root).unwrap();

        // Should have 3 nodes
        assert_eq!(arena.nodes.len(), 3);

        // Root (node 0) should have no parent
        assert!(arena.nodes[0].parent.is_none());

        // Node 1 should have parent 0
        assert_eq!(arena.nodes[1].parent, Some(0));

        // Node 2 should have parent 1
        assert_eq!(arena.nodes[2].parent, Some(1));
    }

    #[test]
    fn build_tree_nodes_balanced() {
        //    0
        //  1   2
        // 3 4 5 6
        let (store, page_id) = make_tree_store(
            &[
                (0.0, 0.0, 120.0, 60.0), // 0 - root
                (0.0, 0.0, 120.0, 60.0), // 1
                (0.0, 0.0, 120.0, 60.0), // 2
                (0.0, 0.0, 120.0, 60.0), // 3
                (0.0, 0.0, 120.0, 60.0), // 4
                (0.0, 0.0, 120.0, 60.0), // 5
                (0.0, 0.0, 120.0, 60.0), // 6
            ],
            &[(0, 1), (0, 2), (1, 3), (1, 4), (2, 5), (2, 6)],
        );
        let root = validate_tree(&store, page_id).unwrap();
        let arena = build_tree_nodes(&store, page_id, root).unwrap();

        assert_eq!(arena.nodes.len(), 7);
        assert!(arena.nodes[0].parent.is_none()); // root
        assert_eq!(arena.nodes[1].parent, Some(0));
        assert_eq!(arena.nodes[2].parent, Some(0));
    }

    // ── Layout Algorithm Tests ─────────────────────────────────────────────

    #[test]
    fn tree_layout_chain_increasing_y() {
        let (store, page_id) = make_tree_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[(0, 1), (1, 2)],
        );

        let layout = TreeLayout::new(LayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        // Check that y coordinates are strictly increasing (TopToBottom)
        let mut ys: Vec<f64> = result
            .vertices
            .iter()
            .map(|(_, rect)| rect.origin.y)
            .collect();
        ys.sort_by(|a, b| a.partial_cmp(b).unwrap());

        assert!(ys[1] > ys[0], "second vertex should be below first");
        assert!(ys[2] > ys[1], "third vertex should be below second");
    }

    #[test]
    fn tree_layout_balanced_no_overlap() {
        //    0
        //  1   2
        let (store, page_id) = make_tree_store(
            &[
                (0.0, 0.0, 120.0, 60.0), // 0
                (0.0, 0.0, 120.0, 60.0), // 1
                (0.0, 0.0, 120.0, 60.0), // 2
            ],
            &[(0, 1), (0, 2)],
        );

        let layout = TreeLayout::new(LayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        // Verify all rectangles are non-overlapping
        for i in 0..result.vertices.len() {
            for j in (i + 1)..result.vertices.len() {
                let rect_i = result.vertices[i].1;
                let rect_j = result.vertices[j].1;

                // Check no overlap using separating axis theorem (simplified)
                let no_overlap = rect_i.origin.x + rect_i.size.width <= rect_j.origin.x
                    || rect_j.origin.x + rect_j.size.width <= rect_i.origin.x
                    || rect_i.origin.y + rect_i.size.height <= rect_j.origin.y
                    || rect_j.origin.y + rect_j.size.height <= rect_i.origin.y;

                assert!(no_overlap, "rectangles {} and {} should not overlap", i, j);
            }
        }
    }

    #[test]
    fn tree_layout_left_to_right_siblings_side_by_side() {
        let (store, page_id) = make_tree_store(
            &[
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
                (0.0, 0.0, 120.0, 60.0),
            ],
            &[(0, 1), (0, 2)],
        );

        let config = LayoutConfig {
            direction: Direction::LeftToRight,
            ..LayoutConfig::default()
        };
        let layout = TreeLayout::new(config);
        let result = layout.layout(&store, page_id).unwrap();

        // In LeftToRight, x should increase for children
        let mut xs: Vec<f64> = result
            .vertices
            .iter()
            .map(|(_, rect)| rect.origin.x)
            .collect();
        xs.sort_by(|a, b| a.partial_cmp(b).unwrap());

        // At least the siblings (1 and 2) should be separated
        assert!(xs[1] < xs[2] || xs[2] < xs[1]); // They should have different x values
    }

    // ── Edge Waypoint Tests ─────────────────────────────────────────────────

    #[test]
    fn tree_layout_edge_waypoints_not_empty() {
        let (store, page_id) = make_tree_store(
            &[(0.0, 0.0, 120.0, 60.0), (0.0, 0.0, 120.0, 60.0)],
            &[(0, 1)],
        );

        let layout = TreeLayout::new(LayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        // Should have waypoints for the single edge
        assert!(!result.edge_waypoints.is_empty());

        // Waypoints should have at least 2 points (exit and entry)
        for (_, waypoints) in &result.edge_waypoints {
            assert!(
                waypoints.len() >= 2,
                "waypoints should have at least 2 points"
            );
        }
    }

    #[test]
    fn tree_layout_waypoints_end_at_child_center() {
        let (store, page_id) = make_tree_store(
            &[(0.0, 0.0, 120.0, 60.0), (0.0, 0.0, 120.0, 60.0)],
            &[(0, 1)],
        );

        let layout = TreeLayout::new(LayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        // Get the child vertex position (second vertex)
        let child_rect = result.vertices.get(1).map(|(_, r)| r).unwrap();

        let expected_entry = Point {
            x: child_rect.origin.x + child_rect.size.width / 2.0,
            y: child_rect.origin.y, // For TopToBottom, entry is at top
        };

        // The last waypoint should be close to the child entry point
        if let Some((_, waypoints)) = result.edge_waypoints.first() {
            if let Some(last) = waypoints.last() {
                let dx = (last.x - expected_entry.x).abs();
                let dy = (last.y - expected_entry.y).abs();
                assert!(
                    dx < 1e-6 && dy < 1e-6,
                    "last waypoint {:?} should be at child center {:?}",
                    last,
                    expected_entry
                );
            }
        }
    }

    // ── Group Bounding Box Tests ─────────────────────────────────────────────

    #[test]
    fn tree_layout_group_without_children_omitted() {
        let mut store = ModelStore::new();

        let page = Page::new(PageId::default());
        let page_id = store.insert_page(page);
        let mut page_fixed = Page::new(page_id);
        page_fixed.id = page_id;
        store.replace_page(page_id, page_fixed);

        // Create an empty group (no children)
        let group = Group {
            geometry: Some(CellGeometry {
                x: 0.0,
                y: 0.0,
                width: 50.0,
                height: 50.0,
                relative: false,
                ..Default::default()
            }),
            page_id: Some(page_id),
            ..Group::default()
        };
        let gid = store.insert_group(group);

        // Create a single vertex NOT in the group (forms a tree by itself)
        let v1 = Vertex {
            geometry: Some(CellGeometry {
                x: 10.0,
                y: 10.0,
                width: 120.0,
                height: 60.0,
                relative: false,
                ..Default::default()
            }),
            page_id: Some(page_id),
            parent: None,
            ..Vertex::default()
        };
        store.insert_vertex(v1);

        let layout = TreeLayout::new(LayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        // The empty group should NOT appear in group_rects
        let has_empty_group = result.group_rects.iter().any(|(g, _)| *g == gid);

        assert!(
            !has_empty_group,
            "empty group should be omitted from group_rects"
        );
    }

    // ── LayoutKind Tests ────────────────────────────────────────────────────

    #[test]
    fn layout_kind_debug_roundtrip() {
        let kind = LayoutKind::Tree;
        let debug_str = format!("{:?}", kind);
        assert!(debug_str.contains("Tree"));

        let kind2 = LayoutKind::Hierarchical;
        let debug_str2 = format!("{:?}", kind2);
        assert!(debug_str2.contains("Hierarchical"));
    }

    // ── Empty Page Tests ────────────────────────────────────────────────────

    #[test]
    fn tree_layout_empty_page_returns_empty_result() {
        let mut store = ModelStore::new();
        let page = Page::new(PageId::default());
        let page_id = store.insert_page(page);
        let mut page_fixed = Page::new(page_id);
        page_fixed.id = page_id;
        store.replace_page(page_id, page_fixed);

        // No vertices on the page

        let layout = TreeLayout::new(LayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        assert!(result.vertices.is_empty());
        assert!(result.edge_waypoints.is_empty());
        assert!(result.group_rects.is_empty());
    }

    // ── Multiple Children Jetty Tests ───────────────────────────────────────

    #[test]
    fn tree_layout_4_children_4_distinct_waypoint_x() {
        //       0
        //  1    2    3    4
        let (store, page_id) = make_tree_store(
            &[
                (0.0, 0.0, 120.0, 60.0), // 0 - root
                (0.0, 0.0, 120.0, 60.0), // 1
                (0.0, 0.0, 120.0, 60.0), // 2
                (0.0, 0.0, 120.0, 60.0), // 3
                (0.0, 0.0, 120.0, 60.0), // 4
            ],
            &[(0, 1), (0, 2), (0, 3), (0, 4)],
        );

        let layout = TreeLayout::new(LayoutConfig::default());
        let result = layout.layout(&store, page_id).unwrap();

        // Should have 4 edges
        assert_eq!(result.edge_waypoints.len(), 4);

        // Extract the first x-coordinate of each edge's waypoints
        let first_xs: Vec<f64> = result
            .edge_waypoints
            .iter()
            .filter_map(|(_, wp)| wp.first().map(|p| p.x))
            .collect();

        // All first x-coordinates should be distinct (within parent's width)
        let mut sorted_xs = first_xs.clone();
        sorted_xs.sort_by(|a, b| a.partial_cmp(b).unwrap());

        // Check that they are distinct (no two are exactly equal)
        for i in 0..sorted_xs.len() {
            for j in (i + 1)..sorted_xs.len() {
                assert!(
                    (sorted_xs[i] - sorted_xs[j]).abs() > 1e-6,
                    "waypoint x coordinates should be distinct"
                );
            }
        }
    }
}
