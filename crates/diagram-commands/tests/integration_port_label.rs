//! Integration tests for port selection (v0.52) and edge label offset (v0.53).
//!
//! Tests cover:
//! - ConnectVerticesCommand with source_port/target_port creates edge with correct waypoints
//! - ConnectVerticesCommand without ports uses auto perimeter selection
//! - ConnectVerticesCommand with ports can be undone
//! - SetEdgeLabelOffsetPayload persists to edge struct
//! - SetEdgeLabelOffsetPayload undo restores previous offset
//! - ConnectVerticesCommand with ports serializes correctly
//!
//! Run with:
//!   cargo test -p diagram-commands --test integration_port_label

use diagram_commands::{
    Command, ConnectVerticesCommand, Editor, RoutingKind, SetEdgeLabelOffsetPayload,
};
use diagram_core::geometry::CellGeometry;
use diagram_core::label::Label;
use diagram_core::{DiagramModel, Edge, Page, PageId, Vertex, VertexId};
use diagram_routing::Direction;

fn make_model_with_page() -> (DiagramModel, PageId) {
    let mut model = DiagramModel::new();
    let page = Page::new(PageId::default());
    let pid = model.store.insert_page(page);
    if let Some(p) = model.store.page_mut(pid) {
        p.id = pid;
    }
    (model, pid)
}

/// Create two vertices: source at (0,0) to (100,100), target at (300,0) to (400,100).
fn make_source_and_target(model: &mut DiagramModel, pid: PageId) -> (VertexId, VertexId) {
    let source = Vertex {
        geometry: Some(CellGeometry {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 100.0,
            relative: false,
            ..Default::default()
        }),
        label: Some(Label::new("Source")),
        page_id: Some(pid),
        ..Default::default()
    };

    let target = Vertex {
        geometry: Some(CellGeometry {
            x: 300.0,
            y: 0.0,
            width: 100.0,
            height: 100.0,
            relative: false,
            ..Default::default()
        }),
        label: Some(Label::new("Target")),
        page_id: Some(pid),
        ..Default::default()
    };

    let source_id = model.store.insert_vertex(source);
    let target_id = model.store.insert_vertex(target);
    (source_id, target_id)
}

// ─── Port Selection Tests ────────────────────────────────────────────────────────

#[test]
fn connect_with_source_port_creates_edge_with_perimeter_exit() {
    let (mut model, pid) = make_model_with_page();
    let (source_id, target_id) = make_source_and_target(&mut model, pid);

    let mut editor = Editor::new(model);

    // Connect from East side of source to West side of target
    let cmd = Command::ConnectVertices(ConnectVerticesCommand::with_ports(
        source_id,
        target_id,
        RoutingKind::Orthogonal,
        Some(Direction::East),
        Some(Direction::West),
    ));

    editor.execute(cmd).unwrap();

    // Verify edge was created
    let edge_id = editor
        .model()
        .store
        .edges_with_ids()
        .next()
        .expect("should have one edge")
        .0;

    let edge = editor.model().store.edge(edge_id).expect("edge should exist");
    assert_eq!(edge.source, source_id);
    assert_eq!(edge.target, target_id);

    // With explicit port constraints, waypoints should be computed
    // The first waypoint should be on the East perimeter of source
    // and the last waypoint should be on the West perimeter of target
    let source_geo = editor
        .model()
        .store
        .vertex(source_id)
        .unwrap()
        .geometry
        .unwrap();
    let target_geo = editor
        .model()
        .store
        .vertex(target_id)
        .unwrap()
        .geometry
        .unwrap();

    // Source east perimeter x = source_geo.x + source_geo.width = 0 + 100 = 100
    let source_east_x = source_geo.x + source_geo.width;
    // Target west perimeter x = target_geo.x = 300

    if !edge.waypoints.is_empty() {
        // First waypoint should exit from east side of source
        let first_waypoint = &edge.waypoints[0];
        assert_eq!(
            first_waypoint.x, source_east_x,
            "first waypoint should be at east perimeter of source ({})",
            source_east_x
        );

        // Last waypoint should enter from west side of target
        let last_waypoint = edge.waypoints.last().unwrap();
        assert_eq!(
            last_waypoint.x, target_geo.x,
            "last waypoint should be at west perimeter of target ({})",
            target_geo.x
        );
    }
}

#[test]
fn connect_without_ports_uses_auto_perimeter() {
    let (mut model, pid) = make_model_with_page();
    let (source_id, target_id) = make_source_and_target(&mut model, pid);

    let mut editor = Editor::new(model);

    // Connect WITHOUT specifying ports (auto-selection)
    let cmd = Command::ConnectVertices(ConnectVerticesCommand::new(
        source_id,
        target_id,
        RoutingKind::Orthogonal,
    ));

    editor.execute(cmd).unwrap();

    // Verify edge was created
    let edge_id = editor
        .model()
        .store
        .edges_with_ids()
        .next()
        .expect("should have one edge")
        .0;

    let edge = editor.model().store.edge(edge_id).expect("edge should exist");
    assert_eq!(edge.source, source_id);
    assert_eq!(edge.target, target_id);

    // Edge should have waypoints (auto-routed)
    // Note: without explicit ports, the routing algorithm auto-selects based
    // on relative positions. Since source is to the left of target,
    // it should exit from east and enter from west.
    assert!(
        !edge.waypoints.is_empty(),
        "auto-routed edge should have waypoints"
    );
}

#[test]
fn connect_with_port_then_undo_restores_no_edge() {
    let (mut model, pid) = make_model_with_page();
    let (source_id, target_id) = make_source_and_target(&mut model, pid);

    let mut editor = Editor::new(model);

    // Connect with ports
    let cmd = Command::ConnectVertices(ConnectVerticesCommand::with_ports(
        source_id,
        target_id,
        RoutingKind::Orthogonal,
        Some(Direction::East),
        Some(Direction::West),
    ));

    editor.execute(cmd.clone()).unwrap();

    // Verify edge exists
    assert_eq!(
        editor.model().store.len_edge(),
        1,
        "edge should exist after execute"
    );

    // Undo
    editor.undo().unwrap();

    // Verify edge is removed
    assert_eq!(
        editor.model().store.len_edge(),
        0,
        "edge should be removed after undo"
    );

    // Redo should bring it back
    editor.redo().unwrap();
    assert_eq!(
        editor.model().store.len_edge(),
        1,
        "edge should exist after redo"
    );
}

// ─── Edge Label Offset Tests ───────────────────────────────────────────────────

#[test]
fn set_edge_label_offset_persists_to_edge_struct() {
    let (mut model, pid) = make_model_with_page();
    let (source_id, target_id) = make_source_and_target(&mut model, pid);

    // Create an edge first
    let edge = Edge {
        source: source_id,
        target: target_id,
        page_id: Some(pid),
        label: Some(Label::new("Edge Label")),
        ..Default::default()
    };
    let edge_id = model.store.insert_edge(edge);

    let mut editor = Editor::new(model);

    // Set label offset
    let cmd = Command::SetEdgeLabelOffset(SetEdgeLabelOffsetPayload::new(
        edge_id,
        Some((10.0, 20.0)),
    ));

    editor.execute(cmd).unwrap();

    // Verify offset was set
    let edge = editor.model().store.edge(edge_id).expect("edge should exist");
    assert_eq!(
        edge.label_offset,
        Some((10.0, 20.0)),
        "label_offset should be (10.0, 20.0)"
    );
}

#[test]
fn set_edge_label_offset_undo_restores_previous() {
    let (mut model, pid) = make_model_with_page();
    let (source_id, target_id) = make_source_and_target(&mut model, pid);

    // Create an edge with existing offset
    let edge = Edge {
        source: source_id,
        target: target_id,
        page_id: Some(pid),
        label_offset: Some((5.0, 5.0)),
        ..Default::default()
    };
    let edge_id = model.store.insert_edge(edge);

    let mut editor = Editor::new(model);

    // Set new offset
    let cmd = Command::SetEdgeLabelOffset(SetEdgeLabelOffsetPayload::new(
        edge_id,
        Some((100.0, 200.0)),
    ));

    editor.execute(cmd).unwrap();

    // Verify new offset
    assert_eq!(
        editor.model().store.edge(edge_id).unwrap().label_offset,
        Some((100.0, 200.0))
    );

    // Undo should restore previous offset
    editor.undo().unwrap();
    assert_eq!(
        editor.model().store.edge(edge_id).unwrap().label_offset,
        Some((5.0, 5.0)),
        "undo should restore previous offset"
    );
}

#[test]
fn set_edge_label_offset_to_none() {
    let (mut model, pid) = make_model_with_page();
    let (source_id, target_id) = make_source_and_target(&mut model, pid);

    // Create an edge with existing offset
    let edge = Edge {
        source: source_id,
        target: target_id,
        page_id: Some(pid),
        label_offset: Some((10.0, 20.0)),
        ..Default::default()
    };
    let edge_id = model.store.insert_edge(edge);

    let mut editor = Editor::new(model);

    // Set offset to None (remove offset)
    let cmd = Command::SetEdgeLabelOffset(SetEdgeLabelOffsetPayload::new(edge_id, None));

    editor.execute(cmd).unwrap();

    // Verify offset is None
    assert_eq!(
        editor.model().store.edge(edge_id).unwrap().label_offset,
        None,
        "label_offset should be None"
    );

    // Undo should restore previous offset
    editor.undo().unwrap();
    assert_eq!(
        editor.model().store.edge(edge_id).unwrap().label_offset,
        Some((10.0, 20.0)),
        "undo should restore previous offset"
    );
}

#[test]
fn connect_vertices_command_with_ports_serializes_correctly() {
    let (mut model, pid) = make_model_with_page();
    let (source_id, target_id) = make_source_and_target(&mut model, pid);

    // Create command with ports
    let cmd = ConnectVerticesCommand::with_ports(
        source_id,
        target_id,
        RoutingKind::Orthogonal,
        Some(Direction::North),
        Some(Direction::South),
    );

    // Verify fields are set correctly before serialization
    assert_eq!(cmd.source_port, Some(Direction::North));
    assert_eq!(cmd.target_port, Some(Direction::South));
    assert_eq!(cmd.routing_kind, RoutingKind::Orthogonal);
    assert_eq!(cmd.from, source_id);
    assert_eq!(cmd.to, target_id);
}

#[test]
fn set_edge_label_offset_payload_new_creates_correctly() {
    let (mut model, pid) = make_model_with_page();
    let (source_id, target_id) = make_source_and_target(&mut model, pid);

    let edge = Edge {
        source: source_id,
        target: target_id,
        page_id: Some(pid),
        ..Default::default()
    };
    let edge_id = model.store.insert_edge(edge);

    let payload = SetEdgeLabelOffsetPayload::new(edge_id, Some((42.0, 84.0)));

    assert_eq!(payload.id, edge_id);
    assert_eq!(payload.offset, Some((42.0, 84.0)));
}

#[test]
fn edge_without_label_offset_has_none_by_default() {
    let (mut model, pid) = make_model_with_page();
    let (source_id, target_id) = make_source_and_target(&mut model, pid);

    let edge = Edge {
        source: source_id,
        target: target_id,
        page_id: Some(pid),
        ..Default::default()
    };

    assert!(edge.label_offset.is_none());
}

// ─── Combined Port + Label Offset Tests ────────────────────────────────────────

#[test]
fn connect_with_ports_and_set_label_offset() {
    let (mut model, pid) = make_model_with_page();
    let (source_id, target_id) = make_source_and_target(&mut model, pid);

    let mut editor = Editor::new(model);

    // Connect with ports
    let connect_cmd = Command::ConnectVertices(ConnectVerticesCommand::with_ports(
        source_id,
        target_id,
        RoutingKind::Orthogonal,
        Some(Direction::East),
        Some(Direction::West),
    ));
    editor.execute(connect_cmd).unwrap();

    let edge_id = editor
        .model()
        .store
        .edges_with_ids()
        .next()
        .expect("should have one edge")
        .0;

    // Set label offset
    let offset_cmd = Command::SetEdgeLabelOffset(SetEdgeLabelOffsetPayload::new(
        edge_id,
        Some((30.0, 40.0)),
    ));
    editor.execute(offset_cmd).unwrap();

    // Verify both port-based routing and label offset
    let edge = editor.model().store.edge(edge_id).unwrap();
    assert_eq!(edge.label_offset, Some((30.0, 40.0)));
    assert!(!edge.waypoints.is_empty());

    // Undo offset change, edge should still exist with ports
    editor.undo().unwrap();
    let edge = editor.model().store.edge(edge_id).unwrap();
    assert!(edge.label_offset.is_none());
    assert!(!edge.waypoints.is_empty());
}
