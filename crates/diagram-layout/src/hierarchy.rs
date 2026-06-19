//! Internal graph model for the layout pipeline.
//!
//! [`HierarchyModel`] wraps a petgraph `StableDiGraph` and provides
//! the node/edge types and accessors needed by all pipeline stages.
//! Petgraph types are encapsulated within this module and never leak
//! into the public API.

use diagram_core::id::{EdgeId, VertexId};
use petgraph::graph::NodeIndex;
use petgraph::stable_graph::EdgeIndex;
use petgraph::stable_graph::StableDiGraph;

use crate::config::Direction;

/// The type of a node in the hierarchy graph.
#[derive(Debug, Clone, PartialEq)]
pub enum HierarchyNode {
    /// A real vertex from the diagram (has an engine ID, width, height).
    Real {
        /// The engine-owned vertex identifier.
        id: VertexId,
        /// Width in user-space units.
        width: f64,
        /// Height in user-space units.
        height: f64,
    },
    /// A dummy node inserted by layer assignment to break long edges.
    Dummy,
}

impl HierarchyNode {
    /// Returns `true` if this is a real vertex node.
    pub fn is_real(&self) -> bool {
        matches!(self, HierarchyNode::Real { .. })
    }

    /// Returns `true` if this is a dummy node.
    pub fn is_dummy(&self) -> bool {
        matches!(self, HierarchyNode::Dummy)
    }

    /// If real, returns the vertex ID; otherwise `None`.
    pub fn real_id(&self) -> Option<VertexId> {
        match self {
            HierarchyNode::Real { id, .. } => Some(*id),
            HierarchyNode::Dummy => None,
        }
    }
}

/// Data stored on each edge in the hierarchy graph.
#[derive(Debug, Clone, PartialEq)]
pub struct HierarchyEdgeData {
    /// The engine-owned edge identifier.
    pub id: EdgeId,
    /// Whether the edge was reversed during cycle removal.
    pub reversed: bool,
}

/// Internal graph type for the layout pipeline.
type LayoutGraph = StableDiGraph<HierarchyNode, HierarchyEdgeData>;

/// Node index type used throughout the layout pipeline.
pub type NodeIx = NodeIndex;

/// The internal graph model consumed and mutated by all pipeline stages.
///
/// Wraps a petgraph `StableDiGraph` that stores vertex nodes and edge data.
/// Ranks are stored as a `Vec<Vec<NodeIx>>` where each inner vec corresponds
/// to a layer (set after layer assignment). Positions are stored in a
/// side-channel map to avoid polluting the graph.
#[derive(Debug, Clone)]
pub struct HierarchyModel {
    graph: LayoutGraph,
    /// Nodes assigned to each rank/layer. `ranks[layer]` contains node indices
    /// in their current order (may be reordered by crossing reduction).
    pub ranks: Vec<Vec<NodeIx>>,
    /// The layout direction.
    pub direction: Direction,
    /// Computed positions per node index (set by coordinate assignment).
    positions: Vec<(f64, f64)>,
}

impl HierarchyModel {
    /// Create a new, empty hierarchy model.
    pub fn new(direction: Direction) -> Self {
        Self {
            graph: LayoutGraph::default(),
            ranks: Vec::new(),
            direction,
            positions: Vec::new(),
        }
    }

    /// Add a real vertex node to the graph.
    pub fn add_real_node(&mut self, id: VertexId, width: f64, height: f64) -> NodeIx {
        let ix = self
            .graph
            .add_node(HierarchyNode::Real { id, width, height });
        // Extend positions vec to match (default to 0,0)
        let idx = ix.index();
        while self.positions.len() <= idx {
            self.positions.push((0.0, 0.0));
        }
        ix
    }

    /// Add a dummy node to the graph.
    pub fn add_dummy_node(&mut self) -> NodeIx {
        let ix = self.graph.add_node(HierarchyNode::Dummy);
        let idx = ix.index();
        while self.positions.len() <= idx {
            self.positions.push((0.0, 0.0));
        }
        ix
    }

    /// Add an edge between two nodes.
    ///
    /// Returns the index of the new edge.
    pub fn add_edge(
        &mut self,
        source: NodeIx,
        target: NodeIx,
        edge_id: EdgeId,
        reversed: bool,
    ) -> EdgeIndex {
        self.graph.add_edge(
            source,
            target,
            HierarchyEdgeData {
                id: edge_id,
                reversed,
            },
        )
    }

    /// Borrow a node by index.
    pub fn node(&self, ix: NodeIx) -> &HierarchyNode {
        &self.graph[ix]
    }

    /// Mutably borrow a node by index.
    pub fn node_mut(&mut self, ix: NodeIx) -> &mut HierarchyNode {
        &mut self.graph[ix]
    }

    /// Borrow edge data by edge index.
    pub fn edge_data(&self, ix: EdgeIndex) -> &HierarchyEdgeData {
        &self.graph[ix]
    }

    /// Mutably borrow edge data by edge index.
    pub fn edge_data_mut(&mut self, ix: EdgeIndex) -> &mut HierarchyEdgeData {
        &mut self.graph[ix]
    }

    /// Number of nodes in the graph.
    pub fn node_count(&self) -> usize {
        self.graph.node_count()
    }

    /// Number of edges in the graph.
    pub fn edge_count(&self) -> usize {
        self.graph.edge_count()
    }

    /// Iterate over all node indices.
    pub fn node_indices(&self) -> impl Iterator<Item = NodeIx> {
        self.graph.node_indices()
    }

    /// Iterate over all edge indices.
    pub fn edge_indices(&self) -> impl Iterator<Item = EdgeIndex> {
        self.graph.edge_indices()
    }

    /// Iterate over all edge indices stored in the graph (alias for consistency).
    pub fn edge_indices_stored(&self) -> impl Iterator<Item = EdgeIndex> {
        self.graph.edge_indices()
    }

    /// Return outgoing neighbors of a node.
    pub fn neighbors(&self, ix: NodeIx) -> impl Iterator<Item = NodeIx> {
        self.graph.neighbors(ix)
    }

    /// Return incoming neighbors (predecessors) of a node.
    pub fn neighbors_incoming(&self, ix: NodeIx) -> impl Iterator<Item = NodeIx> {
        self.graph
            .neighbors_directed(ix, petgraph::Direction::Incoming)
    }

    /// Return all neighbors (both incoming and outgoing) of a node.
    pub fn neighbors_all(&self, ix: NodeIx) -> impl Iterator<Item = NodeIx> {
        self.graph.neighbors_undirected(ix)
    }

    /// Returns `true` if the node is a real vertex.
    pub fn is_real(&self, ix: NodeIx) -> bool {
        self.graph[ix].is_real()
    }

    /// Returns `true` if the node is a dummy.
    pub fn is_dummy(&self, ix: NodeIx) -> bool {
        self.graph[ix].is_dummy()
    }

    /// If the node is real, returns its `VertexId`; otherwise `None`.
    pub fn real_node_id(&self, ix: NodeIx) -> Option<VertexId> {
        self.graph[ix].real_id()
    }

    /// If the node is real, returns its `(width, height)`; otherwise `None`.
    pub fn real_node_size(&self, ix: NodeIx) -> Option<(f64, f64)> {
        match self.graph[ix] {
            HierarchyNode::Real { width, height, .. } => Some((width, height)),
            HierarchyNode::Dummy => None,
        }
    }

    /// Set the computed position for a node.
    pub fn set_position(&mut self, ix: NodeIx, x: f64, y: f64) {
        let idx = ix.index();
        if idx >= self.positions.len() {
            self.positions.resize(idx + 1, (0.0, 0.0));
        }
        self.positions[idx] = (x, y);
    }

    /// Get the computed position for a node, if set.
    pub fn node_position(&self, ix: NodeIx) -> Option<(f64, f64)> {
        let idx = ix.index();
        if idx < self.positions.len() {
            Some(self.positions[idx])
        } else {
            None
        }
    }

    /// Find an edge between source and target nodes.
    pub fn find_edge(&self, source: NodeIx, target: NodeIx) -> Option<EdgeIndex> {
        self.graph.find_edge(source, target)
    }

    /// Remove an edge from the graph.
    pub fn remove_edge(&mut self, edge: EdgeIndex) -> Option<HierarchyEdgeData> {
        self.graph.remove_edge(edge)
    }

    /// Access the underlying graph (internal, for petgraph algorithms).
    pub(crate) fn graph(&self) -> &LayoutGraph {
        &self.graph
    }

    /// Set the node at the given rank and position within the rank.
    pub fn set_rank_node(&mut self, rank: usize, pos: usize, ix: NodeIx) {
        if rank >= self.ranks.len() {
            self.ranks.resize(rank + 1, Vec::new());
        }
        if pos >= self.ranks[rank].len() {
            self.ranks[rank].resize(pos + 1, ix);
        } else {
            self.ranks[rank][pos] = ix;
        }
    }

    /// Get the number of ranks (layers).
    pub fn rank_count(&self) -> usize {
        self.ranks.len()
    }

    /// Get the nodes in a specific rank.
    pub fn rank_nodes(&self, rank: usize) -> &[NodeIx] {
        if rank < self.ranks.len() {
            &self.ranks[rank]
        } else {
            &[]
        }
    }

    /// Get the rank (layer) of a node, if assigned.
    pub fn node_rank(&self, ix: NodeIx) -> Option<usize> {
        for (r, nodes) in self.ranks.iter().enumerate() {
            if nodes.contains(&ix) {
                return Some(r);
            }
        }
        None
    }

    /// Remove all nodes from the model (reset).
    pub fn clear(&mut self) {
        self.graph.clear();
        self.ranks.clear();
        self.positions.clear();
    }

    /// Remove a node from the graph (by index).
    pub fn remove_node(&mut self, ix: NodeIx) -> Option<HierarchyNode> {
        // Remove the node from ranks if it appears there
        for rank_nodes in self.ranks.iter_mut() {
            rank_nodes.retain(|n| *n != ix);
        }
        self.graph.remove_node(ix)
    }
}

impl std::ops::Index<NodeIx> for HierarchyModel {
    type Output = HierarchyNode;
    fn index(&self, ix: NodeIx) -> &Self::Output {
        &self.graph[ix]
    }
}

impl std::ops::IndexMut<NodeIx> for HierarchyModel {
    fn index_mut(&mut self, ix: NodeIx) -> &mut Self::Output {
        &mut self.graph[ix]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_real_node_returns_correct_id() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let vid = VertexId::default();
        let ix = model.add_real_node(vid, 120.0, 60.0);
        assert!(model.is_real(ix));
        assert!(!model.is_dummy(ix));
        assert_eq!(model.real_node_id(ix), Some(vid));
        assert_eq!(model.real_node_size(ix), Some((120.0, 60.0)));
    }

    #[test]
    fn add_dummy_node_is_dummy() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let ix = model.add_dummy_node();
        assert!(model.is_dummy(ix));
        assert!(!model.is_real(ix));
        assert_eq!(model.real_node_id(ix), None);
    }

    #[test]
    fn add_edge_stores_data() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let va = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let vb = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let eid = EdgeId::default();
        let edge_ix = model.add_edge(va, vb, eid, false);
        let data = model.edge_data(edge_ix);
        assert_eq!(data.id, eid);
        assert!(!data.reversed);
    }

    #[test]
    fn node_and_edge_counts() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        assert_eq!(model.node_count(), 0);
        assert_eq!(model.edge_count(), 0);

        let va = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let vb = model.add_real_node(VertexId::default(), 100.0, 50.0);
        model.add_edge(va, vb, EdgeId::default(), false);

        assert_eq!(model.node_count(), 2);
        assert_eq!(model.edge_count(), 1);
    }

    #[test]
    fn node_indices_iterates_all() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let a = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let indices: Vec<_> = model.node_indices().collect();
        assert_eq!(indices.len(), 2);
        assert!(indices.contains(&a));
        assert!(indices.contains(&b));
    }

    #[test]
    fn neighbors_only_outgoing() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let a = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b = model.add_real_node(VertexId::default(), 100.0, 50.0);
        model.add_edge(a, b, EdgeId::default(), false);

        let out: Vec<_> = model.neighbors(a).collect();
        assert_eq!(out, vec![b]);

        // Graph is directed: A→B does NOT create B→A
        let out_b: Vec<_> = model.neighbors(b).collect();
        assert!(out_b.is_empty());
    }

    #[test]
    fn set_and_get_position() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let ix = model.add_real_node(VertexId::default(), 100.0, 50.0);
        model.set_position(ix, 42.0, 99.0);
        assert_eq!(model.node_position(ix), Some((42.0, 99.0)));
    }

    #[test]
    fn find_edge_works() {
        let mut model = HierarchyModel::new(Direction::TopToBottom);
        let a = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let b = model.add_real_node(VertexId::default(), 100.0, 50.0);
        let e = model.add_edge(a, b, EdgeId::default(), false);
        assert_eq!(model.find_edge(a, b), Some(e));
        assert_eq!(model.find_edge(b, a), None);
    }
}
