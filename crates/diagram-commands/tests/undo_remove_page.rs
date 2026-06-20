//! Integration test: undo after remove_page (structural equivalence).
//!
//! Task 3.5: Verify that undo after RemovePage restores page + children
//! with NEW IDs and correctly rewritten references.

use diagram_commands::{Command, Editor};
use diagram_core::geometry::CellGeometry;
use diagram_core::label::Label;
use diagram_core::{DiagramModel, Edge, Group, Page, PageId, Vertex};

#[test]
fn undo_remove_page_restores_all_cells_with_new_ids() {
    let mut model = DiagramModel::new();

    // Create page P
    let page = Page::new(PageId::default());
    let pid = model.store.insert_page(page);
    if let Some(p) = model.store.page_mut(pid) {
        p.id = pid;
    }

    // Create group G on page P
    let gid = {
        let g = Group {
            label: Some(Label::new("Group")),
            page_id: Some(pid),
            ..Default::default()
        };
        model.store.insert_group(g)
    };

    // Create vertex V1 on page P with parent = G
    let vid1 = {
        let v = Vertex {
            geometry: Some(CellGeometry {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 50.0,
                relative: false,
                ..Default::default()
            }),
            label: Some(Label::new("V1")),
            page_id: Some(pid),
            parent: Some(gid),
            ..Default::default()
        };
        model.store.insert_vertex(v)
    };

    // Create vertex V2 on page P (no parent)
    let vid2 = {
        let v = Vertex {
            geometry: Some(CellGeometry {
                x: 100.0,
                y: 0.0,
                width: 100.0,
                height: 50.0,
                relative: false,
                ..Default::default()
            }),
            label: Some(Label::new("V2")),
            page_id: Some(pid),
            ..Default::default()
        };
        model.store.insert_vertex(v)
    };

    // Create edge E: V1 -> V2 on page P
    let _eid = {
        let edge = Edge {
            source: vid1,
            target: vid2,
            page_id: Some(pid),
            label: Some(Label::new("E1")),
            ..Default::default()
        };
        model.store.insert_edge(edge)
    };

    // Verify initial state
    assert_eq!(model.store.page_count(), 1);
    assert_eq!(model.store.len_vertex(), 2);
    assert_eq!(model.store.len_edge(), 1);
    assert_eq!(model.store.len_group(), 1);

    // Create editor
    let mut editor = Editor::new(model);

    // Apply RemovePage
    editor
        .execute(Command::RemovePage(
            diagram_commands::RemovePagePayload::new(pid),
        ))
        .unwrap();

    // All cells on the page should be gone
    assert_eq!(editor.model().store.page_count(), 0);
    assert_eq!(editor.model().store.len_vertex(), 0);
    assert_eq!(editor.model().store.len_edge(), 0);
    assert_eq!(editor.model().store.len_group(), 0);

    // Undo
    editor.undo().unwrap();

    // Page restored
    assert_eq!(editor.model().store.page_count(), 1);
    assert_eq!(editor.model().store.len_vertex(), 2);
    assert_eq!(editor.model().store.len_edge(), 1);
    assert_eq!(editor.model().store.len_group(), 1);

    // New page ID
    let new_pid = editor.model().store.pages_with_ids().next().unwrap().0;

    // All cells should have the new page ID
    for (_vid, v) in editor.model().store.vertices_with_ids() {
        assert_eq!(v.page_id, Some(new_pid), "vertex should be on new page");
    }
    for (_gid, g) in editor.model().store.groups_with_ids() {
        assert_eq!(g.page_id, Some(new_pid), "group should be on new page");
    }

    // Edge should reference the new vertex IDs
    let restored_edge = editor.model().store.edges_with_ids().next().unwrap().1;
    assert!(
        editor.model().store.vertex(restored_edge.source).is_some(),
        "edge.source should reference valid vertex"
    );
    assert!(
        editor.model().store.vertex(restored_edge.target).is_some(),
        "edge.target should reference valid vertex"
    );

    // V1 should have parent = new GID
    let new_gid = editor.model().store.groups_with_ids().next().unwrap().0;
    for (_vid, v) in editor.model().store.vertices_with_ids() {
        if v.label.as_ref().map(|l| l.as_str()) == Some("V1") {
            assert_eq!(
                v.parent,
                Some(new_gid),
                "V1 should have parent = new group ID"
            );
        }
    }
}

#[test]
fn undo_remove_page_preserves_off_page_cells() {
    let mut model = DiagramModel::new();

    // Page P1
    let page1 = Page::new(PageId::default());
    let pid1 = model.store.insert_page(page1);
    if let Some(p) = model.store.page_mut(pid1) {
        p.id = pid1;
    }

    // Page P2 (different page)
    let page2 = Page::new(PageId::default());
    let pid2 = model.store.insert_page(page2);
    if let Some(p) = model.store.page_mut(pid2) {
        p.id = pid2;
    }

    // Vertex on P1
    let _vid1 = {
        let v = Vertex {
            label: Some(Label::new("OnP1")),
            page_id: Some(pid1),
            ..Default::default()
        };
        model.store.insert_vertex(v)
    };

    // Vertex on P2 (should NOT be affected by RemovePage P1)
    let _vid2 = {
        let v = Vertex {
            label: Some(Label::new("OnP2")),
            page_id: Some(pid2),
            ..Default::default()
        };
        model.store.insert_vertex(v)
    };

    let mut editor = Editor::new(model);

    // Remove page P1
    editor
        .execute(Command::RemovePage(
            diagram_commands::RemovePagePayload::new(pid1),
        ))
        .unwrap();

    // P1 cells gone, P2 cells intact
    assert_eq!(editor.model().store.page_count(), 1);
    assert_eq!(editor.model().store.len_vertex(), 1); // only V2 remains

    // Undo
    editor.undo().unwrap();

    assert_eq!(editor.model().store.page_count(), 2);
    assert_eq!(editor.model().store.len_vertex(), 2);

    // Verify both pages exist
    let pages: Vec<_> = editor.model().store.pages_with_ids().collect();
    assert_eq!(pages.len(), 2);
}
