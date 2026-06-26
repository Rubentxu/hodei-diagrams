//! Integration test for the SetPageMathEnabled command.
//!
//! Covers:
//! - Applying SetPageMathEnabled to enable math on a page
//! - Undoing SetPageMathEnabled to restore previous state
//! - Applying SetPageMathEnabled to disable math on a page
//! - Error case: page not found

use diagram_commands::{Command, Editor};
use diagram_core::{DiagramModel, Page, PageId};

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

#[test]
fn apply_set_page_math_enabled_true() {
    let (mut model, pid) = make_model_with_page();

    // Verify initial state: math_enabled is false
    let page = model.store.page(pid).unwrap();
    assert!(
        !page.math_enabled,
        "Page should start with math_enabled=false"
    );

    // Apply SetPageMathEnabled to enable math
    let mut cmd =
        Command::SetPageMathEnabled(diagram_commands::SetPageMathEnabledPayload::new(pid, true));
    cmd.apply(&mut model).unwrap();

    // Verify math_enabled is now true
    let page = model.store.page(pid).unwrap();
    assert!(
        page.math_enabled,
        "Page should have math_enabled=true after SetPageMathEnabled(true)"
    );
}

#[test]
fn apply_set_page_math_enabled_false() {
    let (mut model, pid) = make_model_with_page();

    // First enable math
    let mut cmd_enable =
        Command::SetPageMathEnabled(diagram_commands::SetPageMathEnabledPayload::new(pid, true));
    cmd_enable.apply(&mut model).unwrap();

    // Apply SetPageMathEnabled to disable math
    let mut cmd_disable =
        Command::SetPageMathEnabled(diagram_commands::SetPageMathEnabledPayload::new(pid, false));
    cmd_disable.apply(&mut model).unwrap();

    // Verify math_enabled is now false
    let page = model.store.page(pid).unwrap();
    assert!(
        !page.math_enabled,
        "Page should have math_enabled=false after SetPageMathEnabled(false)"
    );
}

#[test]
fn undo_set_page_math_enabled_restores_previous_state() {
    let (mut model, pid) = make_model_with_page();

    // Verify initial state: math_enabled is false
    let page_before = model.store.page(pid).unwrap().math_enabled;
    assert!(!page_before);

    // Apply SetPageMathEnabled to enable math
    let mut cmd =
        Command::SetPageMathEnabled(diagram_commands::SetPageMathEnabledPayload::new(pid, true));
    cmd.apply(&mut model).unwrap();

    // Verify math_enabled changed
    let page_after_apply = model.store.page(pid).unwrap().math_enabled;
    assert!(page_after_apply);

    // Undo
    cmd.undo(&mut model).unwrap();

    // Verify math_enabled is restored to false
    let page_after_undo = model.store.page(pid).unwrap().math_enabled;
    assert!(
        !page_after_undo,
        "Page should have math_enabled=false after undo"
    );
}

#[test]
fn set_page_math_enabled_idempotent_when_same_value() {
    let (mut model, pid) = make_model_with_page();

    // Apply twice with same value (true)
    let mut cmd1 =
        Command::SetPageMathEnabled(diagram_commands::SetPageMathEnabledPayload::new(pid, true));
    cmd1.apply(&mut model).unwrap();

    let mut cmd2 =
        Command::SetPageMathEnabled(diagram_commands::SetPageMathEnabledPayload::new(pid, true));
    cmd2.apply(&mut model).unwrap();

    // Should still be true, no panic
    let page = model.store.page(pid).unwrap();
    assert!(page.math_enabled);
}

#[test]
fn apply_set_page_math_enabled_page_not_found() {
    let (mut model, _pid) = make_model_with_page();
    let bogus_pid = PageId::default();

    let mut cmd = Command::SetPageMathEnabled(diagram_commands::SetPageMathEnabledPayload::new(
        bogus_pid, true,
    ));
    let err = cmd.apply(&mut model).unwrap_err();
    assert!(matches!(
        err,
        diagram_commands::CommandError::PageNotFound(_)
    ));
}

#[test]
fn editor_execute_set_page_math_enabled() {
    let mut model = DiagramModel::new();
    let page = Page::new(PageId::default());
    let pid = model.store.insert_page(page);
    if let Some(p) = model.store.page_mut(pid) {
        p.id = pid;
    }

    let mut editor = Editor::new(model);

    // Execute SetPageMathEnabled
    let cmd =
        Command::SetPageMathEnabled(diagram_commands::SetPageMathEnabledPayload::new(pid, true));
    editor.execute(cmd).unwrap();

    // Verify
    let page = editor.model().store.page(pid).unwrap();
    assert!(page.math_enabled);

    // Undo
    editor.undo().unwrap();

    // Verify undone
    let page = editor.model().store.page(pid).unwrap();
    assert!(!page.math_enabled);
}
