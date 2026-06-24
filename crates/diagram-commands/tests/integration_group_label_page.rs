//! Integration tests for v0.44 (SetVertexParent), v0.46 (EditEdgeLabel), and v0.47 (page management).
//!
//! Tests cover:
//! - SetVertexParent: linking vertex to group, orphaning, undo
//! - EditEdgeLabel: setting label text, clearing label, undo
//! - AddPage/RemovePage/RenamePage: page lifecycle, cascade, undo
//!
//! Run with:
//!   cargo test -p diagram-commands --test integration_group_label_page

use diagram_commands::{
    AddPagePayload, Command, EditEdgeLabelPayload, Editor, RemovePagePayload, RenamePagePayload,
    SetVertexParentPayload,
};
use diagram_core::geometry::CellGeometry;
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

fn make_model_with_named_page(name: &str) -> (DiagramModel, PageId) {
    let mut model = DiagramModel::new();
    let mut page = Page::new(PageId::default());
    page.name = Some(Label::new(name));
    let pid = model.store.insert_page(page);
    if let Some(p) = model.store.page_mut(pid) {
        p.id = pid;
    }
    (model, pid)
}

fn make_vertex(model: &mut DiagramModel, pid: PageId, label: &str, x: f64, y: f64) -> VertexId {
    let vertex = Vertex {
        geometry: Some(CellGeometry {
            x,
            y,
            width: 100.0,
            height: 60.0,
            relative: false,
            ..Default::default()
        }),
        label: Some(Label::new(label)),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_vertex(vertex)
}

// ─── v0.44: SetVertexParent ───────────────────────────────────────────────────

#[test]
fn set_vertex_parent_links_vertex_to_group() {
    let (mut model, pid) = make_model_with_page();
    let vertex_id = make_vertex(&mut model, pid, "Child", 50.0, 50.0);

    // Add a group BEFORE creating editor (model is moved into editor)
    let group = Group {
        label: Some(Label::new("Group")),
        page_id: Some(pid),
        ..Default::default()
    };
    let group_id = model.store.insert_group(group);

    let mut editor = Editor::new(model);

    // Set vertex parent
    let cmd = Command::SetVertexParent(SetVertexParentPayload::new(vertex_id, Some(group_id)));
    editor.execute(cmd).unwrap();

    // Verify parent is set
    let vertex = editor.model().store.vertex(vertex_id).unwrap();
    assert_eq!(
        vertex.parent,
        Some(group_id),
        "vertex.parent should be Some(group_id)"
    );
}

#[test]
fn set_vertex_parent_with_none_orphans_vertex() {
    let (mut model, pid) = make_model_with_page();
    let vertex_id = make_vertex(&mut model, pid, "Child", 50.0, 50.0);

    // Add a group
    let group = Group {
        label: Some(Label::new("Group")),
        page_id: Some(pid),
        ..Default::default()
    };
    let group_id = model.store.insert_group(group);

    let mut editor = Editor::new(model);

    // Set parent first
    let set_cmd = Command::SetVertexParent(SetVertexParentPayload::new(vertex_id, Some(group_id)));
    editor.execute(set_cmd).unwrap();

    // Now orphan the vertex
    let orphan_cmd = Command::SetVertexParent(SetVertexParentPayload::new(vertex_id, None));
    editor.execute(orphan_cmd).unwrap();

    // Verify parent is None
    let vertex = editor.model().store.vertex(vertex_id).unwrap();
    assert_eq!(
        vertex.parent, None,
        "vertex.parent should be None after orphaning"
    );
}

#[test]
fn set_vertex_parent_undo_restores_previous() {
    let (mut model, pid) = make_model_with_page();
    let vertex_id = make_vertex(&mut model, pid, "Child", 50.0, 50.0);

    // Add a group
    let group = Group {
        label: Some(Label::new("Group")),
        page_id: Some(pid),
        ..Default::default()
    };
    let group_id = model.store.insert_group(group);

    let mut editor = Editor::new(model);

    // Set parent
    let cmd = Command::SetVertexParent(SetVertexParentPayload::new(vertex_id, Some(group_id)));
    editor.execute(cmd).unwrap();

    // Verify parent is set
    assert_eq!(
        editor.model().store.vertex(vertex_id).unwrap().parent,
        Some(group_id)
    );

    // Undo
    editor.undo().unwrap();

    // Verify parent is restored to None
    assert_eq!(
        editor.model().store.vertex(vertex_id).unwrap().parent,
        None,
        "undo should restore parent to None"
    );
}

#[test]
fn set_vertex_parent_undo_restores_original_parent() {
    let (mut model, pid) = make_model_with_page();
    let vertex_id = make_vertex(&mut model, pid, "Child", 50.0, 50.0);

    // Add two groups
    let group1 = Group {
        label: Some(Label::new("Group1")),
        page_id: Some(pid),
        ..Default::default()
    };
    let group1_id = model.store.insert_group(group1);

    let group2 = Group {
        label: Some(Label::new("Group2")),
        page_id: Some(pid),
        ..Default::default()
    };
    let group2_id = model.store.insert_group(group2);

    let mut editor = Editor::new(model);

    // First set parent to group1
    let cmd1 = Command::SetVertexParent(SetVertexParentPayload::new(vertex_id, Some(group1_id)));
    editor.execute(cmd1).unwrap();

    // Then change to group2
    let cmd2 = Command::SetVertexParent(SetVertexParentPayload::new(vertex_id, Some(group2_id)));
    editor.execute(cmd2).unwrap();

    assert_eq!(
        editor.model().store.vertex(vertex_id).unwrap().parent,
        Some(group2_id)
    );

    // Undo should restore to group1
    editor.undo().unwrap();
    assert_eq!(
        editor.model().store.vertex(vertex_id).unwrap().parent,
        Some(group1_id)
    );
}

#[test]
fn group_multiple_vertices_atomically() {
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, "V1", 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, "V2", 100.0, 0.0);
    let v3 = make_vertex(&mut model, pid, "V3", 200.0, 0.0);

    // Add a group
    let group = Group {
        label: Some(Label::new("Group")),
        page_id: Some(pid),
        ..Default::default()
    };
    let group_id = model.store.insert_group(group);

    let mut editor = Editor::new(model);

    // Link all 3 vertices to the group
    editor
        .execute(Command::SetVertexParent(SetVertexParentPayload::new(
            v1,
            Some(group_id),
        )))
        .unwrap();
    editor
        .execute(Command::SetVertexParent(SetVertexParentPayload::new(
            v2,
            Some(group_id),
        )))
        .unwrap();
    editor
        .execute(Command::SetVertexParent(SetVertexParentPayload::new(
            v3,
            Some(group_id),
        )))
        .unwrap();

    // Verify all have parent set
    assert_eq!(
        editor.model().store.vertex(v1).unwrap().parent,
        Some(group_id)
    );
    assert_eq!(
        editor.model().store.vertex(v2).unwrap().parent,
        Some(group_id)
    );
    assert_eq!(
        editor.model().store.vertex(v3).unwrap().parent,
        Some(group_id)
    );

    // Undo all (in reverse order)
    editor.undo().unwrap();
    editor.undo().unwrap();
    editor.undo().unwrap();

    // Verify all parents are cleared
    assert_eq!(editor.model().store.vertex(v1).unwrap().parent, None);
    assert_eq!(editor.model().store.vertex(v2).unwrap().parent, None);
    assert_eq!(editor.model().store.vertex(v3).unwrap().parent, None);
}

// ─── v0.46: EditEdgeLabel ────────────────────────────────────────────────────

#[test]
fn edit_edge_label_persists_text() {
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, "Source", 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, "Target", 300.0, 0.0);

    // Create edge without label
    let edge = Edge {
        source: v1,
        target: v2,
        page_id: Some(pid),
        ..Default::default()
    };
    let edge_id = model.store.insert_edge(edge);

    let mut editor = Editor::new(model);

    // Set label
    let cmd = Command::EditEdgeLabel(EditEdgeLabelPayload::new(
        edge_id,
        Some(Label::new("Hello")),
    ));
    editor.execute(cmd).unwrap();

    // Verify label is set
    let edge = editor.model().store.edge(edge_id).unwrap();
    assert!(
        edge.label.is_some(),
        "edge.label should be Some after EditEdgeLabel"
    );
    assert_eq!(
        edge.label.as_ref().unwrap().as_str(),
        "Hello",
        "edge label text should be 'Hello'"
    );
}

#[test]
fn edit_edge_label_undo_restores_previous() {
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, "Source", 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, "Target", 300.0, 0.0);

    // Create edge with initial label
    let edge = Edge {
        source: v1,
        target: v2,
        page_id: Some(pid),
        label: Some(Label::new("Original")),
        ..Default::default()
    };
    let edge_id = model.store.insert_edge(edge);

    let mut editor = Editor::new(model);

    // Change label
    let cmd = Command::EditEdgeLabel(EditEdgeLabelPayload::new(
        edge_id,
        Some(Label::new("New Label")),
    ));
    editor.execute(cmd).unwrap();

    // Verify label changed
    assert_eq!(
        editor
            .model()
            .store
            .edge(edge_id)
            .unwrap()
            .label
            .as_ref()
            .unwrap()
            .as_str(),
        "New Label"
    );

    // Undo
    editor.undo().unwrap();

    // Verify original label restored
    assert_eq!(
        editor
            .model()
            .store
            .edge(edge_id)
            .unwrap()
            .label
            .as_ref()
            .unwrap()
            .as_str(),
        "Original"
    );
}

#[test]
fn edit_edge_label_with_none_clears_label() {
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, "Source", 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, "Target", 300.0, 0.0);

    // Create edge with label
    let edge = Edge {
        source: v1,
        target: v2,
        page_id: Some(pid),
        label: Some(Label::new("Keep Me")),
        ..Default::default()
    };
    let edge_id = model.store.insert_edge(edge);

    let mut editor = Editor::new(model);

    // Clear label
    let cmd = Command::EditEdgeLabel(EditEdgeLabelPayload::new(edge_id, None));
    editor.execute(cmd).unwrap();

    // Verify label is None
    assert_eq!(
        editor.model().store.edge(edge_id).unwrap().label,
        None,
        "edge.label should be None after clearing"
    );

    // Undo should restore the label
    editor.undo().unwrap();
    assert_eq!(
        editor
            .model()
            .store
            .edge(edge_id)
            .unwrap()
            .label
            .as_ref()
            .unwrap()
            .as_str(),
        "Keep Me"
    );
}

#[test]
fn edit_edge_label_to_none_from_no_label() {
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, "Source", 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, "Target", 300.0, 0.0);

    // Create edge WITHOUT label
    let edge = Edge {
        source: v1,
        target: v2,
        page_id: Some(pid),
        ..Default::default()
    };
    let edge_id = model.store.insert_edge(edge);

    let mut editor = Editor::new(model);

    // Try to clear (should remain None)
    let cmd = Command::EditEdgeLabel(EditEdgeLabelPayload::new(edge_id, None));
    editor.execute(cmd).unwrap();

    assert_eq!(editor.model().store.edge(edge_id).unwrap().label, None);
}

// ─── v0.47: Page management ─────────────────────────────────────────────────

#[test]
fn add_page_creates_page_with_name() {
    let mut model = DiagramModel::new();
    let mut editor = Editor::new(model);

    // Add a page with a name
    let mut page = Page::new(PageId::default());
    page.name = Some(Label::new("My Page"));
    let cmd = Command::AddPage(AddPagePayload::new(page));
    editor.execute(cmd).unwrap();

    // Verify page count
    assert_eq!(
        editor.model().store.page_count(),
        1,
        "should have exactly 1 page"
    );

    // Verify page name
    let page_id = editor.model().store.pages_with_ids().next().unwrap().0;
    let page = editor.model().store.page(page_id).unwrap();
    assert_eq!(
        page.name.as_ref().unwrap().as_str(),
        "My Page",
        "page name should be 'My Page'"
    );
}

#[test]
fn add_page_increments_page_count() {
    let mut model = DiagramModel::new();
    let mut editor = Editor::new(model);

    // Add first page
    editor
        .execute(Command::AddPage(AddPagePayload::new(Page::new(
            PageId::default(),
        ))))
        .unwrap();
    assert_eq!(editor.model().store.page_count(), 1);

    // Add second page
    editor
        .execute(Command::AddPage(AddPagePayload::new(Page::new(
            PageId::default(),
        ))))
        .unwrap();
    assert_eq!(editor.model().store.page_count(), 2);

    // Undo should decrement
    editor.undo().unwrap();
    assert_eq!(editor.model().store.page_count(), 1);
}

#[test]
fn remove_page_cascades_to_vertices() {
    let (mut model, pid) = make_model_with_page();
    // Add 2 vertices to the page
    make_vertex(&mut model, pid, "V1", 0.0, 0.0);
    make_vertex(&mut model, pid, "V2", 100.0, 0.0);

    assert_eq!(model.store.len_vertex(), 2);

    let mut editor = Editor::new(model);

    // Remove page
    let cmd = Command::RemovePage(RemovePagePayload::new(pid));
    editor.execute(cmd).unwrap();

    // Verify page is gone
    assert_eq!(
        editor.model().store.page_count(),
        0,
        "page should be removed"
    );
    // Verify vertices are also removed (cascade)
    assert_eq!(
        editor.model().store.len_vertex(),
        0,
        "vertices should be cascade-removed with page"
    );
}

#[test]
fn remove_page_cascades_to_groups() {
    let (mut model, pid) = make_model_with_page();
    // Add a group
    let group = Group {
        label: Some(Label::new("Group")),
        page_id: Some(pid),
        ..Default::default()
    };
    model.store.insert_group(group);

    assert_eq!(model.store.len_group(), 1);

    let mut editor = Editor::new(model);

    // Remove page
    let cmd = Command::RemovePage(RemovePagePayload::new(pid));
    editor.execute(cmd).unwrap();

    assert_eq!(
        editor.model().store.len_group(),
        0,
        "groups should be cascade-removed with page"
    );
}

#[test]
fn remove_page_undo_restores_page_and_cells() {
    let (mut model, pid) = make_model_with_page();
    let v1 = make_vertex(&mut model, pid, "V1", 0.0, 0.0);
    let v2 = make_vertex(&mut model, pid, "V2", 100.0, 0.0);

    let mut editor = Editor::new(model);

    // Remove page
    let cmd = Command::RemovePage(RemovePagePayload::new(pid));
    editor.execute(cmd).unwrap();

    assert_eq!(editor.model().store.page_count(), 0);

    // Undo
    editor.undo().unwrap();

    // Everything should be restored
    assert_eq!(
        editor.model().store.page_count(),
        1,
        "page should be restored after undo"
    );
    assert_eq!(
        editor.model().store.len_vertex(),
        2,
        "vertices should be restored after undo"
    );

    // New page ID after undo
    let new_pid = editor.model().store.pages_with_ids().next().unwrap().0;

    // After undo, vertices have NEW IDs (slotmap reissues keys)
    // Collect the new vertex IDs
    let restored_vertices: Vec<_> = editor.model().store.vertices_with_ids().collect();
    assert_eq!(restored_vertices.len(), 2);

    // All restored vertices should be on the new page
    for (vid, vertex) in restored_vertices {
        assert_eq!(
            vertex.page_id,
            Some(new_pid),
            "vertex {:?} should be on new page {:?}",
            vid,
            new_pid
        );
    }
}

#[test]
fn rename_page_updates_name() {
    let (mut model, pid) = make_model_with_page();
    let mut editor = Editor::new(model);

    // Verify initial name is None
    assert!(editor.model().store.page(pid).unwrap().name.is_none());

    // Rename page
    let cmd = Command::RenamePage(RenamePagePayload::new(pid, Label::new("New Name")));
    editor.execute(cmd).unwrap();

    // Verify name updated
    assert_eq!(
        editor
            .model()
            .store
            .page(pid)
            .unwrap()
            .name
            .as_ref()
            .unwrap()
            .as_str(),
        "New Name"
    );
}

#[test]
fn rename_page_undo_restores_original() {
    // Use named page so initial name is "Original"
    let (model, pid) = make_model_with_named_page("Original");
    let mut editor = Editor::new(model);

    // Verify initial name
    assert_eq!(
        editor
            .model()
            .store
            .page(pid)
            .unwrap()
            .name
            .as_ref()
            .unwrap()
            .as_str(),
        "Original"
    );

    // Rename
    let cmd = Command::RenamePage(RenamePagePayload::new(pid, Label::new("New Name")));
    editor.execute(cmd).unwrap();

    assert_eq!(
        editor
            .model()
            .store
            .page(pid)
            .unwrap()
            .name
            .as_ref()
            .unwrap()
            .as_str(),
        "New Name"
    );

    // Undo
    editor.undo().unwrap();

    // Verify original name restored
    assert_eq!(
        editor
            .model()
            .store
            .page(pid)
            .unwrap()
            .name
            .as_ref()
            .unwrap()
            .as_str(),
        "Original"
    );
}

#[test]
fn rename_page_none_to_some() {
    let (mut model, pid) = make_model_with_page();
    let mut editor = Editor::new(model);

    // Initial name is None
    assert!(editor.model().store.page(pid).unwrap().name.is_none());

    // Rename from None to Some
    let cmd = Command::RenamePage(RenamePagePayload::new(pid, Label::new("Named Page")));
    editor.execute(cmd).unwrap();

    assert_eq!(
        editor
            .model()
            .store
            .page(pid)
            .unwrap()
            .name
            .as_ref()
            .unwrap()
            .as_str(),
        "Named Page"
    );
}

#[test]
fn rename_page_undo_restores_none() {
    let (mut model, pid) = make_model_with_page();
    let mut editor = Editor::new(model);

    // Rename from None to Some
    let cmd = Command::RenamePage(RenamePagePayload::new(pid, Label::new("Named Page")));
    editor.execute(cmd).unwrap();

    assert!(editor.model().store.page(pid).unwrap().name.is_some());

    // Undo should restore None
    editor.undo().unwrap();
    assert!(
        editor.model().store.page(pid).unwrap().name.is_none(),
        "undo should restore name to None"
    );
}
