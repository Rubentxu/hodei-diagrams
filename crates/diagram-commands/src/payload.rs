//! Payload structs for each command variant.
//!
//! Each payload carries forward execution data plus inverse data slots
//! (initially None or false) that `apply` populates and `undo` consumes.

use diagram_core::{
    CellGeometry, DiagramModel, Edge, EdgeId, Group, GroupId, Label, Page, PageId, Point, StyleId,
    StyleMap, Vertex, VertexId,
};
use diagram_routing::{resolve_anchor, Direction, EdgeStyle, RoutingRequest, route};

/// Routing algorithm kind — exposed at the command layer for serialization.
/// Maps to `diagram_routing::EdgeStyle`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum RoutingKind {
    /// Right-angle (orthogonal) routing.
    #[default]
    Orthogonal,
    /// Straight line routing (passthrough).
    Straight,
}

impl From<RoutingKind> for EdgeStyle {
    fn from(kind: RoutingKind) -> Self {
        match kind {
            RoutingKind::Orthogonal => EdgeStyle::Orthogonal,
            RoutingKind::Straight => EdgeStyle::Segment,
        }
    }
}
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::error::{CommandError, CommandResult};

/// Target for z-order operations: a cell reference that can be a vertex, edge, or group.
/// See ADR-0058 §Decision (CellTarget enum).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum CellTarget {
    /// Target a vertex by its ID.
    Vertex(VertexId),
    /// Target an edge by its ID.
    Edge(EdgeId),
    /// Target a group by its ID.
    Group(GroupId),
}

impl CellTarget {
    /// Returns the page ID of the targeted cell, or None if not found.
    fn page_id(&self, store: &diagram_core::ModelStore) -> Option<PageId> {
        match self {
            CellTarget::Vertex(vid) => store.vertex(*vid).and_then(|v| v.page_id),
            CellTarget::Edge(eid) => store.edge(*eid).and_then(|e| e.page_id),
            CellTarget::Group(gid) => store.group(*gid).and_then(|g| g.page_id),
        }
    }

    /// Returns the current z_order of the targeted cell, or None if not found.
    fn current_z_order(&self, store: &diagram_core::ModelStore) -> Option<i32> {
        match self {
            CellTarget::Vertex(vid) => store.vertex(*vid).map(|v| v.z_order),
            CellTarget::Edge(eid) => store.edge(*eid).map(|e| e.z_order),
            CellTarget::Group(gid) => store.group(*gid).map(|g| g.z_order),
        }
    }

    /// Sets the z_order of the targeted cell. Returns error if cell not found.
    fn set_z_order(&self, store: &mut diagram_core::ModelStore, z: i32) -> CommandResult<()> {
        match self {
            CellTarget::Vertex(vid) => {
                let v = store
                    .vertex_mut(*vid)
                    .ok_or(CommandError::VertexNotFound(*vid))?;
                v.z_order = z;
            }
            CellTarget::Edge(eid) => {
                let e = store
                    .edge_mut(*eid)
                    .ok_or(CommandError::EdgeNotFound(*eid))?;
                e.z_order = z;
            }
            CellTarget::Group(gid) => {
                let g = store
                    .group_mut(*gid)
                    .ok_or(CommandError::GroupNotFound(*gid))?;
                g.z_order = z;
            }
        }
        Ok(())
    }
}

/// Payload for bringing a cell to the front (topmost z-order).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BringToFrontPayload {
    /// The target cell to bring to front.
    pub target: CellTarget,
    /// The previous z_order value before the operation. Populated by `apply`.
    #[serde(skip)]
    pub prev_z_order: Option<i32>,
    /// Whether this command was applied (and how).
    #[serde(skip)]
    applied: bool,
}

impl BringToFrontPayload {
    /// Create a new payload for bringing a cell to front.
    pub fn new(target: CellTarget) -> Self {
        Self {
            target,
            prev_z_order: None,
            applied: false,
        }
    }

    /// Apply: set the target's z_order to max(page) + 1.
    /// If the target is already the topmost (z_order == max), this is a no-op.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let page_id = self.target.page_id(&model.store).ok_or(match self.target {
            CellTarget::Vertex(vid) => CommandError::VertexNotFound(vid),
            CellTarget::Edge(eid) => CommandError::EdgeNotFound(eid),
            CellTarget::Group(gid) => CommandError::GroupNotFound(gid),
        })?;

        // Capture previous z_order
        let current_z = self
            .target
            .current_z_order(&model.store)
            .ok_or(match self.target {
                CellTarget::Vertex(vid) => CommandError::VertexNotFound(vid),
                CellTarget::Edge(eid) => CommandError::EdgeNotFound(eid),
                CellTarget::Group(gid) => CommandError::GroupNotFound(gid),
            })?;
        self.prev_z_order = Some(current_z);

        // No-op if target is already the topmost (max z_order)
        let max_z = model.store.max_z_order(page_id);
        if current_z == max_z {
            self.applied = true; // Mark as applied but no change
            return Ok(());
        }

        // Calculate new z_order = max + 1
        let new_z = max_z + 1;

        self.target.set_z_order(&mut model.store, new_z)?;
        self.applied = true;
        Ok(())
    }

    /// Undo: restore the previous z_order.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev = self.prev_z_order.ok_or(CommandError::NotApplied)?;
        self.target.set_z_order(&mut model.store, prev)?;
        self.applied = false;
        Ok(())
    }
}

/// Payload for sending a cell to the back (bottommost z-order).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendToBackPayload {
    /// The target cell to send to back.
    pub target: CellTarget,
    /// The previous z_order value before the operation. Populated by `apply`.
    #[serde(skip)]
    pub prev_z_order: Option<i32>,
    /// Whether this command was applied.
    #[serde(skip)]
    applied: bool,
}

impl SendToBackPayload {
    /// Create a new payload for sending a cell to back.
    pub fn new(target: CellTarget) -> Self {
        Self {
            target,
            prev_z_order: None,
            applied: false,
        }
    }

    /// Apply: set the target's z_order to min(page) - 1.
    /// If the target is already the bottommost (z_order == min), this is a no-op.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let page_id = self.target.page_id(&model.store).ok_or(match self.target {
            CellTarget::Vertex(vid) => CommandError::VertexNotFound(vid),
            CellTarget::Edge(eid) => CommandError::EdgeNotFound(eid),
            CellTarget::Group(gid) => CommandError::GroupNotFound(gid),
        })?;

        let current_z = self
            .target
            .current_z_order(&model.store)
            .ok_or(match self.target {
                CellTarget::Vertex(vid) => CommandError::VertexNotFound(vid),
                CellTarget::Edge(eid) => CommandError::EdgeNotFound(eid),
                CellTarget::Group(gid) => CommandError::GroupNotFound(gid),
            })?;
        self.prev_z_order = Some(current_z);

        // No-op if target is already the bottommost (min z_order)
        let min_z = model.store.min_z_order(page_id);
        if current_z == min_z {
            self.applied = true; // Mark as applied but no change
            return Ok(());
        }

        let new_z = min_z - 1;
        self.target.set_z_order(&mut model.store, new_z)?;
        self.applied = true;
        Ok(())
    }

    /// Undo: restore the previous z_order.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev = self.prev_z_order.ok_or(CommandError::NotApplied)?;
        self.target.set_z_order(&mut model.store, prev)?;
        self.applied = false;
        Ok(())
    }
}

/// Payload for bringing a cell forward (swap with next higher).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BringForwardPayload {
    /// The target cell to bring forward.
    pub target: CellTarget,
    /// The swap pair captured for undo: (other_cell, my_prev_z, other_prev_z).
    #[serde(skip)]
    pub swap: Option<(CellTarget, i32, i32)>,
    /// Whether this command was applied.
    #[serde(skip)]
    applied: bool,
}

impl BringForwardPayload {
    /// Create a new payload for bringing a cell forward.
    pub fn new(target: CellTarget) -> Self {
        Self {
            target,
            swap: None,
            applied: false,
        }
    }

    /// Apply: swap z_order with the next higher cell in (z_order ASC, id ASC) order.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let page_id = self.target.page_id(&model.store).ok_or(match self.target {
            CellTarget::Vertex(vid) => CommandError::VertexNotFound(vid),
            CellTarget::Edge(eid) => CommandError::EdgeNotFound(eid),
            CellTarget::Group(gid) => CommandError::GroupNotFound(gid),
        })?;

        let my_prev_z = self
            .target
            .current_z_order(&model.store)
            .ok_or(match self.target {
                CellTarget::Vertex(vid) => CommandError::VertexNotFound(vid),
                CellTarget::Edge(eid) => CommandError::EdgeNotFound(eid),
                CellTarget::Group(gid) => CommandError::GroupNotFound(gid),
            })?;

        // Collect all cells on this page with their z_order
        let mut cells: Vec<(CellTarget, i32)> = Vec::new();

        for (vid, v) in model.store.vertices_with_ids() {
            if v.page_id == Some(page_id) {
                cells.push((CellTarget::Vertex(vid), v.z_order));
            }
        }
        for (eid, e) in model.store.edges_with_ids() {
            if e.page_id == Some(page_id) {
                cells.push((CellTarget::Edge(eid), e.z_order));
            }
        }
        for (gid, g) in model.store.groups_with_ids() {
            if g.page_id == Some(page_id) {
                cells.push((CellTarget::Group(gid), g.z_order));
            }
        }

        // Sort by (z_order ASC, id ASC)
        // For id tie-break, we use the variant index (Vertex=0, Edge=1, Group=2)
        // plus the ID's built-in Ord for stable per-kind ordering.
        fn cell_idx(t: &CellTarget) -> u8 {
            match t {
                CellTarget::Vertex(_) => 0,
                CellTarget::Edge(_) => 1,
                CellTarget::Group(_) => 2,
            }
        }

        cells.sort_by(|(t1, z1), (t2, z2)| {
            z1.cmp(z2).then_with(|| {
                let idx1 = cell_idx(t1);
                let idx2 = cell_idx(t2);
                idx1.cmp(&idx2).then_with(|| {
                    // Compare IDs within same variant
                    match (t1, t2) {
                        (CellTarget::Vertex(v1), CellTarget::Vertex(v2)) => v1.cmp(v2),
                        (CellTarget::Edge(e1), CellTarget::Edge(e2)) => e1.cmp(e2),
                        (CellTarget::Group(g1), CellTarget::Group(g2)) => g1.cmp(g2),
                        _ => unreachable!("same variant by idx check above"),
                    }
                })
            })
        });

        // Find the target's position
        let target_idx = cells
            .iter()
            .position(|(t, _)| *t == self.target)
            .expect("target must be in cells list");

        // If target is already at the end (topmost), nothing to do
        if target_idx == cells.len() - 1 {
            self.applied = true; // Mark as applied but no-op
            return Ok(());
        }

        // Get the next cell (successor)
        let (other, other_z) = cells[target_idx + 1];

        // Swap z_orders
        self.swap = Some((other, my_prev_z, other_z));
        self.target.set_z_order(&mut model.store, other_z)?;
        other.set_z_order(&mut model.store, my_prev_z)?;
        self.applied = true;
        Ok(())
    }

    /// Undo: swap back.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let (other, my_z, other_z) = self.swap.ok_or(CommandError::NotApplied)?;
        self.target.set_z_order(&mut model.store, my_z)?;
        other.set_z_order(&mut model.store, other_z)?;
        self.applied = false;
        Ok(())
    }
}

/// Payload for sending a cell backward (swap with next lower).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendBackwardPayload {
    /// The target cell to send backward.
    pub target: CellTarget,
    /// The swap pair captured for undo: (other_cell, my_prev_z, other_prev_z).
    #[serde(skip)]
    pub swap: Option<(CellTarget, i32, i32)>,
    /// Whether this command was applied.
    #[serde(skip)]
    applied: bool,
}

impl SendBackwardPayload {
    /// Create a new payload for sending a cell backward.
    pub fn new(target: CellTarget) -> Self {
        Self {
            target,
            swap: None,
            applied: false,
        }
    }

    /// Apply: swap z_order with the next lower cell in (z_order ASC, id ASC) order.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let page_id = self.target.page_id(&model.store).ok_or(match self.target {
            CellTarget::Vertex(vid) => CommandError::VertexNotFound(vid),
            CellTarget::Edge(eid) => CommandError::EdgeNotFound(eid),
            CellTarget::Group(gid) => CommandError::GroupNotFound(gid),
        })?;

        let my_prev_z = self
            .target
            .current_z_order(&model.store)
            .ok_or(match self.target {
                CellTarget::Vertex(vid) => CommandError::VertexNotFound(vid),
                CellTarget::Edge(eid) => CommandError::EdgeNotFound(eid),
                CellTarget::Group(gid) => CommandError::GroupNotFound(gid),
            })?;

        // Collect all cells on this page with their z_order
        let mut cells: Vec<(CellTarget, i32)> = Vec::new();

        for (vid, v) in model.store.vertices_with_ids() {
            if v.page_id == Some(page_id) {
                cells.push((CellTarget::Vertex(vid), v.z_order));
            }
        }
        for (eid, e) in model.store.edges_with_ids() {
            if e.page_id == Some(page_id) {
                cells.push((CellTarget::Edge(eid), e.z_order));
            }
        }
        for (gid, g) in model.store.groups_with_ids() {
            if g.page_id == Some(page_id) {
                cells.push((CellTarget::Group(gid), g.z_order));
            }
        }

        // Sort by (z_order ASC, id ASC)
        fn cell_idx(t: &CellTarget) -> u8 {
            match t {
                CellTarget::Vertex(_) => 0,
                CellTarget::Edge(_) => 1,
                CellTarget::Group(_) => 2,
            }
        }

        cells.sort_by(|(t1, z1), (t2, z2)| {
            z1.cmp(z2).then_with(|| {
                let idx1 = cell_idx(t1);
                let idx2 = cell_idx(t2);
                idx1.cmp(&idx2).then_with(|| match (t1, t2) {
                    (CellTarget::Vertex(v1), CellTarget::Vertex(v2)) => v1.cmp(v2),
                    (CellTarget::Edge(e1), CellTarget::Edge(e2)) => e1.cmp(e2),
                    (CellTarget::Group(g1), CellTarget::Group(g2)) => g1.cmp(g2),
                    _ => unreachable!("same variant by idx check above"),
                })
            })
        });

        // Find the target's position
        let target_idx = cells
            .iter()
            .position(|(t, _)| *t == self.target)
            .expect("target must be in cells list");

        // If target is already at the beginning (bottommost), nothing to do
        if target_idx == 0 {
            self.applied = true; // Mark as applied but no-op
            return Ok(());
        }

        // Get the previous cell (predecessor)
        let (other, other_z) = cells[target_idx - 1];

        // Swap z_orders
        self.swap = Some((other, my_prev_z, other_z));
        self.target.set_z_order(&mut model.store, other_z)?;
        other.set_z_order(&mut model.store, my_prev_z)?;
        self.applied = true;
        Ok(())
    }

    /// Undo: swap back.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let (other, my_z, other_z) = self.swap.ok_or(CommandError::NotApplied)?;
        self.target.set_z_order(&mut model.store, my_z)?;
        other.set_z_order(&mut model.store, other_z)?;
        self.applied = false;
        Ok(())
    }
}

/// Captured state for undo of a group removal.
type OrphanedChildren = Vec<(VertexId, Option<GroupId>)>;

/// Captured state for undo of a page removal (page + all its cells).
#[allow(clippy::type_complexity)]
type RemovedPage = (
    Page,
    Vec<(VertexId, Vertex)>,
    Vec<(EdgeId, Edge)>,
    Vec<(GroupId, Group)>,
);

/// Payload for adding a vertex.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddVertexPayload {
    /// The vertex to insert.
    pub vertex: Vertex,
    /// Optional inline style map. When provided, the style is inserted into the store
    /// and assigned to the vertex before insertion.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<StyleMap>,
    /// The ID assigned by the store during `apply`. Used by `undo`.
    #[serde(skip)]
    pub inserted_id: Option<VertexId>,
    /// The style ID created for inline style. Used by `undo` for cleanup.
    #[serde(skip)]
    pub inserted_style_id: Option<StyleId>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl AddVertexPayload {
    /// Create a new payload for adding a vertex.
    pub fn new(vertex: Vertex) -> Self {
        Self {
            vertex,
            style: None,
            inserted_id: None,
            inserted_style_id: None,
            applied: false,
        }
    }

    /// Apply the add-vertex operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let mut v = self.vertex.clone();
        // If inline style was provided, insert it and assign to vertex
        if let Some(ref style_map) = self.style {
            let sid = model.store.insert_style(style_map.clone());
            v.style_id = Some(sid);
            self.inserted_style_id = Some(sid);
        }
        // Assign z_order = max(page) + 1 (ADR-0058 §Z-order semantics)
        let page_id = v.page_id.unwrap_or_default();
        v.z_order = model.store.max_z_order(page_id) + 1;
        let id = model.store.insert_vertex(v);
        self.inserted_id = Some(id);
        self.applied = true;
        Ok(())
    }

    /// Undo the add-vertex operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let id = self.inserted_id.take().ok_or(CommandError::NotApplied)?;
        model.store.remove_vertex(id);
        // Clean up the inline style if we created one
        if let Some(sid) = self.inserted_style_id.take() {
            model.store.remove_style(sid);
        }
        self.applied = false;
        Ok(())
    }
}

/// Payload for removing a vertex.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoveVertexPayload {
    /// The ID of the vertex to remove.
    pub id: VertexId,
    /// The removed vertex and any edges that referenced it. Populated by `apply`.
    #[serde(skip)]
    pub removed: Option<(Vertex, Vec<(EdgeId, Edge)>)>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl RemoveVertexPayload {
    /// Create a new payload for removing a vertex.
    pub fn new(id: VertexId) -> Self {
        Self {
            id,
            removed: None,
            applied: false,
        }
    }

    /// Apply the remove-vertex operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        // Get the vertex or error
        let vertex = model
            .store
            .vertex(self.id)
            .cloned()
            .ok_or(CommandError::VertexNotFound(self.id))?;

        // Collect edges that reference this vertex
        let orphaned_edges: Vec<(EdgeId, Edge)> = model
            .store
            .edges_with_ids()
            .filter(|(_, edge)| edge.source == self.id || edge.target == self.id)
            .map(|(eid, edge)| (eid, edge.clone()))
            .collect();

        // Remove orphaned edges first
        for (eid, _) in &orphaned_edges {
            model.store.remove_edge(*eid);
        }

        // Remove the vertex
        let removed = model.store.remove_vertex(self.id);
        debug_assert!(removed.is_some());
        self.removed = Some((vertex, orphaned_edges));
        self.applied = true;
        Ok(())
    }

    /// Undo the remove-vertex operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let (vertex, orphaned_edges) = self.removed.take().ok_or(CommandError::NotApplied)?;

        // Re-insert the vertex (gets NEW VertexId)
        let new_vid = model.store.insert_vertex(vertex);

        // Re-insert each orphaned edge with source/target rewritten to new_vid
        for (_old_eid, mut edge) in orphaned_edges {
            // Rewrite references to the new vertex ID
            if edge.source == self.id {
                edge.source = new_vid;
            }
            if edge.target == self.id {
                edge.target = new_vid;
            }
            model.store.insert_edge(edge);
        }

        self.applied = false;
        Ok(())
    }
}

/// Payload for moving a vertex.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoveVertexPayload {
    /// The ID of the vertex to move.
    pub id: VertexId,
    /// The new geometry.
    pub geometry: CellGeometry,
    /// The previous geometry. Populated by `apply`.
    #[serde(skip)]
    pub prev_geometry: Option<CellGeometry>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl MoveVertexPayload {
    /// Create a new payload for moving a vertex.
    pub fn new(id: VertexId, geometry: CellGeometry) -> Self {
        Self {
            id,
            geometry,
            prev_geometry: None,
            applied: false,
        }
    }

    /// Apply the move-vertex operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let vertex = model
            .store
            .vertex_mut(self.id)
            .ok_or(CommandError::VertexNotFound(self.id))?;

        // Capture old geometry
        self.prev_geometry = vertex.geometry;

        // Apply new geometry
        vertex.geometry = Some(self.geometry);
        self.applied = true;

        Ok(())
    }

    /// Undo the move-vertex operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev = self.prev_geometry.take();
        let vertex = model
            .store
            .vertex_mut(self.id)
            .ok_or(CommandError::VertexNotFound(self.id))?;
        vertex.geometry = prev;
        self.applied = false;
        Ok(())
    }
}

/// Payload for editing a vertex's label.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditLabelPayload {
    /// The ID of the vertex whose label to edit.
    pub id: VertexId,
    /// The new label.
    pub label: Option<Label>,
    /// The previous label. Populated by `apply`.
    #[serde(skip)]
    pub prev_label: Option<Label>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl EditLabelPayload {
    /// Create a new payload for editing a vertex label.
    pub fn new(id: VertexId, label: Option<Label>) -> Self {
        Self {
            id,
            label,
            prev_label: None,
            applied: false,
        }
    }

    /// Apply the edit-label operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let vertex = model
            .store
            .vertex_mut(self.id)
            .ok_or(CommandError::VertexNotFound(self.id))?;

        // Capture previous label
        self.prev_label = vertex.label.clone();

        // Apply new label
        vertex.label = self.label.clone();
        self.applied = true;

        Ok(())
    }

    /// Undo the edit-label operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev = self.prev_label.take().ok_or(CommandError::NotApplied)?;
        let vertex = model
            .store
            .vertex_mut(self.id)
            .ok_or(CommandError::VertexNotFound(self.id))?;
        vertex.label = Some(prev);
        self.applied = false;
        Ok(())
    }
}

/// Payload for editing an edge label.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditEdgeLabelPayload {
    /// The ID of the edge whose label to edit.
    pub id: EdgeId,
    /// The new label.
    pub label: Option<Label>,
    /// The previous label. Populated by `apply`.
    #[serde(skip)]
    pub prev_label: Option<Label>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl EditEdgeLabelPayload {
    /// Create a new payload for editing an edge label.
    pub fn new(id: EdgeId, label: Option<Label>) -> Self {
        Self {
            id,
            label,
            prev_label: None,
            applied: false,
        }
    }

    /// Apply the edit-edge-label operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let edge = model
            .store
            .edge_mut(self.id)
            .ok_or(CommandError::EdgeNotFound(self.id))?;

        // Capture previous label
        self.prev_label = edge.label.clone();

        // Apply new label
        edge.label = self.label.clone();
        self.applied = true;

        Ok(())
    }

    /// Undo the edit-edge-label operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev = self.prev_label.take().ok_or(CommandError::NotApplied)?;
        let edge = model
            .store
            .edge_mut(self.id)
            .ok_or(CommandError::EdgeNotFound(self.id))?;
        edge.label = Some(prev);
        self.applied = false;
        Ok(())
    }
}

/// Payload for adding an edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddEdgePayload {
    /// The edge to insert.
    pub edge: Edge,
    /// The ID assigned by the store during `apply`. Used by `undo`.
    #[serde(skip)]
    pub inserted_id: Option<EdgeId>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl AddEdgePayload {
    /// Create a new payload for adding an edge.
    pub fn new(edge: Edge) -> Self {
        Self {
            edge,
            inserted_id: None,
            applied: false,
        }
    }

    /// Apply the add-edge operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        // Validate source and target exist
        if model.store.vertex(self.edge.source).is_none() {
            return Err(CommandError::DanglingEdge(
                self.edge.source,
                self.edge.target,
            ));
        }
        if model.store.vertex(self.edge.target).is_none() {
            return Err(CommandError::DanglingEdge(
                self.edge.source,
                self.edge.target,
            ));
        }

        // Assign z_order = max(page) + 1 (ADR-0058 §Z-order semantics)
        let page_id = self.edge.page_id.unwrap_or_default();
        let mut e = self.edge.clone();
        e.z_order = model.store.max_z_order(page_id) + 1;

        let id = model.store.insert_edge(e);
        self.inserted_id = Some(id);
        self.applied = true;
        Ok(())
    }

    /// Undo the add-edge operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let id = self.inserted_id.take().ok_or(CommandError::NotApplied)?;
        model.store.remove_edge(id);
        self.applied = false;
        Ok(())
    }
}

/// Payload for removing an edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoveEdgePayload {
    /// The ID of the edge to remove.
    pub id: EdgeId,
    /// The removed edge. Populated by `apply`.
    #[serde(skip)]
    pub removed: Option<Edge>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl RemoveEdgePayload {
    /// Create a new payload for removing an edge.
    pub fn new(id: EdgeId) -> Self {
        Self {
            id,
            removed: None,
            applied: false,
        }
    }

    /// Apply the remove-edge operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let removed = model
            .store
            .remove_edge(self.id)
            .ok_or(CommandError::EdgeNotFound(self.id))?;
        self.removed = Some(removed);
        self.applied = true;
        Ok(())
    }

    /// Undo the remove-edge operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let edge = self.removed.take().ok_or(CommandError::NotApplied)?;
        model.store.insert_edge(edge);
        self.applied = false;
        Ok(())
    }
}

/// Payload for changing a vertex's style (v1: vertex-scoped only).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeStylePayload {
    /// The ID of the vertex whose style to change.
    pub id: VertexId,
    /// The new style map.
    pub style: StyleMap,
    /// The previous style ID. Populated by `apply`.
    #[serde(skip)]
    pub prev_style_id: Option<StyleId>,
    /// The style ID assigned during apply (for cleanup on undo).
    #[serde(skip)]
    pub inserted_style_id: Option<StyleId>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl ChangeStylePayload {
    /// Create a new payload for changing a vertex style.
    pub fn new(id: VertexId, style: StyleMap) -> Self {
        Self {
            id,
            style,
            prev_style_id: None,
            inserted_style_id: None,
            applied: false,
        }
    }

    /// Apply the change-style operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        // Insert the new style first
        let new_style_id = model.store.insert_style(self.style.clone());
        self.inserted_style_id = Some(new_style_id);

        // Get the vertex
        let vertex = model
            .store
            .vertex_mut(self.id)
            .ok_or(CommandError::VertexNotFound(self.id))?;

        // Capture previous style
        self.prev_style_id = vertex.style_id;

        // Apply new style
        vertex.style_id = Some(new_style_id);
        self.applied = true;

        Ok(())
    }

    /// Undo the change-style operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let vertex = model
            .store
            .vertex_mut(self.id)
            .ok_or(CommandError::VertexNotFound(self.id))?;

        // Restore previous style
        vertex.style_id = self.prev_style_id;
        self.prev_style_id = None;

        // Clean up the inserted style
        if let Some(sid) = self.inserted_style_id.take() {
            model.store.remove_style(sid);
        }
        self.applied = false;
        Ok(())
    }
}

/// Payload for adding a group.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddGroupPayload {
    /// The group to insert.
    pub group: Group,
    /// The ID assigned by the store during `apply`. Used by `undo`.
    #[serde(skip)]
    pub inserted_id: Option<GroupId>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl AddGroupPayload {
    /// Create a new payload for adding a group.
    pub fn new(group: Group) -> Self {
        Self {
            group,
            inserted_id: None,
            applied: false,
        }
    }

    /// Apply the add-group operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        // Assign z_order = max(page) + 1 (ADR-0058 §Z-order semantics)
        let page_id = self.group.page_id.unwrap_or_default();
        let mut g = self.group.clone();
        g.z_order = model.store.max_z_order(page_id) + 1;
        let id = model.store.insert_group(g);
        self.inserted_id = Some(id);
        self.applied = true;
        Ok(())
    }

    /// Undo the add-group operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let id = self.inserted_id.take().ok_or(CommandError::NotApplied)?;
        model.store.remove_group(id);
        self.applied = false;
        Ok(())
    }
}

/// Payload for removing a group.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoveGroupPayload {
    /// The ID of the group to remove.
    pub id: GroupId,
    /// The removed group and its former children's previous parent assignments.
    /// Populated by `apply`.
    #[serde(skip)]
    pub removed: Option<(Group, OrphanedChildren)>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl RemoveGroupPayload {
    /// Create a new payload for removing a group.
    pub fn new(id: GroupId) -> Self {
        Self {
            id,
            removed: None,
            applied: false,
        }
    }

    /// Apply the remove-group operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        // Get the group or error
        let group = model
            .store
            .group(self.id)
            .cloned()
            .ok_or(CommandError::GroupNotFound(self.id))?;

        // Find vertices with this group as parent and orphan them
        let orphaned_children: Vec<(VertexId, Option<GroupId>)> = model
            .store
            .vertices_with_ids()
            .filter(|(_, v)| v.parent == Some(self.id))
            .map(|(vid, v)| (vid, v.parent))
            .collect();

        // Update children in place
        for (vid, _) in &orphaned_children {
            if let Some(v) = model.store.vertex_mut(*vid) {
                v.parent = None;
            }
        }

        // Remove the group
        let removed = model.store.remove_group(self.id);
        debug_assert!(removed.is_some());

        self.removed = Some((group, orphaned_children));
        self.applied = true;
        Ok(())
    }

    /// Undo the remove-group operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let (group, orphaned_children) = self.removed.take().ok_or(CommandError::NotApplied)?;

        // Re-insert the group (gets NEW GroupId)
        let new_gid = model.store.insert_group(group);

        // Restore children's parent to the new group ID
        for (vid, prev_parent) in orphaned_children {
            if prev_parent == Some(self.id) {
                if let Some(v) = model.store.vertex_mut(vid) {
                    v.parent = Some(new_gid);
                }
            }
        }

        self.applied = false;
        Ok(())
    }
}

/// Payload for adding a page.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddPagePayload {
    /// The page to insert.
    pub page: Page,
    /// The ID assigned by the store during `apply`. Used by `undo`.
    #[serde(skip)]
    pub inserted_id: Option<PageId>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl AddPagePayload {
    /// Create a new payload for adding a page.
    pub fn new(page: Page) -> Self {
        Self {
            page,
            inserted_id: None,
            applied: false,
        }
    }

    /// Apply the add-page operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let id = model.store.insert_page(self.page.clone());
        self.inserted_id = Some(id);
        self.applied = true;
        Ok(())
    }

    /// Undo the add-page operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let id = self.inserted_id.take().ok_or(CommandError::NotApplied)?;
        model.store.remove_page(id);
        self.applied = false;
        Ok(())
    }
}

/// Payload for removing a page (cascade: removes all cells on that page).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemovePagePayload {
    /// The ID of the page to remove.
    pub id: PageId,
    /// The removed page and all its cells. Populated by `apply`.
    #[allow(clippy::type_complexity)]
    #[serde(skip)]
    pub removed: Option<RemovedPage>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl RemovePagePayload {
    /// Create a new payload for removing a page.
    pub fn new(id: PageId) -> Self {
        Self {
            id,
            removed: None,
            applied: false,
        }
    }

    /// Apply the remove-page operation (cascade).
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let removed = model
            .store
            .remove_page(self.id)
            .ok_or(CommandError::PageNotFound(self.id))?;
        self.removed = Some(removed);
        self.applied = true;
        Ok(())
    }

    /// Undo the remove-page operation with full reference fixup.
    ///
    /// Re-inserts the page, vertices, edges, and groups with NEW IDs and
    /// rewrites all references (`page_id`, `source`/`target`, `parent`) to
    /// point to the new IDs.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let (page, vertices, edges, groups) =
            self.removed.take().ok_or(CommandError::NotApplied)?;

        // Re-insert page (gets NEW PageId)
        let new_pid = model.store.insert_page(page);

        // Build ID maps for fixup
        let mut vid_map: HashMap<VertexId, VertexId> = HashMap::new();
        let mut gid_map: HashMap<GroupId, GroupId> = HashMap::new();

        // Re-insert vertices with rewritten page_id
        for (old_vid, mut vertex) in vertices {
            vertex.page_id = Some(new_pid);
            let new_vid = model.store.insert_vertex(vertex);
            vid_map.insert(old_vid, new_vid);
        }

        // Re-insert groups with rewritten page_id and build gid_map
        for (old_gid, mut group) in groups {
            group.page_id = Some(new_pid);
            let new_gid = model.store.insert_group(group);
            gid_map.insert(old_gid, new_gid);
        }

        // Re-insert edges with rewritten page_id, source, and target
        for (_old_eid, mut edge) in edges {
            edge.page_id = Some(new_pid);

            // Rewrite source/target via vid_map
            if let Some(&new_src) = vid_map.get(&edge.source) {
                edge.source = new_src;
            }
            if let Some(&new_tgt) = vid_map.get(&edge.target) {
                edge.target = new_tgt;
            }

            model.store.insert_edge(edge);
        }

        // Fix up vertex parents: vertices that had parent = Some(old_gid) -> Some(new_gid)
        // Collect vertices needing fixup first (can't borrow mutably while iterating immutably)
        let vertices_to_fix: Vec<(VertexId, GroupId)> = model
            .store
            .vertices_with_ids()
            .filter(|(_, v)| v.parent.is_some())
            .filter_map(|(vid, v)| {
                v.parent
                    .and_then(|old_gid| gid_map.get(&old_gid).map(|&new_gid| (vid, new_gid)))
            })
            .collect();

        for (vid, new_gid) in vertices_to_fix {
            if let Some(vertex_mut) = model.store.vertex_mut(vid) {
                vertex_mut.parent = Some(new_gid);
            }
        }

        self.applied = false;
        Ok(())
    }
}

/// Payload for renaming a page.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenamePagePayload {
    /// The ID of the page to rename.
    pub id: PageId,
    /// The new name.
    pub name: Label,
    /// The previous name. Populated by `apply`.
    #[serde(skip)]
    pub prev_name: Option<Label>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl RenamePagePayload {
    /// Create a new payload for renaming a page.
    pub fn new(id: PageId, name: Label) -> Self {
        Self {
            id,
            name,
            prev_name: None,
            applied: false,
        }
    }

    /// Apply the rename-page operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let page = model
            .store
            .page_mut(self.id)
            .ok_or(CommandError::PageNotFound(self.id))?;

        // Capture previous name
        self.prev_name = page.name.clone();

        // Apply new name
        page.name = Some(self.name.clone());
        self.applied = true;

        Ok(())
    }

    /// Undo the rename-page operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev = self.prev_name.take();
        let page = model
            .store
            .page_mut(self.id)
            .ok_or(CommandError::PageNotFound(self.id))?;
        page.name = prev;
        self.applied = false;
        Ok(())
    }
}

/// Payload for connecting two vertices with an edge (Phase 0 interactive edge creation).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectVerticesCommand {
    /// The source vertex.
    pub from: VertexId,
    /// The target vertex.
    pub to: VertexId,
    /// The routing algorithm to use.
    pub routing_kind: RoutingKind,
    /// Optional source port constraint (which side of source to exit from).
    pub source_port: Option<Direction>,
    /// Optional target port constraint (which side of target to enter from).
    pub target_port: Option<Direction>,
    /// The edge ID assigned during `apply`. Used by `undo`.
    #[serde(skip)]
    pub inserted_edge_id: Option<EdgeId>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl ConnectVerticesCommand {
    /// Create a new payload for connecting two vertices.
    pub fn new(from: VertexId, to: VertexId, routing_kind: RoutingKind) -> Self {
        Self {
            from,
            to,
            routing_kind,
            source_port: None,
            target_port: None,
            inserted_edge_id: None,
            applied: false,
        }
    }

    /// Create a new payload for connecting two vertices with port constraints.
    pub fn with_ports(
        from: VertexId,
        to: VertexId,
        routing_kind: RoutingKind,
        source_port: Option<Direction>,
        target_port: Option<Direction>,
    ) -> Self {
        Self {
            from,
            to,
            routing_kind,
            source_port,
            target_port,
            inserted_edge_id: None,
            applied: false,
        }
    }

    /// Apply the connect operation: insert edge, compute waypoints via routing.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        // Validate source and target exist
        if model.store.vertex(self.from).is_none() {
            return Err(CommandError::VertexNotFound(self.from));
        }
        if model.store.vertex(self.to).is_none() {
            return Err(CommandError::VertexNotFound(self.to));
        }

        // Build the edge
        let page_id = model
            .store
            .vertex(self.from)
            .and_then(|v| v.page_id)
            .or_else(|| model.store.vertex(self.to).and_then(|v| v.page_id));

        let edge = Edge {
            source: self.from,
            target: self.to,
            page_id,
            waypoints: Vec::new(),
            ..Default::default()
        };

        let inserted_id = model.store.insert_edge(edge);
        self.inserted_edge_id = Some(inserted_id);
        self.applied = true;

        // Route the new edge: compute waypoints
        let routed_id = self.inserted_edge_id.ok_or(CommandError::NotApplied)?;
        self.route_edge(routed_id, model)?;

        Ok(())
    }

    /// Route a specific edge and store its computed waypoints.
    fn route_edge(&self, edge_id: EdgeId, model: &mut DiagramModel) -> CommandResult<()> {
        // Get source/target IDs and style_id first (can't borrow store mutably and immutably at same time)
        let (src_id, tgt_id, style_id) = {
            let edge = model
                .store
                .edge(edge_id)
                .ok_or(CommandError::EdgeNotFound(edge_id))?;
            (edge.source, edge.target, edge.style_id)
        };

        let source = model
            .store
            .vertex(src_id)
            .ok_or(CommandError::VertexNotFound(src_id))?;
        let target = model
            .store
            .vertex(tgt_id)
            .ok_or(CommandError::VertexNotFound(tgt_id))?;

        // Resolve anchors from edge style (style wins over explicit port)
        let style_map = style_id.and_then(|sid| model.store.style(sid));
        let src_anchor = resolve_anchor(style_map, self.source_port, "exit");
        let tgt_anchor = resolve_anchor(style_map, self.target_port, "entry");

        let req = RoutingRequest {
            source,
            target,
            style: self.routing_kind.into(),
            ports: (src_anchor, tgt_anchor),
            waypoints: &[],
        };

        // Route the edge; if routing fails, the edge is still inserted (fallback: no waypoints)
        if let Ok(path) = route(&req) {
            let edge = model
                .store
                .edge_mut(edge_id)
                .ok_or(CommandError::EdgeNotFound(edge_id))?;
            edge.waypoints = path.0;
        }

        Ok(())
    }

    /// Undo the connect operation: remove the edge.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let id = self
            .inserted_edge_id
            .take()
            .ok_or(CommandError::NotApplied)?;
        model.store.remove_edge(id);
        self.applied = false;
        Ok(())
    }
}

/// Payload for disconnecting (removing) an edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisconnectEdgeCommand {
    /// The ID of the edge to disconnect.
    pub edge: EdgeId,
    /// The captured edge state for undo. Populated by `apply`.
    #[serde(skip)]
    pub captured_edge: Option<Edge>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl DisconnectEdgeCommand {
    /// Create a new payload for disconnecting an edge.
    pub fn new(edge: EdgeId) -> Self {
        Self {
            edge,
            captured_edge: None,
            applied: false,
        }
    }

    /// Apply the disconnect operation: capture and remove the edge.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let captured = model
            .store
            .remove_edge(self.edge)
            .ok_or(CommandError::EdgeNotFound(self.edge))?;
        self.captured_edge = Some(captured);
        self.applied = true;
        Ok(())
    }

    /// Undo the disconnect operation: re-insert the captured edge.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let edge = self.captured_edge.take().ok_or(CommandError::NotApplied)?;
        model.store.insert_edge(edge);
        self.applied = false;
        Ok(())
    }
}

/// Axis for flip operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FlipAxis {
    /// Horizontal flip (left-right mirror).
    Horizontal,
    /// Vertical flip (top-bottom mirror).
    Vertical,
}

/// Payload for rotating a vertex by a delta angle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RotateCommand {
    /// The ID of the vertex to rotate.
    pub id: VertexId,
    /// The angle delta in radians to add to the current rotation.
    pub angle_delta: f64,
    /// The previous rotation value. Populated by `apply`.
    #[serde(skip)]
    pub previous_rotation: Option<f64>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl RotateCommand {
    /// Create a new payload for rotating a vertex.
    pub fn new(id: VertexId, angle_delta: f64) -> Self {
        Self {
            id,
            angle_delta,
            previous_rotation: None,
            applied: false,
        }
    }

    /// Apply the rotate operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let vertex = model
            .store
            .vertex_mut(self.id)
            .ok_or(CommandError::VertexNotFound(self.id))?;

        // Capture previous rotation
        self.previous_rotation = vertex.geometry.map(|g| g.rotation);

        // Apply new rotation
        let geo = vertex.geometry.get_or_insert_with(CellGeometry::default);
        geo.rotation += self.angle_delta;
        self.applied = true;

        Ok(())
    }

    /// Undo the rotate operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev_rotation = self.previous_rotation.take();
        let vertex = model
            .store
            .vertex_mut(self.id)
            .ok_or(CommandError::VertexNotFound(self.id))?;

        if let Some(geo) = vertex.geometry.as_mut() {
            geo.rotation = prev_rotation.unwrap_or(0.0);
        }
        self.applied = false;
        Ok(())
    }
}

/// Payload for flipping a vertex along an axis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlipCommand {
    /// The ID of the vertex to flip.
    pub id: VertexId,
    /// The axis along which to flip.
    pub axis: FlipAxis,
    /// The previous horizontal flip state. Populated by `apply`.
    #[serde(skip)]
    pub previous_flip_h: Option<bool>,
    /// The previous vertical flip state. Populated by `apply`.
    #[serde(skip)]
    pub previous_flip_v: Option<bool>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl FlipCommand {
    /// Create a new payload for flipping a vertex.
    pub fn new(id: VertexId, axis: FlipAxis) -> Self {
        Self {
            id,
            axis,
            previous_flip_h: None,
            previous_flip_v: None,
            applied: false,
        }
    }

    /// Apply the flip operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let vertex = model
            .store
            .vertex_mut(self.id)
            .ok_or(CommandError::VertexNotFound(self.id))?;

        // Capture previous flip states
        self.previous_flip_h = vertex.geometry.map(|g| g.flip_h);
        self.previous_flip_v = vertex.geometry.map(|g| g.flip_v);

        // Toggle the appropriate axis
        let geo = vertex.geometry.get_or_insert_with(CellGeometry::default);
        match self.axis {
            FlipAxis::Horizontal => geo.flip_h = !geo.flip_h,
            FlipAxis::Vertical => geo.flip_v = !geo.flip_v,
        }
        self.applied = true;

        Ok(())
    }

    /// Undo the flip operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let vertex = model
            .store
            .vertex_mut(self.id)
            .ok_or(CommandError::VertexNotFound(self.id))?;

        if let Some(geo) = vertex.geometry.as_mut() {
            if let Some(prev_h) = self.previous_flip_h {
                geo.flip_h = prev_h;
            }
            if let Some(prev_v) = self.previous_flip_v {
                geo.flip_v = prev_v;
            }
        }
        self.applied = false;
        Ok(())
    }
}

/// Payload for moving a group to a new geometry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoveGroupPayload {
    /// The ID of the group to move.
    pub id: GroupId,
    /// The new geometry.
    pub geometry: CellGeometry,
    /// The previous geometry. Populated by `apply`.
    #[serde(skip)]
    pub prev_geometry: Option<CellGeometry>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl MoveGroupPayload {
    /// Create a new payload for moving a group.
    pub fn new(id: GroupId, geometry: CellGeometry) -> Self {
        Self {
            id,
            geometry,
            prev_geometry: None,
            applied: false,
        }
    }

    /// Apply the move-group operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let group = model
            .store
            .group_mut(self.id)
            .ok_or(CommandError::GroupNotFound(self.id))?;

        // Capture old geometry
        self.prev_geometry = group.geometry;

        // Apply new geometry
        group.geometry = Some(self.geometry);
        self.applied = true;

        Ok(())
    }

    /// Undo the move-group operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev = self.prev_geometry.take();
        let group = model
            .store
            .group_mut(self.id)
            .ok_or(CommandError::GroupNotFound(self.id))?;
        group.geometry = prev;
        self.applied = false;
        Ok(())
    }
}

/// Payload for setting a vertex's parent group.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetVertexParentPayload {
    /// The vertex to modify.
    pub vertex_id: VertexId,
    /// The new parent group, or None to remove from any group.
    pub parent: Option<GroupId>,
    /// Previous parent (populated by apply).
    #[serde(skip)]
    pub prev_parent: Option<GroupId>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl SetVertexParentPayload {
    /// Create a new payload for setting a vertex's parent.
    pub fn new(vertex_id: VertexId, parent: Option<GroupId>) -> Self {
        Self {
            vertex_id,
            parent,
            prev_parent: None,
            applied: false,
        }
    }

    /// Apply the set-parent operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let vertex = model
            .store
            .vertex_mut(self.vertex_id)
            .ok_or(CommandError::VertexNotFound(self.vertex_id))?;
        self.prev_parent = vertex.parent;
        vertex.parent = self.parent;
        self.applied = true;
        Ok(())
    }

    /// Undo the set-parent operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let vertex = model
            .store
            .vertex_mut(self.vertex_id)
            .ok_or(CommandError::VertexNotFound(self.vertex_id))?;
        vertex.parent = self.prev_parent;
        self.applied = false;
        Ok(())
    }
}

/// Payload for setting edge waypoints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetEdgeWaypointsPayload {
    /// The ID of the edge whose waypoints to set.
    pub id: EdgeId,
    /// The new waypoints.
    pub waypoints: Vec<Point>,
    /// The previous waypoints. Populated by `apply`.
    #[serde(skip)]
    pub prev_waypoints: Option<Vec<Point>>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl SetEdgeWaypointsPayload {
    /// Create a new payload for setting edge waypoints.
    pub fn new(id: EdgeId, waypoints: Vec<Point>) -> Self {
        Self {
            id,
            waypoints,
            prev_waypoints: None,
            applied: false,
        }
    }

    /// Apply the set-edge-waypoints operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let edge = model
            .store
            .edge_mut(self.id)
            .ok_or(CommandError::EdgeNotFound(self.id))?;

        // Capture old waypoints
        self.prev_waypoints = Some(edge.waypoints.clone());

        // Apply new waypoints
        edge.waypoints = self.waypoints.clone();
        self.applied = true;

        Ok(())
    }

    /// Undo the set-edge-waypoints operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev = self.prev_waypoints.take();
        let edge = model
            .store
            .edge_mut(self.id)
            .ok_or(CommandError::EdgeNotFound(self.id))?;
        edge.waypoints = prev.unwrap_or_default();
        self.applied = false;
        Ok(())
    }
}

/// Payload for setting an edge's label offset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetEdgeLabelOffsetPayload {
    /// The ID of the edge whose label offset to set.
    pub id: EdgeId,
    /// The new offset (dx, dy) from the edge midpoint.
    pub offset: Option<(f64, f64)>,
    /// The previous offset. Populated by `apply`.
    #[serde(skip)]
    pub prev_offset: Option<(f64, f64)>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl SetEdgeLabelOffsetPayload {
    /// Create a new payload for setting an edge's label offset.
    pub fn new(id: EdgeId, offset: Option<(f64, f64)>) -> Self {
        Self {
            id,
            offset,
            prev_offset: None,
            applied: false,
        }
    }

    /// Apply the set-edge-label-offset operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let edge = model
            .store
            .edge_mut(self.id)
            .ok_or(CommandError::EdgeNotFound(self.id))?;

        // Capture previous offset
        self.prev_offset = edge.label_offset;

        // Apply new offset
        edge.label_offset = self.offset;
        self.applied = true;

        Ok(())
    }

    /// Undo the set-edge-label-offset operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let edge = model
            .store
            .edge_mut(self.id)
            .ok_or(CommandError::EdgeNotFound(self.id))?;
        edge.label_offset = self.prev_offset;
        self.applied = false;
        Ok(())
    }
}
