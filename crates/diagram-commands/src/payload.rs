//! Payload structs for each command variant.
//!
//! Each payload carries forward execution data plus inverse data slots
//! (initially None or false) that `apply` populates and `undo` consumes.

use diagram_core::{
    CellGeometry, DiagramModel, Edge, EdgeId, Group, GroupId, Label, Layer, LayerId, Page, PageId,
    Point, StyleId, StyleMap, Vertex, VertexId,
};
use diagram_routing::{Direction, EdgeStyle, RoutingRequest, resolve_anchor, route};

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

/// Captured state for undo of a layer removal (layer + shape remappings).
#[allow(clippy::type_complexity)]
type RemovedLayer = (
    Layer,
    Vec<(VertexId, Option<LayerId>)>,
    Vec<(EdgeId, Option<LayerId>)>,
);

/// Captured state for undo of a page removal (page + all its cells).
#[allow(clippy::type_complexity)]
type RemovedPage = (
    Page,
    Vec<(VertexId, Vertex)>,
    Vec<(EdgeId, Edge)>,
    Vec<(GroupId, Group)>,
    Vec<(LayerId, Layer)>,
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

    /// Create a new payload for adding a vertex with an explicit inline style.
    pub fn with_style(vertex: Vertex, style: StyleMap) -> Self {
        Self {
            vertex,
            style: Some(style),
            inserted_id: None,
            inserted_style_id: None,
            applied: false,
        }
    }

    /// Apply the add-vertex operation.
    ///
    /// IP-E: When the payload has no explicit `style` and the model has a
    /// `default_style`, the new vertex inherits the default. Per-vertex
    /// styles always win.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let mut v = self.vertex.clone();
        // If inline style was provided, insert it and assign to vertex
        if let Some(ref style_map) = self.style {
            let sid = model.store.insert_style(style_map.clone());
            v.style_id = Some(sid);
            self.inserted_style_id = Some(sid);
        } else if let Some(default) = model.default_style() {
            // No per-vertex style provided; inherit the model's default.
            let sid = model.store.insert_style(default.clone());
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

/// IP-E: Payload for reversing an edge's source and target. draw.io
/// parity for EDGE-018. The geometry (waypoints, label, style) is
/// preserved; only source/target swap.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReverseEdgePayload {
    /// The ID of the edge to reverse.
    pub id: EdgeId,
    /// The previous source. Populated by `apply`.
    #[serde(skip)]
    pub prev_source: Option<VertexId>,
    /// The previous target. Populated by `apply`.
    #[serde(skip)]
    pub prev_target: Option<VertexId>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl ReverseEdgePayload {
    /// Create a new payload for reversing an edge.
    pub fn new(id: EdgeId) -> Self {
        Self {
            id,
            prev_source: None,
            prev_target: None,
            applied: false,
        }
    }

    /// Apply the reverse-edge operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let edge = model
            .store
            .edge_mut(self.id)
            .ok_or(CommandError::EdgeNotFound(self.id))?;

        // Capture previous values
        self.prev_source = Some(edge.source);
        self.prev_target = Some(edge.target);

        // Swap source and target
        std::mem::swap(&mut edge.source, &mut edge.target);

        self.applied = true;
        Ok(())
    }

    /// Undo the reverse-edge operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev_source = self.prev_source.take().ok_or(CommandError::NotApplied)?;
        let prev_target = self.prev_target.take().ok_or(CommandError::NotApplied)?;
        let edge = model
            .store
            .edge_mut(self.id)
            .ok_or(CommandError::EdgeNotFound(self.id))?;
        edge.source = prev_source;
        edge.target = prev_target;
        self.applied = false;
        Ok(())
    }
}

/// IP-E: Payload for flipping an edge's waypoint order. draw.io parity
/// for EDGE-019. The waypoints vec is reversed; source/target and style
/// are preserved.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlipEdgePayload {
    /// The ID of the edge to flip.
    pub id: EdgeId,
    /// The previous waypoints. Populated by `apply`.
    #[serde(skip)]
    pub prev_waypoints: Option<Vec<Point>>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl FlipEdgePayload {
    /// Create a new payload for flipping an edge.
    pub fn new(id: EdgeId) -> Self {
        Self {
            id,
            prev_waypoints: None,
            applied: false,
        }
    }

    /// Apply the flip-edge operation (reverse the waypoints).
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let edge = model
            .store
            .edge_mut(self.id)
            .ok_or(CommandError::EdgeNotFound(self.id))?;

        // Capture previous waypoints
        self.prev_waypoints = Some(edge.waypoints.clone());

        // Reverse the waypoints in place
        edge.waypoints.reverse();

        self.applied = true;
        Ok(())
    }

    /// Undo the flip-edge operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev = self.prev_waypoints.take().ok_or(CommandError::NotApplied)?;
        let edge = model
            .store
            .edge_mut(self.id)
            .ok_or(CommandError::EdgeNotFound(self.id))?;
        edge.waypoints = prev;
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
    /// Re-inserts the page, vertices, edges, groups, and layers with NEW IDs and
    /// rewrites all references (`page_id`, `source`/`target`, `parent`) to
    /// point to the new IDs.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let (page, vertices, edges, groups, layers) =
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

        // Re-insert layers with rewritten page_id
        for (_old_lid, mut layer) in layers {
            layer.page_id = new_pid;
            model.store.insert_layer(layer);
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

/// IP-E: Direction for the `ReorderPage` command.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReorderDirection {
    /// Move the page to the left (toward index 0).
    Left,
    /// Move the page to the right (toward the last index).
    Right,
}

/// IP-D/IP-E follow-up: Payload for duplicating a page. Full engine
/// implementation. Clones the source page (vertices, edges, groups) with
/// rewritten `page_id` references and ID remapping. draw.io parity for
/// PAGE-004.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicatePagePayload {
    /// The ID of the source page to duplicate.
    pub source_page_id: PageId,
    /// The new name (None → "<source name> (copy)").
    pub new_name: Option<String>,
    /// The new page's ID, populated by `apply`.
    #[serde(skip)]
    pub inserted_page_id: Option<PageId>,
    /// Old → new vertex ID map, populated by `apply`. Used by `undo` to
    /// clean up cross-references in the new page's cells.
    #[serde(skip)]
    pub vid_map: HashMap<VertexId, VertexId>,
    /// Old → new group ID map, populated by `apply`.
    #[serde(skip)]
    pub gid_map: HashMap<GroupId, GroupId>,
    /// Whether this command has been applied.
    #[serde(skip)]
    pub applied: bool,
}

impl DuplicatePagePayload {
    /// Create a new payload for duplicating a page.
    pub fn new(source_page_id: PageId, new_name: Option<String>) -> Self {
        Self {
            source_page_id,
            new_name,
            inserted_page_id: None,
            vid_map: HashMap::new(),
            gid_map: HashMap::new(),
            applied: false,
        }
    }

    /// Apply the duplicate-page operation.
    ///
    /// Snapshots the source page's cells, inserts a new page, clones each
    /// cell with `page_id` rewritten to the new page, and fixes up
    /// cross-references (edges' `source`/`target`, vertices' `parent`).
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        // 1. Snapshot the source page's cells. We use `vertices_with_ids`
        //    etc. to get stable snapshots; the slotmap's `iter()` is
        //    snapshot-safe.
        let source_vertices: Vec<(VertexId, diagram_core::Vertex)> = model
            .store
            .vertices_with_ids()
            .filter(|(_, v)| v.page_id == Some(self.source_page_id))
            .map(|(k, v)| (k, v.clone()))
            .collect();
        let source_edges: Vec<(EdgeId, diagram_core::Edge)> = model
            .store
            .edges_with_ids()
            .filter(|(_, e)| e.page_id == Some(self.source_page_id))
            .map(|(k, e)| (k, e.clone()))
            .collect();
        let source_groups: Vec<(GroupId, diagram_core::Group)> = model
            .store
            .groups_with_ids()
            .filter(|(_, g)| g.page_id == Some(self.source_page_id))
            .map(|(k, g)| (k, g.clone()))
            .collect();

        // 2. Compute the new page's name.
        let source_page = model
            .store
            .page(self.source_page_id)
            .cloned()
            .ok_or(CommandError::PageNotFound(self.source_page_id))?;
        let new_name = self
            .new_name
            .clone()
            .unwrap_or_else(|| match &source_page.name {
                Some(label) => format!("{} (copy)", label.as_str()),
                None => "Page (copy)".to_string(),
            });

        // 3. Insert the new page. Get the assigned PageId.
        let mut new_page = diagram_core::Page::new(diagram_core::id::PageId::default());
        new_page.name = Some(diagram_core::label::Label::new(new_name));
        new_page.size = source_page.size;
        new_page.background = source_page.background.clone();
        new_page.math_enabled = source_page.math_enabled;
        let new_page_id = model.store.insert_page(new_page);

        // 4. Clone vertices. Build vid_map as we insert.
        self.vid_map.clear();
        for (old_vid, mut vertex) in source_vertices {
            vertex.page_id = Some(new_page_id);
            let new_vid = model.store.insert_vertex(vertex);
            self.vid_map.insert(old_vid, new_vid);
        }

        // 5. Clone groups. Build gid_map.
        self.gid_map.clear();
        for (old_gid, mut group) in source_groups {
            group.page_id = Some(new_page_id);
            let new_gid = model.store.insert_group(group);
            self.gid_map.insert(old_gid, new_gid);
        }

        // 6. Clone edges. Rewrite source/target via vid_map.
        for (_old_eid, mut edge) in source_edges {
            edge.page_id = Some(new_page_id);
            if let Some(&new_src) = self.vid_map.get(&edge.source) {
                edge.source = new_src;
            }
            if let Some(&new_tgt) = self.vid_map.get(&edge.target) {
                edge.target = new_tgt;
            }
            model.store.insert_edge(edge);
        }

        // 7. Fix up parent references on the cloned vertices. The
        //    `parent` of a cloned vertex is currently the old group's id;
        //    remap via gid_map. The slotmap is borrowed mutably to write;
        //    we collect the fixup pairs first.
        let parent_fixups: Vec<(VertexId, GroupId)> = model
            .store
            .vertices_with_ids()
            .filter_map(|(vid, v)| {
                v.parent
                    .and_then(|old_gid| self.gid_map.get(&old_gid).map(|&new_gid| (vid, new_gid)))
            })
            .collect();
        for (vid, new_gid) in parent_fixups {
            if let Some(vertex_mut) = model.store.vertex_mut(vid) {
                vertex_mut.parent = Some(new_gid);
            }
        }

        self.inserted_page_id = Some(new_page_id);
        self.applied = true;
        Ok(())
    }

    /// Undo the duplicate-page operation.
    ///
    /// Cascade-deletes the new page. The slotmap's `remove_page` cleans
    /// up all cloned cells (vertices, edges, groups) with the matching
    /// `page_id`.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let new_pid = self
            .inserted_page_id
            .take()
            .ok_or(CommandError::NotApplied)?;
        model.store.remove_page(new_pid);
        self.vid_map.clear();
        self.gid_map.clear();
        self.applied = false;
        Ok(())
    }
}

/// IP-D/IP-E follow-up: Payload for reordering a page. Full engine
/// implementation. Uses `DiagramModel::page_order` (Option<Vec<PageId>>)
/// to swap the page with its left/right neighbor in the display order.
/// The slotmap identity of cells is unchanged; only the display order
/// changes. draw.io parity for PAGE-005.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderPagePayload {
    /// The ID of the page to reorder.
    pub id: PageId,
    /// The direction to move the page.
    pub direction: ReorderDirection,
    /// The previous `page_order` (or `None`). Populated by `apply`.
    #[serde(skip)]
    pub prev_page_order: Option<Vec<PageId>>,
    /// Whether this command has been applied.
    #[serde(skip)]
    pub applied: bool,
}

impl ReorderPagePayload {
    /// Create a new payload for reordering a page.
    pub fn new(id: PageId, direction: ReorderDirection) -> Self {
        Self {
            id,
            direction,
            prev_page_order: None,
            applied: false,
        }
    }

    /// Apply the reorder-page operation.
    ///
    /// Computes the current page order (using `page_order` if set, else
    /// slotmap order). Finds the current page's index. Swaps with neighbor
    /// (current ± 1) if not at boundary. Sets `page_order` to the new
    /// order. At boundary, `apply` succeeds without changes (the command
    /// is a no-op success — the TS layer does not show a diagnostic).
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        // 1. Save the current page_order for undo.
        self.prev_page_order = model.page_order().cloned();

        // 2. Build the current page order (use page_order if set, else slotmap).
        let mut order: Vec<PageId> = model.pages_in_order().iter().map(|(k, _)| *k).collect();

        // 3. Find the current index.
        let current_idx = order
            .iter()
            .position(|p| *p == self.id)
            .ok_or(CommandError::PageNotFound(self.id))?;

        // 4. Compute the target index. Boundary cases are no-ops (success).
        let target_idx = match self.direction {
            ReorderDirection::Left => current_idx.checked_sub(1),
            ReorderDirection::Right => {
                if current_idx + 1 < order.len() {
                    Some(current_idx + 1)
                } else {
                    None
                }
            }
        };
        let target_idx = match target_idx {
            Some(idx) => idx,
            None => {
                // Boundary: no change. The command is a no-op success.
                self.applied = true;
                return Ok(());
            }
        };

        // 5. Swap.
        order.swap(current_idx, target_idx);

        // 6. Set the new order.
        model.set_page_order(Some(order));
        self.applied = true;
        Ok(())
    }

    /// Undo the reorder-page operation.
    ///
    /// Restores the previous `page_order` (or removes it if there was
    /// none). The boundary no-op case is symmetric: undo restores the
    /// unchanged value.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        model.set_page_order(self.prev_page_order.take());
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

/// Payload for enabling or disabling math typesetting on a page.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetPageMathEnabledPayload {
    /// The ID of the page to modify.
    pub page_id: PageId,
    /// The new math_enabled value.
    pub enabled: bool,
    /// The previous math_enabled value. Populated by `apply`.
    #[serde(skip)]
    pub prev_enabled: Option<bool>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl SetPageMathEnabledPayload {
    /// Create a new payload for setting page math enabled state.
    pub fn new(page_id: PageId, enabled: bool) -> Self {
        Self {
            page_id,
            enabled,
            prev_enabled: None,
            applied: false,
        }
    }

    /// Apply the set-page-math-enabled operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let page = model
            .store
            .page_mut(self.page_id)
            .ok_or(CommandError::PageNotFound(self.page_id))?;

        // Capture previous value
        self.prev_enabled = Some(page.math_enabled);

        // Apply new value
        page.math_enabled = self.enabled;
        self.applied = true;

        Ok(())
    }

    /// Undo the set-page-math-enabled operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev = self.prev_enabled.ok_or(CommandError::NotApplied)?;
        let page = model
            .store
            .page_mut(self.page_id)
            .ok_or(CommandError::PageNotFound(self.page_id))?;
        page.math_enabled = prev;
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

/// IP-E: Payload for setting the model's default cell style. When applied,
/// subsequent `AddVertex` commands (without an explicit style) inherit this
/// style. draw.io parity for STYL-003/004.
///
/// The payload itself is just the new default style; the previous value
/// is captured in `apply` and restored in `undo`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetDefaultStylePayload {
    /// The new default style. When `None`, the default is cleared.
    pub style: Option<StyleMap>,
    /// The previous default style. Populated by `apply`.
    #[serde(skip)]
    pub prev_style: Option<StyleMap>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl SetDefaultStylePayload {
    /// Create a new payload for setting the default cell style.
    /// `None` clears the default.
    pub fn new(style: Option<StyleMap>) -> Self {
        Self {
            style,
            prev_style: None,
            applied: false,
        }
    }

    /// Apply the set-default-style operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        // Capture previous value before overwriting.
        self.prev_style = model.default_style.clone();
        model.set_default_style(self.style.clone());
        self.applied = true;
        Ok(())
    }

    /// Undo the set-default-style operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev = self.prev_style.take();
        model.set_default_style(prev);
        self.applied = false;
        Ok(())
    }
}

// ─── IP-F: Layer Command Payloads ────────────────────────────────────────────

/// IP-F: Payload for adding a named layer to a page.
///
/// The new layer starts visible and unlocked. The default layer (name: None)
/// for a page is created by the engine when a page is first inserted.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddLayerPayload {
    /// The page to add the layer to.
    pub page_id: PageId,
    /// The name for the new layer. `None` creates a default layer (discouraged —
    /// use page's auto-created default instead).
    pub name: Option<Label>,
    /// The assigned layer ID, populated by `apply`. Used by `undo`.
    #[serde(skip)]
    pub inserted_id: Option<LayerId>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl AddLayerPayload {
    /// Create a new payload for adding a named layer.
    pub fn new(page_id: PageId, name: Option<Label>) -> Self {
        Self {
            page_id,
            name,
            inserted_id: None,
            applied: false,
        }
    }

    /// Apply the add-layer operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let mut layer = Layer::default();
        layer.page_id = self.page_id;
        layer.name = self.name.clone();
        // visible: true, locked: false by default
        let id = model.store.insert_layer(layer);
        self.inserted_id = Some(id);
        self.applied = true;
        Ok(())
    }

    /// Undo the add-layer operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let id = self.inserted_id.take().ok_or(CommandError::NotApplied)?;
        model.store.remove_layer(id);
        self.applied = false;
        Ok(())
    }
}

/// IP-F: Payload for removing a layer.
///
/// Shapes on the removed layer are moved to the page's default layer.
/// The default layer itself cannot be removed (this is a no-op).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoveLayerPayload {
    /// The layer to remove.
    pub layer_id: LayerId,
    /// The removed layer and the { old_shape_layer_id → new_shape_layer_id } remap
    /// for vertices and edges. Populated by `apply`.
    #[serde(skip)]
    pub removed: Option<RemovedLayer>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl RemoveLayerPayload {
    /// Create a new payload for removing a layer.
    pub fn new(layer_id: LayerId) -> Self {
        Self {
            layer_id,
            removed: None,
            applied: false,
        }
    }

    /// Find the default layer ID for a given page.
    fn find_default_layer_id(store: &diagram_core::ModelStore, page_id: PageId) -> Option<LayerId> {
        store
            .layers_with_ids()
            .find(|(_, l)| l.page_id == page_id && l.name.is_none())
            .map(|(id, _)| id)
    }

    /// Apply the remove-layer operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        // Get the layer or error
        let layer = model
            .store
            .layer(self.layer_id)
            .cloned()
            .ok_or(CommandError::LayerNotFound(self.layer_id))?;

        // No-op if this is the default layer
        if layer.is_default() {
            self.applied = true;
            return Ok(());
        }

        let page_id = layer.page_id;

        // Find the default layer for this page
        let default_layer_id = Self::find_default_layer_id(&model.store, page_id)
            .ok_or(CommandError::LayerNotFound(self.layer_id))?;

        // Collect vertex remap pairs (vid, prev_layer_id) first
        let vertex_remap: Vec<(VertexId, Option<LayerId>)> = model
            .store
            .vertices_with_ids()
            .filter(|(_, v)| v.layer_id == Some(self.layer_id))
            .map(|(vid, v)| (vid, v.layer_id))
            .collect();

        // Collect edge remap pairs (eid, prev_layer_id) first
        let edge_remap: Vec<(EdgeId, Option<LayerId>)> = model
            .store
            .edges_with_ids()
            .filter(|(_, e)| e.layer_id == Some(self.layer_id))
            .map(|(eid, e)| (eid, e.layer_id))
            .collect();

        // Now update vertices (no longer iterating)
        for (vid, _) in &vertex_remap {
            if let Some(v) = model.store.vertex_mut(*vid) {
                v.layer_id = Some(default_layer_id);
            }
        }

        // Now update edges
        for (eid, _) in &edge_remap {
            if let Some(e) = model.store.edge_mut(*eid) {
                e.layer_id = Some(default_layer_id);
            }
        }

        // Remove the layer
        model.store.remove_layer(self.layer_id);

        self.removed = Some((layer, vertex_remap, edge_remap));
        self.applied = true;
        Ok(())
    }

    /// Undo the remove-layer operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let (layer, vertex_remap, edge_remap) =
            self.removed.take().ok_or(CommandError::NotApplied)?;

        // Re-insert the layer with the old ID
        let mut reinserted = layer.clone();
        reinserted.id = self.layer_id;
        let _new_id = model.store.insert_layer(reinserted);

        // Restore vertex layer_ids to the REMOVED layer's ID (not the new re-inserted id)
        // The removed layer was deleted and a new one created with a potentially different ID.
        // For undo, we must restore the shape's layer_id to point to the original (now re-inserted) layer.
        for (vid, prev_layer_id) in vertex_remap {
            if let Some(v) = model.store.vertex_mut(vid) {
                // prev_layer_id was Some(old_layer_id) before remove; restore it
                // The re-inserted layer has the SAME id as the removed one (slotmap reuse)
                v.layer_id = prev_layer_id;
            }
        }

        // Restore edge layer_ids
        for (eid, prev_layer_id) in edge_remap {
            if let Some(e) = model.store.edge_mut(eid) {
                e.layer_id = prev_layer_id;
            }
        }

        self.applied = false;
        Ok(())
    }
}

/// IP-F: Payload for renaming a layer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenameLayerPayload {
    /// The layer to rename.
    pub layer_id: LayerId,
    /// The new name.
    pub name: Label,
    /// The previous name. Populated by `apply`.
    #[serde(skip)]
    pub prev_name: Option<Label>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl RenameLayerPayload {
    /// Create a new payload for renaming a layer.
    pub fn new(layer_id: LayerId, name: Label) -> Self {
        Self {
            layer_id,
            name,
            prev_name: None,
            applied: false,
        }
    }

    /// Apply the rename-layer operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let layer = model
            .store
            .layer_mut(self.layer_id)
            .ok_or(CommandError::LayerNotFound(self.layer_id))?;

        // Capture previous name
        self.prev_name = layer.name.clone();

        // Apply new name
        layer.name = Some(self.name.clone());
        self.applied = true;

        Ok(())
    }

    /// Undo the rename-layer operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev = self.prev_name.take();
        let layer = model
            .store
            .layer_mut(self.layer_id)
            .ok_or(CommandError::LayerNotFound(self.layer_id))?;
        layer.name = prev;
        self.applied = false;
        Ok(())
    }
}

/// IP-F: Payload for toggling layer visibility.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetLayerVisiblePayload {
    /// The layer to modify.
    pub layer_id: LayerId,
    /// The new visibility state.
    pub visible: bool,
    /// The previous visibility state. Populated by `apply`.
    #[serde(skip)]
    pub prev_visible: Option<bool>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl SetLayerVisiblePayload {
    /// Create a new payload for setting layer visibility.
    pub fn new(layer_id: LayerId, visible: bool) -> Self {
        Self {
            layer_id,
            visible,
            prev_visible: None,
            applied: false,
        }
    }

    /// Apply the set-layer-visibility operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let layer = model
            .store
            .layer_mut(self.layer_id)
            .ok_or(CommandError::LayerNotFound(self.layer_id))?;

        // Capture previous visibility
        self.prev_visible = Some(layer.visible);

        // Apply new visibility
        layer.visible = self.visible;
        self.applied = true;

        Ok(())
    }

    /// Undo the set-layer-visibility operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev = self.prev_visible.take();
        let layer = model
            .store
            .layer_mut(self.layer_id)
            .ok_or(CommandError::LayerNotFound(self.layer_id))?;
        layer.visible = prev.unwrap_or(true);
        self.applied = false;
        Ok(())
    }
}

/// IP-F: Payload for toggling layer locked state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetLayerLockedPayload {
    /// The layer to modify.
    pub layer_id: LayerId,
    /// The new locked state.
    pub locked: bool,
    /// The previous locked state. Populated by `apply`.
    #[serde(skip)]
    pub prev_locked: Option<bool>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl SetLayerLockedPayload {
    /// Create a new payload for setting layer locked state.
    pub fn new(layer_id: LayerId, locked: bool) -> Self {
        Self {
            layer_id,
            locked,
            prev_locked: None,
            applied: false,
        }
    }

    /// Apply the set-layer-locked operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        let layer = model
            .store
            .layer_mut(self.layer_id)
            .ok_or(CommandError::LayerNotFound(self.layer_id))?;

        // Capture previous locked state
        self.prev_locked = Some(layer.locked);

        // Apply new locked state
        layer.locked = self.locked;
        self.applied = true;

        Ok(())
    }

    /// Undo the set-layer-locked operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }
        let prev = self.prev_locked.take();
        let layer = model
            .store
            .layer_mut(self.layer_id)
            .ok_or(CommandError::LayerNotFound(self.layer_id))?;
        layer.locked = prev.unwrap_or(false);
        self.applied = false;
        Ok(())
    }
}

/// IP-F: Payload for moving shapes to a different layer.
/// Moves both vertices and their connecting edges to the target layer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoveShapeToLayerPayload {
    /// The IDs of the vertices to move.
    pub vertex_ids: Vec<VertexId>,
    /// The IDs of the edges to move.
    pub edge_ids: Vec<EdgeId>,
    /// The target layer. `None` means the page's default layer.
    pub layer_id: Option<LayerId>,
    /// The previous layer IDs for each shape, populated by `apply`.
    #[serde(skip)]
    pub prev_vertex_layer_ids: Option<Vec<(VertexId, Option<LayerId>)>>,
    /// The previous layer IDs for each edge, populated by `apply`.
    #[serde(skip)]
    pub prev_edge_layer_ids: Option<Vec<(EdgeId, Option<LayerId>)>>,
    /// Whether this command has been applied.
    #[serde(skip)]
    applied: bool,
}

impl MoveShapeToLayerPayload {
    /// Create a new payload for moving shapes to a layer.
    pub fn new(vertex_ids: Vec<VertexId>, layer_id: Option<LayerId>) -> Self {
        Self {
            vertex_ids,
            edge_ids: Vec::new(),
            layer_id,
            prev_vertex_layer_ids: None,
            prev_edge_layer_ids: None,
            applied: false,
        }
    }

    /// Create a new payload for moving shapes (vertices AND edges) to a layer.
    pub fn with_edges(
        vertex_ids: Vec<VertexId>,
        edge_ids: Vec<EdgeId>,
        layer_id: Option<LayerId>,
    ) -> Self {
        Self {
            vertex_ids,
            edge_ids,
            layer_id,
            prev_vertex_layer_ids: None,
            prev_edge_layer_ids: None,
            applied: false,
        }
    }

    /// Find the default layer ID for a given page, based on any existing shape's page.
    fn find_default_layer_for_shapes(
        store: &diagram_core::ModelStore,
        vertex_ids: &[VertexId],
    ) -> Option<LayerId> {
        // Get the page_id from the first vertex
        let page_id = vertex_ids
            .iter()
            .find_map(|vid| store.vertex(*vid).and_then(|v| v.page_id))?;

        // Find the default layer (name: None) for that page
        store
            .layers_with_ids()
            .find(|(_, l)| l.page_id == page_id && l.name.is_none())
            .map(|(id, _)| id)
    }

    /// Apply the move-shape-to-layer operation.
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        // Resolve target layer: if None, find the default layer
        let target_layer_id = match self.layer_id {
            Some(id) => {
                // Verify the layer exists
                if model.store.layer(id).is_none() {
                    return Err(CommandError::LayerNotFound(id));
                }
                id
            }
            None => Self::find_default_layer_for_shapes(&model.store, &self.vertex_ids)
                .ok_or(CommandError::LayerNotFound(LayerId::default()))?,
        };

        // Capture previous layer_ids for vertices and update
        let mut prev_vids: Vec<(VertexId, Option<LayerId>)> = Vec::new();
        for vid in &self.vertex_ids {
            let vertex = model
                .store
                .vertex_mut(*vid)
                .ok_or(CommandError::VertexNotFound(*vid))?;
            prev_vids.push((*vid, vertex.layer_id));
            vertex.layer_id = Some(target_layer_id);
        }
        self.prev_vertex_layer_ids = Some(prev_vids);

        // Capture previous layer_ids for edges and update
        let mut prev_eids: Vec<(EdgeId, Option<LayerId>)> = Vec::new();
        for eid in &self.edge_ids {
            let edge = model
                .store
                .edge_mut(*eid)
                .ok_or(CommandError::EdgeNotFound(*eid))?;
            prev_eids.push((*eid, edge.layer_id));
            edge.layer_id = Some(target_layer_id);
        }
        self.prev_edge_layer_ids = Some(prev_eids);

        self.applied = true;
        Ok(())
    }

    /// Undo the move-shape-to-layer operation.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        if !self.applied {
            return Err(CommandError::NotApplied);
        }

        // Restore vertex layer_ids
        if let Some(prev_vids) = self.prev_vertex_layer_ids.take() {
            for (vid, prev_layer_id) in prev_vids {
                if let Some(vertex) = model.store.vertex_mut(vid) {
                    vertex.layer_id = prev_layer_id;
                }
            }
        }

        // Restore edge layer_ids
        if let Some(prev_eids) = self.prev_edge_layer_ids.take() {
            for (eid, prev_layer_id) in prev_eids {
                if let Some(edge) = model.store.edge_mut(eid) {
                    edge.layer_id = prev_layer_id;
                }
            }
        }

        self.applied = false;
        Ok(())
    }
}
