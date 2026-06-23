//! Integration tests for Editor workflow and Transaction builder.
//!
//! Tests:
//! - 3.3: Editor workflow (execute, undo, redo)
//! - 3.4: Transaction builder (atomic commit, rollback)
//! - 3.6: Advisory ceiling warning

use diagram_commands::{Command, Editor, Transaction};
use diagram_core::geometry::{CellGeometry, Point};
use diagram_core::label::Label;
use diagram_core::{DiagramModel, Edge, Group, Page, PageId, Vertex, VertexId};

fn make_model_with_page() -> (DiagramModel, PageId) {
    let mut model = DiagramModel::new();
    let page = Page::new(PageId::default());
    let pid = model.store.insert_page(page);
    if let Some(p) = model.store.page_mut(pid) {
        p.id = pid;
    }
    (model, pid)
}

// ─── Editor Workflow Tests ────────────────────────────────────────────────────

#[test]
fn execute_undo_redo_single_command() {
    let (model, pid) = make_model_with_page();
    let mut editor = Editor::new(model);

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

    let cmd = Command::AddVertex(diagram_commands::AddVertexPayload::new(v));

    // Execute
    editor.execute(cmd.clone()).unwrap();
    assert_eq!(editor.model().store.len_vertex(), 1);
    assert!(editor.can_undo());
    assert!(!editor.can_redo());

    // Undo
    editor.undo().unwrap();
    assert_eq!(editor.model().store.len_vertex(), 0);
    assert!(!editor.can_undo());
    assert!(editor.can_redo());

    // Redo
    editor.redo().unwrap();
    assert_eq!(editor.model().store.len_vertex(), 1);
    assert!(editor.can_undo());
    assert!(!editor.can_redo());
}

#[test]
fn undo_then_execute_clears_redo_stack() {
    let (model, pid) = make_model_with_page();
    let mut editor = Editor::new(model);

    let make_cmd = |label: &str| {
        let v = Vertex {
            label: Some(Label::new(label)),
            page_id: Some(pid),
            ..Default::default()
        };
        Command::AddVertex(diagram_commands::AddVertexPayload::new(v))
    };

    editor.execute(make_cmd("V1")).unwrap();
    editor.execute(make_cmd("V2")).unwrap();
    assert_eq!(editor.model().store.len_vertex(), 2);

    // Undo once
    editor.undo().unwrap();
    assert_eq!(editor.model().store.len_vertex(), 1);

    // Execute new command - should clear redo stack
    editor.execute(make_cmd("V3")).unwrap();
    assert_eq!(editor.model().store.len_vertex(), 2);

    // Redo should be a no-op (redo stack was cleared)
    editor.redo().unwrap();
    assert_eq!(editor.model().store.len_vertex(), 2);
}

#[test]
fn undo_past_beginning_is_noop() {
    let (model, pid) = make_model_with_page();
    let mut editor = Editor::new(model);

    let v = Vertex {
        label: Some(Label::new("V")),
        page_id: Some(pid),
        ..Default::default()
    };
    let cmd = Command::AddVertex(diagram_commands::AddVertexPayload::new(v));

    editor.execute(cmd).unwrap();
    assert_eq!(editor.model().store.len_vertex(), 1);

    // Undo once
    editor.undo().unwrap();
    assert_eq!(editor.model().store.len_vertex(), 0);
    assert!(!editor.can_undo());

    // Undo again - should be no-op
    editor.undo().unwrap();
    assert_eq!(editor.model().store.len_vertex(), 0);
}

#[test]
fn redo_past_end_is_noop() {
    let (model, pid) = make_model_with_page();
    let mut editor = Editor::new(model);

    let v = Vertex {
        label: Some(Label::new("V")),
        page_id: Some(pid),
        ..Default::default()
    };
    let cmd = Command::AddVertex(diagram_commands::AddVertexPayload::new(v));

    editor.execute(cmd).unwrap();
    // After execute: cursor=1, entries.len()=1, can_undo=true, can_redo=false
    assert!(editor.can_undo());
    assert!(!editor.can_redo());

    editor.undo().unwrap();
    // After undo: cursor=0, entries.len()=1, can_undo=false, can_redo=true
    assert!(!editor.can_undo());
    assert!(editor.can_redo());

    // Redo - should work
    editor.redo().unwrap();
    assert_eq!(editor.model().store.len_vertex(), 1);
    // After redo: cursor=1, entries.len()=1, can_undo=true, can_redo=false
    assert!(editor.can_undo());
    assert!(!editor.can_redo());

    // Redo again - should be no-op (past end)
    editor.redo().unwrap();
    assert_eq!(editor.model().store.len_vertex(), 1);
    assert!(!editor.can_redo());
}

#[test]
fn editor_undo_restores_structural_equivalence() {
    let (model, pid) = make_model_with_page();
    let mut editor = Editor::new(model);

    // Add multiple items
    for i in 0..5 {
        let v = Vertex {
            label: Some(Label::new(format!("V{}", i))),
            page_id: Some(pid),
            ..Default::default()
        };
        editor
            .execute(Command::AddVertex(diagram_commands::AddVertexPayload::new(
                v,
            )))
            .unwrap();
    }

    // Add a group
    let g = Group {
        label: Some(Label::new("Group")),
        page_id: Some(pid),
        ..Default::default()
    };
    editor
        .execute(Command::AddGroup(diagram_commands::AddGroupPayload::new(g)))
        .unwrap();

    // Add edge between vertices
    let vid1 = editor.model().store.vertices_with_ids().next().unwrap().0;
    let vid2 = editor.model().store.vertices_with_ids().nth(1).unwrap().0;
    let edge = Edge {
        source: vid1,
        target: vid2,
        page_id: Some(pid),
        ..Default::default()
    };
    editor
        .execute(Command::AddEdge(diagram_commands::AddEdgePayload::new(
            edge,
        )))
        .unwrap();

    let initial_counts = (
        editor.model().store.len_vertex(),
        editor.model().store.len_edge(),
        editor.model().store.len_group(),
    );
    assert_eq!(initial_counts, (5, 1, 1));

    // Undo all commands
    for _ in 0..7 {
        editor.undo().unwrap();
    }

    // Should be back to empty (just the page)
    assert_eq!(editor.model().store.len_vertex(), 0);
    assert_eq!(editor.model().store.len_edge(), 0);
    assert_eq!(editor.model().store.len_group(), 0);
    assert_eq!(editor.model().store.page_count(), 1);
}

// ─── Transaction Builder Tests ─────────────────────────────────────────────────

#[test]
fn transaction_groups_one_undo_step() {
    let (model, pid) = make_model_with_page();
    let mut editor = Editor::new(model);

    let v1 = Vertex {
        label: Some(Label::new("V1")),
        page_id: Some(pid),
        ..Default::default()
    };
    let v2 = Vertex {
        label: Some(Label::new("V2")),
        page_id: Some(pid),
        ..Default::default()
    };

    Transaction::new()
        .add_vertex(v1)
        .add_vertex(v2)
        .commit(&mut editor)
        .unwrap();

    assert_eq!(editor.model().store.len_vertex(), 2);
    assert!(editor.can_undo());
    assert!(!editor.can_redo());

    // One undo removes both vertices
    editor.undo().unwrap();
    assert_eq!(editor.model().store.len_vertex(), 0);
}

#[test]
fn transaction_rollback_on_partial_failure() {
    let (model, pid) = make_model_with_page();
    let mut editor = Editor::new(model);

    // Valid vertex
    let v1 = Vertex {
        label: Some(Label::new("V1")),
        page_id: Some(pid),
        ..Default::default()
    };

    // Invalid edge - dangling target (vertex that doesn't exist)
    let bogus_target = VertexId::default();
    let edge = Edge {
        source: bogus_target,
        target: bogus_target,
        page_id: Some(pid),
        ..Default::default()
    };

    let result = Transaction::new()
        .add_vertex(v1)
        .add_edge(edge)
        .commit(&mut editor);

    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(matches!(
        err,
        diagram_commands::CommandError::TransactionAborted { applied: 1 }
    ));

    // Model should be unchanged (AddVertex was rolled back)
    assert_eq!(editor.model().store.len_vertex(), 0);
    assert!(!editor.can_undo());
}

#[test]
fn transaction_rollback_does_not_pollute_history() {
    let (model, pid) = make_model_with_page();
    let mut editor = Editor::new(model);

    let v = Vertex {
        label: Some(Label::new("V")),
        page_id: Some(pid),
        ..Default::default()
    };

    // Failed transaction
    let _ = Transaction::new()
        .add_vertex(v)
        .add_edge(Edge {
            source: VertexId::default(),
            target: VertexId::default(),
            page_id: Some(pid),
            ..Default::default()
        })
        .commit(&mut editor);

    assert!(!editor.can_undo());
    assert!(!editor.can_redo());

    // Can still execute normally
    let v2 = Vertex {
        label: Some(Label::new("V2")),
        page_id: Some(pid),
        ..Default::default()
    };
    editor
        .execute(Command::AddVertex(diagram_commands::AddVertexPayload::new(
            v2,
        )))
        .unwrap();

    assert!(editor.can_undo());
    assert!(!editor.can_redo());
}

#[test]
fn transaction_empty_commit() {
    let (model, _pid) = make_model_with_page();
    let mut editor = Editor::new(model);

    let result = Transaction::new().commit(&mut editor);
    assert!(result.is_ok());
    assert!(!editor.can_undo());
    assert!(!editor.can_redo());
}

#[test]
fn transaction_partial_rollback_then_successful_commit() {
    let (model, pid) = make_model_with_page();
    let mut editor = Editor::new(model);

    let v1 = Vertex {
        label: Some(Label::new("V1")),
        page_id: Some(pid),
        ..Default::default()
    };
    let v2 = Vertex {
        label: Some(Label::new("V2")),
        page_id: Some(pid),
        ..Default::default()
    };

    // First transaction fails
    let _ = Transaction::new()
        .add_vertex(v1)
        .add_edge(Edge {
            source: VertexId::default(),
            target: VertexId::default(),
            page_id: Some(pid),
            ..Default::default()
        })
        .commit(&mut editor);

    // Second transaction succeeds
    Transaction::new()
        .add_vertex(v2)
        .commit(&mut editor)
        .unwrap();

    assert_eq!(editor.model().store.len_vertex(), 1);
    assert!(editor.can_undo());
}

#[test]
fn transaction_move_group_commits_both_undo_reverts_both() {
    let (model, pid) = make_model_with_page();
    let mut editor = Editor::new(model);

    let g1 = Group {
        label: Some(Label::new("G1")),
        page_id: Some(pid),
        geometry: Some(CellGeometry {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 50.0,
            relative: false,
            ..Default::default()
        }),
        ..Default::default()
    };
    let g2 = Group {
        label: Some(Label::new("G2")),
        page_id: Some(pid),
        geometry: Some(CellGeometry {
            x: 200.0,
            y: 0.0,
            width: 100.0,
            height: 50.0,
            relative: false,
            ..Default::default()
        }),
        ..Default::default()
    };

    // Add groups first
    Transaction::new()
        .add_group(g1)
        .add_group(g2)
        .commit(&mut editor)
        .unwrap();

    let gid1 = editor.model().store.groups_with_ids().next().unwrap().0;
    let gid2 = editor.model().store.groups_with_ids().nth(1).unwrap().0;

    // Move both groups in a single transaction
    let new_geom1 = CellGeometry {
        x: 50.0,
        y: 100.0,
        width: 100.0,
        height: 50.0,
        relative: false,
        ..Default::default()
    };
    let new_geom2 = CellGeometry {
        x: 250.0,
        y: 100.0,
        width: 100.0,
        height: 50.0,
        relative: false,
        ..Default::default()
    };

    Transaction::new()
        .move_group(gid1, new_geom1)
        .move_group(gid2, new_geom2)
        .commit(&mut editor)
        .unwrap();

    // Both groups should have moved
    assert_eq!(
        editor
            .model()
            .store
            .group(gid1)
            .unwrap()
            .geometry
            .as_ref()
            .unwrap()
            .x,
        50.0
    );
    assert_eq!(
        editor
            .model()
            .store
            .group(gid2)
            .unwrap()
            .geometry
            .as_ref()
            .unwrap()
            .x,
        250.0
    );

    // One undo reverts both
    editor.undo().unwrap();
    assert_eq!(
        editor
            .model()
            .store
            .group(gid1)
            .unwrap()
            .geometry
            .as_ref()
            .unwrap()
            .x,
        0.0
    );
    assert_eq!(
        editor
            .model()
            .store
            .group(gid2)
            .unwrap()
            .geometry
            .as_ref()
            .unwrap()
            .x,
        200.0
    );
}

#[test]
fn transaction_set_edge_waypoints_commit_and_undo() {
    let (model, pid) = make_model_with_page();
    let mut editor = Editor::new(model);

    let v1 = Vertex {
        label: Some(Label::new("V1")),
        page_id: Some(pid),
        ..Default::default()
    };
    let v2 = Vertex {
        label: Some(Label::new("V2")),
        page_id: Some(pid),
        ..Default::default()
    };

    // Add vertices and edge
    Transaction::new()
        .add_vertex(v1)
        .add_vertex(v2)
        .commit(&mut editor)
        .unwrap();

    let vid1 = editor.model().store.vertices_with_ids().next().unwrap().0;
    let vid2 = editor.model().store.vertices_with_ids().nth(1).unwrap().0;

    let edge = Edge {
        source: vid1,
        target: vid2,
        page_id: Some(pid),
        waypoints: Vec::new(),
        ..Default::default()
    };

    Transaction::new()
        .add_edge(edge)
        .commit(&mut editor)
        .unwrap();

    let eid = editor.model().store.edges_with_ids().next().unwrap().0;

    // Set waypoints in a transaction
    let waypoints = vec![
        Point { x: 0.0, y: 0.0 },
        Point { x: 50.0, y: 25.0 },
        Point { x: 100.0, y: 50.0 },
    ];

    Transaction::new()
        .set_edge_waypoints(eid, waypoints)
        .commit(&mut editor)
        .unwrap();

    // Waypoints should be set
    assert_eq!(editor.model().store.edge(eid).unwrap().waypoints.len(), 3);

    // Undo should restore original (empty)
    editor.undo().unwrap();
    assert!(editor.model().store.edge(eid).unwrap().waypoints.is_empty());
}

// ─── Advisory Ceiling Test ────────────────────────────────────────────────────

#[test]
fn advisory_ceiling_warning_no_crash() {
    let mut model = DiagramModel::new();

    // Create a page for the vertices
    let page = Page::new(PageId::default());
    let pid = model.store.insert_page(page);
    if let Some(p) = model.store.page_mut(pid) {
        p.id = pid;
    }

    let mut editor = Editor::new(model);

    // Push enough commands to exceed 10K without crashing
    for i in 0..10_005 {
        let v = Vertex {
            label: Some(Label::new(format!("V{}", i))),
            page_id: Some(pid),
            ..Default::default()
        };
        editor
            .execute(Command::AddVertex(diagram_commands::AddVertexPayload::new(
                v,
            )))
            .unwrap();
    }

    // Should have all vertices
    assert_eq!(editor.model().store.len_vertex(), 10_005);
}
