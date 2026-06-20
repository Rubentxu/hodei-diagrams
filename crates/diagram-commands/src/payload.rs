//! Payload structs for each command variant.
//!
//! Each payload carries forward execution data plus inverse data slots
//! (initially None or false) that `apply` populates and `undo` consumes.

use diagram_core::{
    CellGeometry, DiagramModel, Edge, EdgeId, Group, GroupId, Label, Page, PageId, StyleId,
    StyleMap, Vertex, VertexId,
};
use diagram_routing::{EdgeStyle, RoutingRequest, route};

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

        let id = model.store.insert_edge(self.edge.clone());
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
        let id = model.store.insert_group(self.group.clone());
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
        // Get source/target IDs first (can't borrow store mutably and immutably at same time)
        let (src_id, tgt_id) = {
            let edge = model
                .store
                .edge(edge_id)
                .ok_or(CommandError::EdgeNotFound(edge_id))?;
            (edge.source, edge.target)
        };

        let source = model
            .store
            .vertex(src_id)
            .ok_or(CommandError::VertexNotFound(src_id))?;
        let target = model
            .store
            .vertex(tgt_id)
            .ok_or(CommandError::VertexNotFound(tgt_id))?;

        let req = RoutingRequest {
            source,
            target,
            style: self.routing_kind.into(),
            ports: (None, None),
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
