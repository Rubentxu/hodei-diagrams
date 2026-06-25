//! The `Command` enum and its `apply`/`undo` operations.
//!
//! Each variant carries a payload that holds forward execution data plus
//! inverse data slots populated by `apply` and consumed by `undo`.

use diagram_core::DiagramModel;
use serde::{Deserialize, Serialize};

use crate::error::CommandResult;
use crate::payload::{
    AddEdgePayload, AddGroupPayload, AddPagePayload, AddVertexPayload, BringForwardPayload,
    BringToFrontPayload, ChangeStylePayload, ConnectVerticesCommand, DisconnectEdgeCommand,
    EditEdgeLabelPayload, EditLabelPayload, FlipCommand, MoveGroupPayload, MoveVertexPayload,
    RemoveEdgePayload, RemoveGroupPayload, RemovePagePayload, RemoveVertexPayload,
    RenamePagePayload, RotateCommand, SendBackwardPayload, SendToBackPayload,
    SetEdgeLabelOffsetPayload, SetEdgeWaypointsPayload, SetPageMathEnabledPayload,
    SetVertexParentPayload,
};

/// A reversible mutation command for the diagram model.
///
/// The enum is `#[non_exhaustive]` so new variants can be added without
/// breaking existing match arms in downstream code.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[non_exhaustive]
pub enum Command {
    /// Add a vertex to the diagram.
    AddVertex(AddVertexPayload),
    /// Remove a vertex from the diagram.
    RemoveVertex(RemoveVertexPayload),
    /// Move a vertex to a new position.
    MoveVertex(MoveVertexPayload),
    /// Move a group to a new geometry.
    MoveGroup(MoveGroupPayload),
    /// Edit a vertex's label.
    EditVertexLabel(EditLabelPayload),
    /// Edit an edge's label.
    EditEdgeLabel(EditEdgeLabelPayload),
    /// Add an edge between two vertices.
    AddEdge(AddEdgePayload),
    /// Remove an edge from the diagram.
    RemoveEdge(RemoveEdgePayload),
    /// Connect two vertices with an edge (Phase 0 interactive edge creation).
    ConnectVertices(ConnectVerticesCommand),
    /// Disconnect an edge (remove it).
    DisconnectEdge(DisconnectEdgeCommand),
    /// Set edge waypoints (used by tree layout).
    SetEdgeWaypoints(SetEdgeWaypointsPayload),
    /// Change a vertex's style.
    ChangeStyle(ChangeStylePayload),
    /// Add a group to the diagram.
    AddGroup(AddGroupPayload),
    /// Remove a group from the diagram.
    RemoveGroup(RemoveGroupPayload),
    /// Add a page to the diagram.
    AddPage(AddPagePayload),
    /// Remove a page and all its cells from the diagram.
    RemovePage(RemovePagePayload),
    /// Rename a page.
    RenamePage(RenamePagePayload),
    /// Rotate a vertex by a delta angle.
    RotateVertex(RotateCommand),
    /// Flip a vertex along an axis.
    FlipVertex(FlipCommand),
    /// Bring a cell to the front (topmost z-order).
    BringToFront(BringToFrontPayload),
    /// Send a cell to the back (bottommost z-order).
    SendToBack(SendToBackPayload),
    /// Bring a cell forward (swap with next higher).
    BringForward(BringForwardPayload),
    /// Send a cell backward (swap with next lower).
    SendBackward(SendBackwardPayload),
    /// Set a vertex's parent group.
    SetVertexParent(SetVertexParentPayload),
    /// Set an edge's label offset.
    SetEdgeLabelOffset(SetEdgeLabelOffsetPayload),
    /// Set whether math typesetting is enabled on a page.
    SetPageMathEnabled(SetPageMathEnabledPayload),
}

impl Command {
    /// Apply this command to the model, returning `Ok(())` on success.
    ///
    /// On error the model state is unchanged (commands are idempotent for rollback).
    pub fn apply(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        match self {
            Command::AddVertex(p) => p.apply(model),
            Command::RemoveVertex(p) => p.apply(model),
            Command::MoveVertex(p) => p.apply(model),
            Command::MoveGroup(p) => p.apply(model),
            Command::EditVertexLabel(p) => p.apply(model),
            Command::EditEdgeLabel(p) => p.apply(model),
            Command::AddEdge(p) => p.apply(model),
            Command::RemoveEdge(p) => p.apply(model),
            Command::ConnectVertices(p) => p.apply(model),
            Command::DisconnectEdge(p) => p.apply(model),
            Command::SetEdgeWaypoints(p) => p.apply(model),
            Command::ChangeStyle(p) => p.apply(model),
            Command::AddGroup(p) => p.apply(model),
            Command::RemoveGroup(p) => p.apply(model),
            Command::AddPage(p) => p.apply(model),
            Command::RemovePage(p) => p.apply(model),
            Command::RenamePage(p) => p.apply(model),
            Command::RotateVertex(p) => p.apply(model),
            Command::FlipVertex(p) => p.apply(model),
            Command::BringToFront(p) => p.apply(model),
            Command::SendToBack(p) => p.apply(model),
            Command::BringForward(p) => p.apply(model),
            Command::SendBackward(p) => p.apply(model),
            Command::SetVertexParent(p) => p.apply(model),
            Command::SetEdgeLabelOffset(p) => p.apply(model),
            Command::SetPageMathEnabled(p) => p.apply(model),
        }
    }

    /// Undo this command, restoring the model to its previous state.
    ///
    /// Returns `Err(CommandError::NotApplied)` if the command has not been applied.
    pub fn undo(&mut self, model: &mut DiagramModel) -> CommandResult<()> {
        match self {
            Command::AddVertex(p) => p.undo(model),
            Command::RemoveVertex(p) => p.undo(model),
            Command::MoveVertex(p) => p.undo(model),
            Command::MoveGroup(p) => p.undo(model),
            Command::EditVertexLabel(p) => p.undo(model),
            Command::EditEdgeLabel(p) => p.undo(model),
            Command::AddEdge(p) => p.undo(model),
            Command::RemoveEdge(p) => p.undo(model),
            Command::ConnectVertices(p) => p.undo(model),
            Command::DisconnectEdge(p) => p.undo(model),
            Command::SetEdgeWaypoints(p) => p.undo(model),
            Command::ChangeStyle(p) => p.undo(model),
            Command::AddGroup(p) => p.undo(model),
            Command::RemoveGroup(p) => p.undo(model),
            Command::AddPage(p) => p.undo(model),
            Command::RemovePage(p) => p.undo(model),
            Command::RenamePage(p) => p.undo(model),
            Command::RotateVertex(p) => p.undo(model),
            Command::FlipVertex(p) => p.undo(model),
            Command::BringToFront(p) => p.undo(model),
            Command::SendToBack(p) => p.undo(model),
            Command::BringForward(p) => p.undo(model),
            Command::SendBackward(p) => p.undo(model),
            Command::SetVertexParent(p) => p.undo(model),
            Command::SetEdgeLabelOffset(p) => p.undo(model),
            Command::SetPageMathEnabled(p) => p.undo(model),
        }
    }
}

/// Result of applying a command.
///
/// Contains the original command (with inverse data populated) and
/// a flag indicating whether a subsequent `undo` is meaningful.
#[derive(Debug)]
pub struct CompletedCommand {
    /// The applied command with inverse data filled in.
    pub command: Command,
    /// Whether this command has a meaningful inverse to undo.
    pub has_inverse: bool,
}

impl CompletedCommand {
    /// Create a new completed command.
    pub fn new(command: Command, has_inverse: bool) -> Self {
        Self {
            command,
            has_inverse,
        }
    }
}

#[cfg(test)]
mod tests {
    use diagram_core::geometry::CellGeometry;
    use diagram_core::label::Label;
    use diagram_core::page::Page;
    use diagram_core::style::{StyleMap, StyleValue};
    use diagram_core::{Edge, EdgeId, Group, PageId, Vertex, VertexId};

    use super::*;
    use crate::RoutingKind;
    use crate::payload::{CellTarget, EditEdgeLabelPayload};

    fn make_model_with_page() -> (DiagramModel, PageId) {
        let mut model = DiagramModel::new();
        let page = Page::new(PageId::default());
        let pid = model.store.insert_page(page);
        // Fix up the page's id field to match the slotmap key
        if let Some(p) = model.store.page_mut(pid) {
            p.id = pid;
        }
        (model, pid)
    }

    // ─── AddVertex ───────────────────────────────────────────────────────────────

    #[test]
    fn apply_add_vertex_succeeds() {
        let (mut model, pid) = make_model_with_page();
        let v = Vertex {
            geometry: Some(CellGeometry {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 50.0,
                relative: false,
                ..Default::default()
            }),
            label: Some(Label::new("Test")),
            page_id: Some(pid),
            ..Default::default()
        };

        let mut cmd = Command::AddVertex(AddVertexPayload::new(v.clone()));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.len_vertex(), 1);
        let stored = model.store.vertex(vid_from_model(&model, 0)).unwrap();
        assert_eq!(stored.label.as_ref().unwrap().as_str(), "Test");
    }

    #[test]
    fn undo_add_vertex_restores_structural_equivalence() {
        let (mut model, pid) = make_model_with_page();
        let v = Vertex {
            geometry: Some(CellGeometry {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 50.0,
                relative: false,
                ..Default::default()
            }),
            label: Some(Label::new("Test")),
            page_id: Some(pid),
            ..Default::default()
        };

        let mut cmd = Command::AddVertex(AddVertexPayload::new(v));
        cmd.apply(&mut model).unwrap();
        assert_eq!(model.store.len_vertex(), 1);

        cmd.undo(&mut model).unwrap();
        assert_eq!(model.store.len_vertex(), 0);
    }

    #[test]
    fn redo_add_vertex_via_apply() {
        let (mut model, pid) = make_model_with_page();
        let v = Vertex {
            label: Some(Label::new("Test")),
            page_id: Some(pid),
            ..Default::default()
        };

        let mut cmd = Command::AddVertex(AddVertexPayload::new(v));
        cmd.apply(&mut model).unwrap();
        let id_after_first = vid_from_model(&model, 0);

        cmd.undo(&mut model).unwrap();
        assert_eq!(model.store.len_vertex(), 0);

        cmd.apply(&mut model).unwrap();
        let id_after_redo = vid_from_model(&model, 0);

        // IDs differ because slotmap reissues keys after removal
        assert_ne!(id_after_first, id_after_redo);
        assert_eq!(model.store.len_vertex(), 1);
    }

    // ─── RemoveVertex ──────────────────────────────────────────────────────────

    #[test]
    fn apply_remove_vertex_succeeds() {
        let (mut model, pid) = make_model_with_page();
        let vid = insert_vertex(&mut model, pid, "Test");
        assert_eq!(model.store.len_vertex(), 1);

        let mut cmd = Command::RemoveVertex(RemoveVertexPayload::new(vid));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.len_vertex(), 0);
    }

    #[test]
    fn undo_remove_vertex_restores_structural_equivalence() {
        let (mut model, pid) = make_model_with_page();
        let vid = insert_vertex(&mut model, pid, "Test");
        let orig_label = model.store.vertex(vid).unwrap().label.clone();

        let mut cmd = Command::RemoveVertex(RemoveVertexPayload::new(vid));
        cmd.apply(&mut model).unwrap();
        assert_eq!(model.store.len_vertex(), 0);

        cmd.undo(&mut model).unwrap();
        assert_eq!(model.store.len_vertex(), 1);
        // Label restored
        let restored = model.store.vertex(vid_from_model(&model, 0)).unwrap();
        assert_eq!(restored.label, orig_label);
    }

    #[test]
    fn undo_remove_vertex_rewrites_edge_references() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");
        let edge = Edge {
            source: v1,
            target: v2,
            page_id: Some(pid),
            ..Default::default()
        };
        let _eid = model.store.insert_edge(edge);

        // Remove v1 - should orphan the edge
        let mut cmd = Command::RemoveVertex(RemoveVertexPayload::new(v1));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.len_vertex(), 1);
        assert_eq!(model.store.len_edge(), 0); // edge was removed with vertex

        // Undo - edge should be re-inserted with rewritten source
        cmd.undo(&mut model).unwrap();
        assert_eq!(model.store.len_vertex(), 2);
        assert_eq!(model.store.len_edge(), 1);

        // The new vertex id should be used in the restored edge
        let new_v1_id = vid_from_model(&model, 0);
        let restored_edge = model.store.edge(eid_from_model(&model, 0)).unwrap();
        assert_eq!(restored_edge.source, new_v1_id);
        assert_eq!(restored_edge.target, v2);
    }

    // ─── MoveVertex ────────────────────────────────────────────────────────────

    #[test]
    fn apply_move_vertex_succeeds() {
        let (mut model, pid) = make_model_with_page();
        let vid = insert_vertex(&mut model, pid, "Test");

        let new_geom = CellGeometry {
            x: 100.0,
            y: 200.0,
            width: 50.0,
            height: 50.0,
            relative: false,
            ..Default::default()
        };

        let mut cmd = Command::MoveVertex(MoveVertexPayload::new(vid, new_geom));
        cmd.apply(&mut model).unwrap();

        let v = model.store.vertex(vid).unwrap();
        assert_eq!(v.geometry.as_ref().unwrap().x, 100.0);
        assert_eq!(v.geometry.as_ref().unwrap().y, 200.0);
    }

    #[test]
    fn undo_move_vertex_restores_original_position() {
        let (mut model, pid) = make_model_with_page();
        let vid = insert_vertex(&mut model, pid, "Test");

        // Capture original geometry BEFORE apply
        let original_geom = model.store.vertex(vid).unwrap().geometry;

        let new_geom = CellGeometry {
            x: 100.0,
            y: 200.0,
            width: 50.0,
            height: 50.0,
            relative: false,
            ..Default::default()
        };

        let mut cmd = Command::MoveVertex(MoveVertexPayload::new(vid, new_geom));
        cmd.apply(&mut model).unwrap();

        // Verify geometry changed
        let after_apply = model.store.vertex(vid).unwrap().geometry;
        assert_ne!(original_geom, after_apply);

        cmd.undo(&mut model).unwrap();

        // After undo, geometry should be restored to original
        let after_undo = model.store.vertex(vid).unwrap().geometry;
        assert_eq!(original_geom, after_undo);
    }

    // ─── MoveGroup ────────────────────────────────────────────────────────────

    #[test]
    fn apply_move_group_succeeds() {
        let (mut model, pid) = make_model_with_page();
        let gid = insert_group(&mut model, pid, "Group");

        let new_geom = CellGeometry {
            x: 100.0,
            y: 200.0,
            width: 150.0,
            height: 80.0,
            relative: false,
            ..Default::default()
        };

        let mut cmd = Command::MoveGroup(MoveGroupPayload::new(gid, new_geom));
        cmd.apply(&mut model).unwrap();

        let g = model.store.group(gid).unwrap();
        assert_eq!(g.geometry.as_ref().unwrap().x, 100.0);
        assert_eq!(g.geometry.as_ref().unwrap().y, 200.0);
        assert_eq!(g.geometry.as_ref().unwrap().width, 150.0);
        assert_eq!(g.geometry.as_ref().unwrap().height, 80.0);
    }

    #[test]
    fn undo_move_group_restores_original_geometry() {
        let (mut model, pid) = make_model_with_page();
        let gid = insert_group(&mut model, pid, "Group");

        // Set initial geometry
        {
            let g = model.store.group_mut(gid).unwrap();
            g.geometry = Some(CellGeometry {
                x: 10.0,
                y: 20.0,
                width: 100.0,
                height: 50.0,
                relative: false,
                ..Default::default()
            });
        }

        // Capture original geometry BEFORE apply
        let original_geom = model.store.group(gid).unwrap().geometry;

        let new_geom = CellGeometry {
            x: 100.0,
            y: 200.0,
            width: 150.0,
            height: 80.0,
            relative: false,
            ..Default::default()
        };

        let mut cmd = Command::MoveGroup(MoveGroupPayload::new(gid, new_geom));
        cmd.apply(&mut model).unwrap();

        // Verify geometry changed
        let after_apply = model.store.group(gid).unwrap().geometry;
        assert_ne!(original_geom, after_apply);

        cmd.undo(&mut model).unwrap();

        // After undo, geometry should be restored to original
        let after_undo = model.store.group(gid).unwrap().geometry;
        assert_eq!(original_geom, after_undo);
    }

    #[test]
    fn apply_move_group_none_geometry_to_some() {
        let (mut model, pid) = make_model_with_page();
        let gid = insert_group(&mut model, pid, "Group");
        // Group starts with no geometry

        let new_geom = CellGeometry {
            x: 100.0,
            y: 200.0,
            width: 150.0,
            height: 80.0,
            relative: false,
            ..Default::default()
        };

        let mut cmd = Command::MoveGroup(MoveGroupPayload::new(gid, new_geom));
        cmd.apply(&mut model).unwrap();

        let g = model.store.group(gid).unwrap();
        assert!(g.geometry.is_some());
        assert_eq!(g.geometry.as_ref().unwrap().x, 100.0);
    }

    #[test]
    fn undo_move_group_restores_none_geometry() {
        let (mut model, pid) = make_model_with_page();
        let gid = insert_group(&mut model, pid, "Group");
        // Group starts with no geometry

        let new_geom = CellGeometry {
            x: 100.0,
            y: 200.0,
            width: 150.0,
            height: 80.0,
            relative: false,
            ..Default::default()
        };

        let mut cmd = Command::MoveGroup(MoveGroupPayload::new(gid, new_geom));
        cmd.apply(&mut model).unwrap();

        // Verify geometry is now Some
        assert!(model.store.group(gid).unwrap().geometry.is_some());

        cmd.undo(&mut model).unwrap();

        // After undo, geometry should be None again
        let after_undo = model.store.group(gid).unwrap().geometry;
        assert!(after_undo.is_none());
    }

    #[test]
    fn apply_move_group_not_found_error() {
        let (mut model, _pid) = make_model_with_page();
        let bogus = diagram_core::GroupId::default();

        let new_geom = CellGeometry {
            x: 100.0,
            y: 200.0,
            width: 150.0,
            height: 80.0,
            relative: false,
            ..Default::default()
        };

        let mut cmd = Command::MoveGroup(MoveGroupPayload::new(bogus, new_geom));
        let err = cmd.apply(&mut model).unwrap_err();
        assert!(matches!(err, crate::error::CommandError::GroupNotFound(_)));
    }

    // ─── SetEdgeWaypoints ────────────────────────────────────────────────────

    #[test]
    fn apply_set_edge_waypoints_succeeds() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");

        let edge = Edge {
            source: v1,
            target: v2,
            page_id: Some(pid),
            waypoints: Vec::new(),
            ..Default::default()
        };
        let eid = model.store.insert_edge(edge);

        let new_waypoints = vec![
            diagram_core::geometry::Point { x: 0.0, y: 0.0 },
            diagram_core::geometry::Point { x: 50.0, y: 25.0 },
            diagram_core::geometry::Point { x: 100.0, y: 50.0 },
        ];

        let mut cmd =
            Command::SetEdgeWaypoints(SetEdgeWaypointsPayload::new(eid, new_waypoints.clone()));
        cmd.apply(&mut model).unwrap();

        let e = model.store.edge(eid).unwrap();
        assert_eq!(e.waypoints.len(), 3);
        assert_eq!(e.waypoints[0].x, 0.0);
        assert_eq!(e.waypoints[1].x, 50.0);
        assert_eq!(e.waypoints[2].x, 100.0);
    }

    #[test]
    fn undo_set_edge_waypoints_restores_original() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");

        let original_waypoints = vec![
            diagram_core::geometry::Point { x: 10.0, y: 20.0 },
            diagram_core::geometry::Point { x: 30.0, y: 40.0 },
        ];

        let edge = Edge {
            source: v1,
            target: v2,
            page_id: Some(pid),
            waypoints: original_waypoints.clone(),
            ..Default::default()
        };
        let eid = model.store.insert_edge(edge);

        let new_waypoints = vec![
            diagram_core::geometry::Point { x: 0.0, y: 0.0 },
            diagram_core::geometry::Point { x: 50.0, y: 25.0 },
        ];

        let mut cmd = Command::SetEdgeWaypoints(SetEdgeWaypointsPayload::new(eid, new_waypoints));
        cmd.apply(&mut model).unwrap();

        // Verify waypoints changed
        let after_apply = model.store.edge(eid).unwrap().waypoints.clone();
        assert_ne!(original_waypoints, after_apply);

        cmd.undo(&mut model).unwrap();

        // After undo, waypoints should be restored to original
        let after_undo = model.store.edge(eid).unwrap().waypoints.clone();
        assert_eq!(original_waypoints, after_undo);
    }

    #[test]
    fn undo_set_edge_waypoints_restores_empty() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");

        // Edge starts with empty waypoints
        let edge = Edge {
            source: v1,
            target: v2,
            page_id: Some(pid),
            waypoints: Vec::new(),
            ..Default::default()
        };
        let eid = model.store.insert_edge(edge);

        let new_waypoints = vec![
            diagram_core::geometry::Point { x: 0.0, y: 0.0 },
            diagram_core::geometry::Point { x: 50.0, y: 25.0 },
        ];

        let mut cmd = Command::SetEdgeWaypoints(SetEdgeWaypointsPayload::new(eid, new_waypoints));
        cmd.apply(&mut model).unwrap();

        // Verify waypoints changed
        assert!(!model.store.edge(eid).unwrap().waypoints.is_empty());

        cmd.undo(&mut model).unwrap();

        // After undo, waypoints should be empty again
        let after_undo = model.store.edge(eid).unwrap().waypoints.clone();
        assert!(after_undo.is_empty());
    }

    #[test]
    fn apply_set_edge_waypoints_not_found_error() {
        let (mut model, _pid) = make_model_with_page();
        let bogus = diagram_core::EdgeId::default();

        let new_waypoints = vec![diagram_core::geometry::Point { x: 0.0, y: 0.0 }];

        let mut cmd = Command::SetEdgeWaypoints(SetEdgeWaypointsPayload::new(bogus, new_waypoints));
        let err = cmd.apply(&mut model).unwrap_err();
        assert!(matches!(err, crate::error::CommandError::EdgeNotFound(_)));
    }

    // ─── EditVertexLabel ───────────────────────────────────────────────────────

    #[test]
    fn apply_edit_vertex_label_succeeds() {
        let (mut model, pid) = make_model_with_page();
        let vid = insert_vertex(&mut model, pid, "Original");

        let mut cmd = Command::EditVertexLabel(EditLabelPayload::new(vid, Some(Label::new("New"))));
        cmd.apply(&mut model).unwrap();

        let v = model.store.vertex(vid).unwrap();
        assert_eq!(v.label.as_ref().unwrap().as_str(), "New");
    }

    #[test]
    fn undo_edit_vertex_label_restores_original() {
        let (mut model, pid) = make_model_with_page();
        let vid = insert_vertex(&mut model, pid, "Original");

        let mut cmd = Command::EditVertexLabel(EditLabelPayload::new(vid, Some(Label::new("New"))));
        cmd.apply(&mut model).unwrap();
        cmd.undo(&mut model).unwrap();

        let v = model.store.vertex(vid).unwrap();
        assert_eq!(v.label.as_ref().unwrap().as_str(), "Original");
    }

    // ─── EditEdgeLabel ───────────────────────────────────────────────────────

    #[test]
    fn apply_edit_edge_label_succeeds() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");

        let edge = Edge {
            source: v1,
            target: v2,
            page_id: Some(pid),
            label: Some(Label::new("Original")),
            ..Default::default()
        };
        let eid = model.store.insert_edge(edge);

        let mut cmd =
            Command::EditEdgeLabel(EditEdgeLabelPayload::new(eid, Some(Label::new("New"))));
        cmd.apply(&mut model).unwrap();

        let e = model.store.edge(eid).unwrap();
        assert_eq!(e.label.as_ref().unwrap().as_str(), "New");
    }

    #[test]
    fn undo_edit_edge_label_restores_original() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");

        let edge = Edge {
            source: v1,
            target: v2,
            page_id: Some(pid),
            label: Some(Label::new("Original")),
            ..Default::default()
        };
        let eid = model.store.insert_edge(edge);

        let mut cmd =
            Command::EditEdgeLabel(EditEdgeLabelPayload::new(eid, Some(Label::new("New"))));
        cmd.apply(&mut model).unwrap();
        cmd.undo(&mut model).unwrap();

        let e = model.store.edge(eid).unwrap();
        assert_eq!(e.label.as_ref().unwrap().as_str(), "Original");
    }

    #[test]
    fn apply_edit_edge_label_not_found_error() {
        let (mut model, _pid) = make_model_with_page();
        let bogus = diagram_core::EdgeId::default();

        let mut cmd =
            Command::EditEdgeLabel(EditEdgeLabelPayload::new(bogus, Some(Label::new("New"))));
        let err = cmd.apply(&mut model).unwrap_err();
        assert!(matches!(err, crate::error::CommandError::EdgeNotFound(_)));
    }

    // ─── AddEdge ───────────────────────────────────────────────────────────────

    #[test]
    fn apply_add_edge_succeeds() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");

        let edge = Edge {
            source: v1,
            target: v2,
            page_id: Some(pid),
            ..Default::default()
        };

        let mut cmd = Command::AddEdge(AddEdgePayload::new(edge));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.len_edge(), 1);
    }

    #[test]
    fn apply_add_edge_dangling_guard() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let bogus = VertexId::default();

        let edge = Edge {
            source: v1,
            target: bogus,
            page_id: Some(pid),
            ..Default::default()
        };

        let mut cmd = Command::AddEdge(AddEdgePayload::new(edge));
        let err = cmd.apply(&mut model).unwrap_err();

        assert!(matches!(
            err,
            crate::error::CommandError::DanglingEdge(_, _)
        ));
        assert_eq!(model.store.len_edge(), 0); // model unchanged
    }

    #[test]
    fn undo_add_edge_removes_edge() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");

        let edge = Edge {
            source: v1,
            target: v2,
            page_id: Some(pid),
            ..Default::default()
        };

        let mut cmd = Command::AddEdge(AddEdgePayload::new(edge));
        cmd.apply(&mut model).unwrap();
        assert_eq!(model.store.len_edge(), 1);

        cmd.undo(&mut model).unwrap();
        assert_eq!(model.store.len_edge(), 0);
    }

    // ─── RemoveEdge ────────────────────────────────────────────────────────────

    #[test]
    fn apply_remove_edge_succeeds() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");

        let edge = Edge {
            source: v1,
            target: v2,
            page_id: Some(pid),
            ..Default::default()
        };
        let eid = model.store.insert_edge(edge);

        let mut cmd = Command::RemoveEdge(RemoveEdgePayload::new(eid));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.len_edge(), 0);
    }

    #[test]
    fn undo_remove_edge_restores_edge() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");

        let edge = Edge {
            source: v1,
            target: v2,
            page_id: Some(pid),
            label: Some(Label::new("MyEdge")),
            ..Default::default()
        };
        let eid = model.store.insert_edge(edge);
        let orig_label = model.store.edge(eid).unwrap().label.clone();

        let mut cmd = Command::RemoveEdge(RemoveEdgePayload::new(eid));
        cmd.apply(&mut model).unwrap();
        assert_eq!(model.store.len_edge(), 0);

        cmd.undo(&mut model).unwrap();
        assert_eq!(model.store.len_edge(), 1);
        let restored = model.store.edge(eid_from_model(&model, 0)).unwrap();
        assert_eq!(restored.label, orig_label);
    }

    // ─── ConnectVertices ────────────────────────────────────────────────────────

    #[test]
    fn apply_connect_vertices_succeeds() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");

        let mut cmd =
            Command::ConnectVertices(ConnectVerticesCommand::new(v1, v2, RoutingKind::Orthogonal));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.len_edge(), 1);
        // Edge was inserted with correct endpoints
        let edge_id = eid_from_model(&model, 0);
        let edge = model.store.edge(edge_id).unwrap();
        assert_eq!(edge.source, v1);
        assert_eq!(edge.target, v2);
        // Waypoints may or may not be computed depending on vertex geometry
        // (vertices without geometry fall back to empty waypoints gracefully)
    }

    #[test]
    fn apply_connect_vertices_self_loop() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");

        // Connecting a vertex to itself is allowed (creates a self-loop)
        // Routing may fail for self-loops (overlapping vertices error is caught gracefully)
        let mut cmd =
            Command::ConnectVertices(ConnectVerticesCommand::new(v1, v1, RoutingKind::Orthogonal));
        let result = cmd.apply(&mut model);
        // Edge is inserted even if routing fails (graceful degradation)
        assert!(result.is_ok());
        assert_eq!(model.store.len_edge(), 1);
    }

    #[test]
    fn undo_connect_vertices_removes_edge() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");

        let mut cmd =
            Command::ConnectVertices(ConnectVerticesCommand::new(v1, v2, RoutingKind::Orthogonal));
        cmd.apply(&mut model).unwrap();
        assert_eq!(model.store.len_edge(), 1);

        cmd.undo(&mut model).unwrap();
        assert_eq!(model.store.len_edge(), 0);
    }

    #[test]
    fn apply_connect_vertices_with_port_constraints() {
        use diagram_core::CellGeometry;
        use diagram_routing::Direction;

        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");

        // Set geometry so routing can compute waypoints
        if let Some(v) = model.store.vertex_mut(v1) {
            v.geometry = Some(CellGeometry {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 50.0,
                relative: false,
                rotation: 0.0,
                flip_h: false,
                flip_v: false,
            });
        }
        if let Some(v) = model.store.vertex_mut(v2) {
            v.geometry = Some(CellGeometry {
                x: 200.0,
                y: 0.0,
                width: 100.0,
                height: 50.0,
                relative: false,
                rotation: 0.0,
                flip_h: false,
                flip_v: false,
            });
        }

        // Connect with explicit port constraints (East -> West)
        let mut cmd = Command::ConnectVertices(ConnectVerticesCommand::with_ports(
            v1,
            v2,
            RoutingKind::Orthogonal,
            Some(Direction::East),
            Some(Direction::West),
        ));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.len_edge(), 1);
        let edge_id = eid_from_model(&model, 0);
        let edge = model.store.edge(edge_id).unwrap();
        assert_eq!(edge.source, v1);
        assert_eq!(edge.target, v2);
        // With port constraints, routing should produce waypoints
        // (geometry is set, so waypoints should be non-empty)
        assert!(!edge.waypoints.is_empty());
    }

    #[test]
    fn connect_vertices_invalid_source() {
        let (mut model, pid) = make_model_with_page();
        let v2 = insert_vertex(&mut model, pid, "V2");
        let bogus = VertexId::default();

        let mut cmd = Command::ConnectVertices(ConnectVerticesCommand::new(
            bogus,
            v2,
            RoutingKind::Orthogonal,
        ));
        let err = cmd.apply(&mut model).unwrap_err();
        assert!(matches!(err, crate::error::CommandError::VertexNotFound(_)));
        assert_eq!(model.store.len_edge(), 0); // model unchanged
    }

    #[test]
    fn connect_vertices_invalid_target() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let bogus = VertexId::default();

        let mut cmd = Command::ConnectVertices(ConnectVerticesCommand::new(
            v1,
            bogus,
            RoutingKind::Orthogonal,
        ));
        let err = cmd.apply(&mut model).unwrap_err();
        assert!(matches!(err, crate::error::CommandError::VertexNotFound(_)));
        assert_eq!(model.store.len_edge(), 0); // model unchanged
    }

    // ─── DisconnectEdge ────────────────────────────────────────────────────────

    #[test]
    fn apply_disconnect_edge_succeeds() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");

        let edge = Edge {
            source: v1,
            target: v2,
            page_id: Some(pid),
            waypoints: vec![diagram_core::geometry::Point { x: 0.0, y: 0.0 }],
            ..Default::default()
        };
        let eid = model.store.insert_edge(edge);

        let mut cmd = Command::DisconnectEdge(DisconnectEdgeCommand::new(eid));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.len_edge(), 0);
    }

    #[test]
    fn undo_disconnect_edge_restores_edge_with_waypoints() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");

        let edge = Edge {
            source: v1,
            target: v2,
            page_id: Some(pid),
            label: Some(Label::new("MyEdge")),
            waypoints: vec![diagram_core::geometry::Point { x: 10.0, y: 20.0 }],
            ..Default::default()
        };
        let eid = model.store.insert_edge(edge);
        let orig_label = model.store.edge(eid).unwrap().label.clone();
        let orig_waypoints = model.store.edge(eid).unwrap().waypoints.clone();

        let mut cmd = Command::DisconnectEdge(DisconnectEdgeCommand::new(eid));
        cmd.apply(&mut model).unwrap();
        assert_eq!(model.store.len_edge(), 0);

        cmd.undo(&mut model).unwrap();
        assert_eq!(model.store.len_edge(), 1);
        let restored = model.store.edge(eid_from_model(&model, 0)).unwrap();
        assert_eq!(restored.label, orig_label);
        assert_eq!(restored.waypoints, orig_waypoints);
    }

    #[test]
    fn disconnect_edge_invalid_id() {
        let (mut model, _pid) = make_model_with_page();
        let bogus = EdgeId::default();

        let mut cmd = Command::DisconnectEdge(DisconnectEdgeCommand::new(bogus));
        let err = cmd.apply(&mut model).unwrap_err();
        assert!(matches!(err, crate::error::CommandError::EdgeNotFound(_)));
    }

    // ─── ChangeStyle ───────────────────────────────────────────────────────────

    #[test]
    fn apply_change_style_succeeds() {
        let (mut model, pid) = make_model_with_page();
        let vid = insert_vertex(&mut model, pid, "Test");

        let mut style = StyleMap::new();
        style.insert("fillColor", StyleValue::from("red"));

        let mut cmd = Command::ChangeStyle(ChangeStylePayload::new(vid, style));
        cmd.apply(&mut model).unwrap();

        let v = model.store.vertex(vid).unwrap();
        assert!(v.style_id.is_some());
    }

    #[test]
    fn undo_change_style_restores_original() {
        let (mut model, pid) = make_model_with_page();
        let vid = insert_vertex(&mut model, pid, "Test");

        // Capture original style BEFORE apply
        let orig_style = model.store.vertex(vid).unwrap().style_id;

        let mut style = StyleMap::new();
        style.insert("fillColor", StyleValue::from("red"));

        let mut cmd = Command::ChangeStyle(ChangeStylePayload::new(vid, style));
        cmd.apply(&mut model).unwrap();

        // After apply, style is set
        let after_apply = model.store.vertex(vid).unwrap().style_id;
        assert_ne!(orig_style, after_apply);

        cmd.undo(&mut model).unwrap();

        // After undo, style should be restored to original
        let v = model.store.vertex(vid).unwrap();
        assert_eq!(v.style_id, orig_style);
    }

    // ─── AddGroup / RemoveGroup ────────────────────────────────────────────────

    #[test]
    fn apply_add_group_succeeds() {
        let (mut model, pid) = make_model_with_page();
        let g = Group {
            label: Some(Label::new("Group")),
            page_id: Some(pid),
            ..Default::default()
        };

        let mut cmd = Command::AddGroup(AddGroupPayload::new(g));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.len_group(), 1);
    }

    #[test]
    fn undo_add_group_removes_group() {
        let (mut model, pid) = make_model_with_page();
        let g = Group {
            label: Some(Label::new("Group")),
            page_id: Some(pid),
            ..Default::default()
        };

        let mut cmd = Command::AddGroup(AddGroupPayload::new(g));
        cmd.apply(&mut model).unwrap();
        assert_eq!(model.store.len_group(), 1);

        cmd.undo(&mut model).unwrap();
        assert_eq!(model.store.len_group(), 0);
    }

    #[test]
    fn apply_remove_group_orphans_children() {
        let (mut model, pid) = make_model_with_page();
        let gid = insert_group(&mut model, pid, "Group");
        let vid = insert_vertex_with_parent(&mut model, pid, gid, "Child");

        let mut cmd = Command::RemoveGroup(RemoveGroupPayload::new(gid));
        cmd.apply(&mut model).unwrap();

        // Group is gone
        assert_eq!(model.store.len_group(), 0);
        // Child vertex is still there but parent is now None
        assert_eq!(model.store.len_vertex(), 1);
        let child = model.store.vertex(vid).unwrap();
        assert_eq!(child.parent, None);
    }

    #[test]
    fn undo_remove_group_restores_parent_link() {
        let (mut model, pid) = make_model_with_page();
        let gid = insert_group(&mut model, pid, "Group");
        let vid = insert_vertex_with_parent(&mut model, pid, gid, "Child");

        let mut cmd = Command::RemoveGroup(RemoveGroupPayload::new(gid));
        cmd.apply(&mut model).unwrap();
        cmd.undo(&mut model).unwrap();

        // Group is back with NEW id
        assert_eq!(model.store.len_group(), 1);
        let new_gid = gid_from_model(&model, 0);
        let child = model.store.vertex(vid).unwrap();
        assert_eq!(child.parent, Some(new_gid));
    }

    // ─── AddPage / RemovePage ──────────────────────────────────────────────────

    #[test]
    fn apply_add_page_succeeds() {
        let mut model = DiagramModel::new();
        let page = Page::new(PageId::default());

        let mut cmd = Command::AddPage(AddPagePayload::new(page));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.page_count(), 1);
    }

    #[test]
    fn undo_add_page_removes_page() {
        let mut model = DiagramModel::new();
        let page = Page::new(PageId::default());

        let mut cmd = Command::AddPage(AddPagePayload::new(page));
        cmd.apply(&mut model).unwrap();
        assert_eq!(model.store.page_count(), 1);

        cmd.undo(&mut model).unwrap();
        assert_eq!(model.store.page_count(), 0);
    }

    #[test]
    fn apply_remove_page_cascades() {
        let (mut model, pid) = make_model_with_page();
        insert_vertex(&mut model, pid, "V1");
        insert_vertex(&mut model, pid, "V2");
        insert_group(&mut model, pid, "Group");

        let mut cmd = Command::RemovePage(RemovePagePayload::new(pid));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.page_count(), 0);
        assert_eq!(model.store.len_vertex(), 0);
        assert_eq!(model.store.len_group(), 0);
    }

    #[test]
    fn undo_remove_page_restores_all_cells_with_new_ids() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex(&mut model, pid, "V1");
        let v2 = insert_vertex(&mut model, pid, "V2");
        let _gid = insert_group(&mut model, pid, "Group");

        let edge = Edge {
            source: v1,
            target: v2,
            page_id: Some(pid),
            ..Default::default()
        };
        let _eid = model.store.insert_edge(edge);

        let mut cmd = Command::RemovePage(RemovePagePayload::new(pid));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.page_count(), 0);
        assert_eq!(model.store.len_vertex(), 0);
        assert_eq!(model.store.len_edge(), 0);
        assert_eq!(model.store.len_group(), 0);

        // Undo restores everything with new IDs
        cmd.undo(&mut model).unwrap();

        assert_eq!(model.store.page_count(), 1);
        assert_eq!(model.store.len_vertex(), 2);
        assert_eq!(model.store.len_edge(), 1);
        assert_eq!(model.store.len_group(), 1);

        // New page id
        let new_pid = pid_from_model(&model, 0);

        // All cells should be on the new page
        for (_vid, v) in model.store.vertices_with_ids() {
            assert_eq!(v.page_id, Some(new_pid));
        }
        for (_gid, g) in model.store.groups_with_ids() {
            assert_eq!(g.page_id, Some(new_pid));
        }

        // Edge should reference the new vertex IDs (look up IDs AFTER undo)
        let restored_edge = model.store.edge(eid_from_model(&model, 0)).unwrap();

        // Verify the edge's source and target are valid vertices in the model
        assert!(model.store.vertex(restored_edge.source).is_some());
        assert!(model.store.vertex(restored_edge.target).is_some());

        // Verify both vertices are on the new page
        assert_eq!(
            model.store.vertex(restored_edge.source).unwrap().page_id,
            Some(new_pid)
        );
        assert_eq!(
            model.store.vertex(restored_edge.target).unwrap().page_id,
            Some(new_pid)
        );

        // Verify there are exactly 2 vertices and the edge connects them
        assert_eq!(model.store.len_vertex(), 2);
        let vertices: Vec<_> = model.store.vertices_with_ids().collect();
        assert_eq!(vertices.len(), 2);
        // Edge should reference the two vertices
        let refs = [restored_edge.source, restored_edge.target];
        for v_ref in refs {
            assert!(vertices.iter().any(|(id, _)| *id == v_ref));
        }
    }

    // ─── RenamePage ────────────────────────────────────────────────────────────

    #[test]
    fn apply_rename_page_succeeds() {
        let (mut model, pid) = make_model_with_page();

        let mut cmd = Command::RenamePage(RenamePagePayload::new(pid, Label::new("New Name")));
        cmd.apply(&mut model).unwrap();

        let page = model.store.page(pid).unwrap();
        assert_eq!(page.name.as_ref().unwrap().as_str(), "New Name");
    }

    #[test]
    fn undo_rename_page_restores_original_name() {
        let (mut model, pid) = make_model_with_page();

        let mut cmd = Command::RenamePage(RenamePagePayload::new(pid, Label::new("New Name")));
        cmd.apply(&mut model).unwrap();
        cmd.undo(&mut model).unwrap();

        let page = model.store.page(pid).unwrap();
        assert!(page.name.is_none()); // Original had no name
    }

    // ─── Fuzz test (structural equivalence) ────────────────────────────────────

    #[test]
    fn fuzz_random_command_sequence_structural_equivalence() {
        // Simple splitmix64 RNG
        struct Rng {
            state: u64,
        }
        impl Rng {
            fn new(seed: u64) -> Self {
                Self { state: seed }
            }
            fn next(&mut self) -> u64 {
                self.state = self.state.wrapping_add(0x9e3779b97f4a7c15);
                let mut z = self.state;
                z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
                z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
                z ^ (z >> 31)
            }
            fn next_usize(&mut self, bound: usize) -> usize {
                (self.next() as usize) % bound
            }
        }

        let seeds = [
            0x12345678ABCDEFu64,
            0xDEADBEEF12345678u64,
            0xCAFEBABE1991A91Fu64,
        ];

        for &seed in &seeds {
            let mut rng = Rng::new(seed);

            let (mut model, pid) = make_model_with_page();

            // Build a shadow model with direct store access
            let mut shadow_vid_counter = 0usize;

            // We'll track that after undo chain, counts match
            let initial_counts = (
                model.store.page_count(),
                model.store.len_vertex(),
                model.store.len_edge(),
                model.store.len_group(),
            );

            // Generate and apply some commands
            let num_commands = 20;
            let mut commands: Vec<Command> = Vec::with_capacity(num_commands);

            for i in 0..num_commands {
                let r = rng.next_usize(6);
                match r {
                    0 => {
                        let v = Vertex {
                            label: Some(Label::new(format!("V{}", shadow_vid_counter))),
                            page_id: Some(pid),
                            ..Default::default()
                        };
                        shadow_vid_counter += 1;
                        commands.push(Command::AddVertex(AddVertexPayload::new(v)));
                    }
                    1 => {
                        if model.store.len_vertex() > 0 {
                            let vid =
                                vid_from_model(&model, rng.next_usize(model.store.len_vertex()));
                            commands.push(Command::RemoveVertex(RemoveVertexPayload::new(vid)));
                        }
                    }
                    2 => {
                        if model.store.len_vertex() > 0 {
                            let vid =
                                vid_from_model(&model, rng.next_usize(model.store.len_vertex()));
                            let geom = CellGeometry {
                                x: rng.next() as f64,
                                y: rng.next() as f64,
                                width: 100.0,
                                height: 50.0,
                                relative: false,
                                ..Default::default()
                            };
                            commands.push(Command::MoveVertex(MoveVertexPayload::new(vid, geom)));
                        }
                    }
                    3 => {
                        if model.store.len_vertex() > 0 {
                            let vid =
                                vid_from_model(&model, rng.next_usize(model.store.len_vertex()));
                            commands.push(Command::EditVertexLabel(EditLabelPayload::new(
                                vid,
                                Some(Label::new(format!("Label{}", i))),
                            )));
                        }
                    }
                    4 => {
                        if model.store.len_vertex() >= 2 {
                            let v1 =
                                vid_from_model(&model, rng.next_usize(model.store.len_vertex()));
                            let v2 =
                                vid_from_model(&model, rng.next_usize(model.store.len_vertex()));
                            if v1 != v2 {
                                let edge = Edge {
                                    source: v1,
                                    target: v2,
                                    page_id: Some(pid),
                                    ..Default::default()
                                };
                                commands.push(Command::AddEdge(AddEdgePayload::new(edge)));
                            }
                        }
                    }
                    5 if model.store.len_group() < 5 => {
                        let g = Group {
                            label: Some(Label::new(format!("G{}", i))),
                            page_id: Some(pid),
                            ..Default::default()
                        };
                        commands.push(Command::AddGroup(AddGroupPayload::new(g)));
                    }
                    _ => {}
                }
            }

            // Apply all commands
            for cmd in &mut commands {
                let _ = cmd.apply(&mut model);
            }

            // Undo all commands in reverse
            for cmd in commands.iter_mut().rev() {
                let _ = cmd.undo(&mut model);
            }

            // Structural equivalence: counts should match initial
            assert_eq!(
                model.store.page_count(),
                initial_counts.0,
                "seed {:?}: page count mismatch",
                seed
            );
            assert_eq!(
                model.store.len_vertex(),
                initial_counts.1,
                "seed {:?}: vertex count mismatch",
                seed
            );
            assert_eq!(
                model.store.len_edge(),
                initial_counts.2,
                "seed {:?}: edge count mismatch",
                seed
            );
            assert_eq!(
                model.store.len_group(),
                initial_counts.3,
                "seed {:?}: group count mismatch",
                seed
            );
        }
    }

    // ─── Z-order: max+1 on Add* ───────────────────────────────────────────────

    #[test]
    fn apply_add_vertex_first_on_page_assigns_z_order_zero() {
        let (mut model, pid) = make_model_with_page();
        let v = Vertex {
            label: Some(Label::new("First")),
            page_id: Some(pid),
            ..Default::default()
        };

        let mut cmd = Command::AddVertex(AddVertexPayload::new(v));
        cmd.apply(&mut model).unwrap();

        // First vertex on empty page: max=-1, so z_order = -1 + 1 = 0
        let vid = vid_from_model(&model, 0);
        let stored = model.store.vertex(vid).unwrap();
        assert_eq!(stored.z_order, 0);
    }

    #[test]
    fn apply_add_vertex_second_assigns_max_plus_one() {
        let (mut model, pid) = make_model_with_page();
        // First vertex with explicit z=5
        let v1 = Vertex {
            label: Some(Label::new("First")),
            page_id: Some(pid),
            z_order: 5,
            ..Default::default()
        };
        let _vid1 = model.store.insert_vertex(v1);

        // Second vertex via command
        let v2 = Vertex {
            label: Some(Label::new("Second")),
            page_id: Some(pid),
            ..Default::default()
        };
        let mut cmd = Command::AddVertex(AddVertexPayload::new(v2));
        cmd.apply(&mut model).unwrap();

        let vid2 = vid_from_model(&model, 1);
        let stored = model.store.vertex(vid2).unwrap();
        assert_eq!(stored.z_order, 6); // max(5) + 1 = 6
    }

    #[test]
    fn apply_add_edge_scans_all_kinds() {
        let (mut model, pid) = make_model_with_page();
        // Vertex z=3
        let v1 = Vertex {
            label: Some(Label::new("V1")),
            page_id: Some(pid),
            z_order: 3,
            ..Default::default()
        };
        let vid1 = model.store.insert_vertex(v1);

        // Edge z=7
        let e = Edge {
            source: vid1,
            target: vid1,
            page_id: Some(pid),
            z_order: 7,
            ..Default::default()
        };
        let _eid = model.store.insert_edge(e);

        // Add new edge via command
        let new_edge = Edge {
            source: vid1,
            target: vid1,
            page_id: Some(pid),
            ..Default::default()
        };
        let mut cmd = Command::AddEdge(AddEdgePayload::new(new_edge));
        cmd.apply(&mut model).unwrap();

        let eid2 = eid_from_model(&model, 1);
        let stored = model.store.edge(eid2).unwrap();
        assert_eq!(stored.z_order, 8); // max(3, 7) + 1 = 8
    }

    #[test]
    fn apply_add_group_scans_all_kinds() {
        let (mut model, pid) = make_model_with_page();
        // Vertex z=10
        let v = Vertex {
            label: Some(Label::new("V1")),
            page_id: Some(pid),
            z_order: 10,
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(v);

        // Add group via command
        let g = Group {
            label: Some(Label::new("Group")),
            page_id: Some(pid),
            ..Default::default()
        };
        let mut cmd = Command::AddGroup(AddGroupPayload::new(g));
        cmd.apply(&mut model).unwrap();

        let gid = gid_from_model(&model, 0);
        let stored = model.store.group(gid).unwrap();
        assert_eq!(stored.z_order, 11); // max(10) + 1 = 11
    }

    // ─── Z-order: ordering commands ──────────────────────────────────────────

    #[test]
    fn bring_to_front_moves_to_top() {
        let (mut model, pid) = make_model_with_page();
        // Vertices with z={1,3,5,7}
        let _v1 = insert_vertex_with_z(&mut model, pid, "v1", 1);
        let v2 = insert_vertex_with_z(&mut model, pid, "v2", 3);
        let _v3 = insert_vertex_with_z(&mut model, pid, "v3", 5);
        let _v4 = insert_vertex_with_z(&mut model, pid, "v4", 7);

        // Bring v2 (z=3) to front
        let mut cmd = Command::BringToFront(BringToFrontPayload::new(CellTarget::Vertex(v2)));
        cmd.apply(&mut model).unwrap();

        let v = model.store.vertex(v2).unwrap();
        assert_eq!(v.z_order, 8); // max({1,3,5,7}) + 1 = 8
    }

    #[test]
    fn bring_to_front_topmost_is_noop() {
        let (mut model, pid) = make_model_with_page();
        // Vertices with z={1,3,5,7}, v4 is topmost with z=7
        let v4 = insert_vertex_with_z(&mut model, pid, "v4", 7);

        let mut cmd = Command::BringToFront(BringToFrontPayload::new(CellTarget::Vertex(v4)));
        cmd.apply(&mut model).unwrap();

        let v = model.store.vertex(v4).unwrap();
        // Still 7 because it was already topmost
        assert_eq!(v.z_order, 7);
    }

    #[test]
    fn send_to_back_moves_to_bottom() {
        let (mut model, pid) = make_model_with_page();
        // Vertices with z={2,4,6,8}
        let _v1 = insert_vertex_with_z(&mut model, pid, "v1", 2);
        let _v2 = insert_vertex_with_z(&mut model, pid, "v2", 4);
        let v3 = insert_vertex_with_z(&mut model, pid, "v3", 6);
        let _v4 = insert_vertex_with_z(&mut model, pid, "v4", 8);

        // Send v3 (z=6) to back
        let mut cmd = Command::SendToBack(SendToBackPayload::new(CellTarget::Vertex(v3)));
        cmd.apply(&mut model).unwrap();

        let v = model.store.vertex(v3).unwrap();
        assert_eq!(v.z_order, 1); // min({2,4,6,8}) - 1 = 1
    }

    #[test]
    fn send_to_back_bottom_is_noop() {
        let (mut model, pid) = make_model_with_page();
        // Vertices with z={2,4,6,8}, v1 is bottom with z=2
        let v1 = insert_vertex_with_z(&mut model, pid, "v1", 2);

        let mut cmd = Command::SendToBack(SendToBackPayload::new(CellTarget::Vertex(v1)));
        cmd.apply(&mut model).unwrap();

        let v = model.store.vertex(v1).unwrap();
        assert_eq!(v.z_order, 2);
    }

    #[test]
    fn send_to_back_permits_negative() {
        let (mut model, pid) = make_model_with_page();
        // Vertices with z={0, 5, 10}
        let _v1 = insert_vertex_with_z(&mut model, pid, "v1", 0);
        let v2 = insert_vertex_with_z(&mut model, pid, "v2", 5);
        let _v3 = insert_vertex_with_z(&mut model, pid, "v3", 10);

        // Send v2 (z=5) to back
        let mut cmd = Command::SendToBack(SendToBackPayload::new(CellTarget::Vertex(v2)));
        cmd.apply(&mut model).unwrap();

        let v = model.store.vertex(v2).unwrap();
        assert_eq!(v.z_order, -1); // min({0,5,10}) - 1 = -1
    }

    #[test]
    fn bring_forward_swaps_with_next() {
        let (mut model, pid) = make_model_with_page();
        // Vertices with z={1, 2, 3}
        let v1 = insert_vertex_with_z(&mut model, pid, "v1", 1);
        let v2 = insert_vertex_with_z(&mut model, pid, "v2", 2);
        let _v3 = insert_vertex_with_z(&mut model, pid, "v3", 3);

        // Bring v1 forward (swap with v2)
        let mut cmd = Command::BringForward(BringForwardPayload::new(CellTarget::Vertex(v1)));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.vertex(v1).unwrap().z_order, 2);
        assert_eq!(model.store.vertex(v2).unwrap().z_order, 1);
    }

    #[test]
    fn bring_forward_topmost_is_noop() {
        let (mut model, pid) = make_model_with_page();
        // Vertices with z={1, 2, 3}, v3 is topmost
        let v3 = insert_vertex_with_z(&mut model, pid, "v3", 3);

        let mut cmd = Command::BringForward(BringForwardPayload::new(CellTarget::Vertex(v3)));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.vertex(v3).unwrap().z_order, 3);
    }

    #[test]
    fn send_backward_swaps_with_prev() {
        let (mut model, pid) = make_model_with_page();
        // Vertices with z={1, 2, 3}
        let _v1 = insert_vertex_with_z(&mut model, pid, "v1", 1);
        let v2 = insert_vertex_with_z(&mut model, pid, "v2", 2);
        let v3 = insert_vertex_with_z(&mut model, pid, "v3", 3);

        // Send v3 backward (swap with v2)
        let mut cmd = Command::SendBackward(SendBackwardPayload::new(CellTarget::Vertex(v3)));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.vertex(v3).unwrap().z_order, 2);
        assert_eq!(model.store.vertex(v2).unwrap().z_order, 3);
    }

    #[test]
    fn send_backward_bottom_is_noop() {
        let (mut model, pid) = make_model_with_page();
        // Vertices with z={1, 2, 3}, v1 is bottom
        let v1 = insert_vertex_with_z(&mut model, pid, "v1", 1);

        let mut cmd = Command::SendBackward(SendBackwardPayload::new(CellTarget::Vertex(v1)));
        cmd.apply(&mut model).unwrap();

        assert_eq!(model.store.vertex(v1).unwrap().z_order, 1);
    }

    #[test]
    fn undo_bring_to_front_restores_prev_z() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex_with_z(&mut model, pid, "v1", 3);
        let v2 = insert_vertex_with_z(&mut model, pid, "v2", 5);

        let mut cmd = Command::BringToFront(BringToFrontPayload::new(CellTarget::Vertex(v1)));
        cmd.apply(&mut model).unwrap();
        assert_eq!(model.store.vertex(v1).unwrap().z_order, 6);

        cmd.undo(&mut model).unwrap();
        assert_eq!(model.store.vertex(v1).unwrap().z_order, 3);
        assert_eq!(model.store.vertex(v2).unwrap().z_order, 5); // v2 unchanged
    }

    #[test]
    fn undo_bring_forward_restores_both() {
        let (mut model, pid) = make_model_with_page();
        let v1 = insert_vertex_with_z(&mut model, pid, "v1", 1);
        let v2 = insert_vertex_with_z(&mut model, pid, "v2", 2);

        let mut cmd = Command::BringForward(BringForwardPayload::new(CellTarget::Vertex(v1)));
        cmd.apply(&mut model).unwrap();
        assert_eq!(model.store.vertex(v1).unwrap().z_order, 2);
        assert_eq!(model.store.vertex(v2).unwrap().z_order, 1);

        cmd.undo(&mut model).unwrap();
        assert_eq!(model.store.vertex(v1).unwrap().z_order, 1);
        assert_eq!(model.store.vertex(v2).unwrap().z_order, 2);
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    fn insert_vertex(model: &mut DiagramModel, pid: PageId, label: &str) -> VertexId {
        let v = Vertex {
            label: Some(Label::new(label)),
            page_id: Some(pid),
            ..Default::default()
        };
        model.store.insert_vertex(v)
    }

    fn insert_vertex_with_z(
        model: &mut DiagramModel,
        pid: PageId,
        label: &str,
        z: i32,
    ) -> VertexId {
        let v = Vertex {
            label: Some(Label::new(label)),
            page_id: Some(pid),
            z_order: z,
            ..Default::default()
        };
        model.store.insert_vertex(v)
    }

    fn insert_group(model: &mut DiagramModel, pid: PageId, label: &str) -> diagram_core::GroupId {
        let g = Group {
            label: Some(Label::new(label)),
            page_id: Some(pid),
            ..Default::default()
        };
        model.store.insert_group(g)
    }

    fn insert_vertex_with_parent(
        model: &mut DiagramModel,
        pid: PageId,
        parent: diagram_core::GroupId,
        label: &str,
    ) -> VertexId {
        let v = Vertex {
            label: Some(Label::new(label)),
            page_id: Some(pid),
            parent: Some(parent),
            ..Default::default()
        };
        model.store.insert_vertex(v)
    }

    fn vid_from_model(model: &DiagramModel, index: usize) -> VertexId {
        model.store.vertices_with_ids().nth(index).unwrap().0
    }

    fn eid_from_model(model: &DiagramModel, index: usize) -> EdgeId {
        model.store.edges_with_ids().nth(index).unwrap().0
    }

    fn gid_from_model(model: &DiagramModel, index: usize) -> diagram_core::GroupId {
        model.store.groups_with_ids().nth(index).unwrap().0
    }

    fn pid_from_model(model: &DiagramModel, index: usize) -> PageId {
        model.store.pages_with_ids().nth(index).unwrap().0
    }
}
