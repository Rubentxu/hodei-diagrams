//! Integration tests for z-order Transaction builder methods.
//!
//! Tests verify that `Transaction::bring_to_front` / `send_to_back` /
//! `bring_forward` / `send_backward` correctly enqueue z-order commands
//! and that the resulting z_order changes are reflected in the model.
//!
//! This addresses a bug discovered by the Cycle 6 E2E test
//! (web-shell/tests/e2e/layers-z-order.spec.ts) which found that the
//! `execute_transaction` WASM glue was treating z-order commands as
//! no-ops (the match arm `Command::BringToFront(_) => tx` discarded the
//! payload and didn't enqueue anything).
//!
//! Run with:
//!   cargo test -p diagram-commands --test integration_z_order

use diagram_commands::{BringToFrontPayload, CellTarget, Editor, SendToBackPayload, Transaction};
use diagram_core::label::Label;
use diagram_core::{DiagramModel, EdgeId, Page, PageId, Vertex, VertexId};

fn make_model_with_page() -> (DiagramModel, PageId) {
    let mut model = DiagramModel::new();
    let page = Page::new(PageId::default());
    let pid = model.store.insert_page(page);
    (model, pid)
}

fn insert_vertex_with_z(model: &mut DiagramModel, pid: PageId, label: &str, z: i32) -> VertexId {
    let v = Vertex {
        label: Some(Label::new(label)),
        page_id: Some(pid),
        z_order: z,
        ..Default::default()
    };
    model.store.insert_vertex(v)
}

/// Regression: the bug was that the WASM glue matched
/// `Command::BringToFront(_) => tx` (discarded the payload and returned
/// the empty transaction). Fix added builder methods on Transaction
/// AND wired them through `execute_transaction`.
#[test]
fn transaction_bring_to_front_routes_through_builder() {
    let (mut model, pid) = make_model_with_page();
    let _v1 = insert_vertex_with_z(&mut model, pid, "v1", 1);
    let _v2 = insert_vertex_with_z(&mut model, pid, "v2", 5);

    let mut editor = Editor::from_model(model);

    // The transaction must contain ONE BringToFront command — not be empty.
    let tx = Transaction::new().bring_to_front(CellTarget::Vertex(_v1));
    assert_eq!(
        tx.pending(),
        1,
        "Transaction::bring_to_front must enqueue exactly one command"
    );

    // Commit and verify z_order changed
    tx.commit(&mut editor).expect("commit");
    assert_eq!(editor.model().store.vertex(_v1).unwrap().z_order, 6);
}

#[test]
fn transaction_send_to_back_routes_through_builder() {
    let (mut model, pid) = make_model_with_page();
    let _v1 = insert_vertex_with_z(&mut model, pid, "v1", 1);
    let _v2 = insert_vertex_with_z(&mut model, pid, "v2", 5);

    let mut editor = Editor::from_model(model);
    let tx = Transaction::new().send_to_back(CellTarget::Vertex(_v2));
    assert_eq!(
        tx.pending(),
        1,
        "Transaction::send_to_back must enqueue exactly one command"
    );

    tx.commit(&mut editor).expect("commit");
    // v2 was at z=5, now should be min - 1 = 0 per SendToBackPayload logic
    assert!(
        editor.model().store.vertex(_v2).unwrap().z_order < 1,
        "v2 should be at bottom after SendToBack, got z={}",
        editor.model().store.vertex(_v2).unwrap().z_order
    );
}

/// All four z-order commands must produce correct z-order changes when
/// committed through the editor.
#[test]
fn all_four_z_order_commands_change_model_correctly() {
    let (mut model, pid) = make_model_with_page();
    let _v1 = insert_vertex_with_z(&mut model, pid, "v1", 1);
    let v3 = insert_vertex_with_z(&mut model, pid, "v3", 5);
    let v4 = insert_vertex_with_z(&mut model, pid, "v4", 7);

    let mut editor = Editor::from_model(model);

    // BringToFront: set target z_order to max(page) + 1.
    // v4 is currently topmost (max=7), so bring_to_front(v4) is a no-op.
    // Bring v1 to front instead: max+1 = 8.
    Transaction::new()
        .bring_to_front(CellTarget::Vertex(_v1))
        .commit(&mut editor)
        .expect("commit");
    assert_eq!(editor.model().store.vertex(_v1).unwrap().z_order, 8);

    // SendToBack: set target z_order to min(page) - 1.
    // After bring_to_front(v1): v1=8, v3=5, v4=7. Min=5 (v3), so v4→4.
    Transaction::new()
        .send_to_back(CellTarget::Vertex(v4))
        .commit(&mut editor)
        .expect("commit");
    assert_eq!(editor.model().store.vertex(v4).unwrap().z_order, 4);

    // BringForward on v3 — moves one step toward top by swapping with
    // the next-higher vertex. After the previous ops:
    //   v1=8 (top), v3=5, v4=4 (bottom)
    // The next vertex above v3 (z=5) is v1 (z=8). BringForward(v3)
    // should put v3 above v1.
    let z3_before = editor.model().store.vertex(v3).unwrap().z_order;
    Transaction::new()
        .bring_forward(CellTarget::Vertex(v3))
        .commit(&mut editor)
        .expect("commit");
    let z3_after = editor.model().store.vertex(v3).unwrap().z_order;
    assert!(
        z3_after > z3_before,
        "bring_forward should increase v3 z_order, was {z3_before}, now {z3_after}"
    );

    // SendBackward on v1 — moves one step toward bottom.
    let z1_before = editor.model().store.vertex(_v1).unwrap().z_order;
    Transaction::new()
        .send_backward(CellTarget::Vertex(_v1))
        .commit(&mut editor)
        .expect("commit");
    let z1_after = editor.model().store.vertex(_v1).unwrap().z_order;
    assert!(
        z1_after < z1_before,
        "send_backward should decrease v1 z_order, was {z1_before}, now {z1_after}"
    );
}

/// Direct payload shape smoke test (mirrors the WASM-side JSON test).
#[test]
fn bring_to_front_payload_carries_target_kind_vertex() {
    let (mut model, pid) = make_model_with_page();
    let v = insert_vertex_with_z(&mut model, pid, "v", 1);
    let payload = BringToFrontPayload::new(CellTarget::Vertex(v));
    assert!(matches!(payload.target, CellTarget::Vertex(_)));
}

#[test]
fn send_to_back_payload_carries_target_kind_edge() {
    let payload: SendToBackPayload = SendToBackPayload::new(CellTarget::Edge(EdgeId::default()));
    assert!(matches!(payload.target, CellTarget::Edge(_)));
}
