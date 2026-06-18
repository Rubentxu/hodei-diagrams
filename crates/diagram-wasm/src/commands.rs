//! Command execution: translate JSON commands to engine calls.

use crate::engine::{with_editor, with_editor_mut};
use diagram_commands::Command;
use wasm_bindgen::prelude::*;

/// Execute a command on an engine from a JSON string.
///
/// The JSON must match the `Command` enum shape:
/// `{"AddVertex":{...}}` (externally tagged)
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `InvalidCommand: <json_error>` if the JSON is malformed
/// - `Execute: <command_error>` if the command could not be applied
#[wasm_bindgen]
pub fn execute_command(handle: u32, cmd_json: &str) -> Result<(), JsValue> {
    let cmd = match serde_json::from_str::<Command>(cmd_json) {
        Ok(c) => c,
        Err(e) => return Err(JsValue::from_str(&format!("InvalidCommand: {e}"))),
    };
    with_editor_mut(handle, |e| e.execute(cmd))
        .and_then(|r| r.map_err(|e| Box::leak(format!("Execute: {e}").into_boxed_str()) as &str))
        .map_err(JsValue::from_str)
}

/// Undo the last command (or transaction) on an engine.
///
/// No-op if undo history is empty.
#[wasm_bindgen]
pub fn undo(handle: u32) -> Result<(), JsValue> {
    with_editor_mut(handle, |e| e.undo())
        .and_then(|r| r.map_err(|e| Box::leak(format!("{e}").into_boxed_str()) as &str))
        .map_err(JsValue::from_str)
}

/// Redo the last undone command (or transaction) on an engine.
///
/// No-op if redo history is empty.
#[wasm_bindgen]
pub fn redo(handle: u32) -> Result<(), JsValue> {
    with_editor_mut(handle, |e| e.redo())
        .and_then(|r| r.map_err(|e| Box::leak(format!("{e}").into_boxed_str()) as &str))
        .map_err(JsValue::from_str)
}

/// Check if undo is available on an engine.
#[wasm_bindgen]
pub fn engine_can_undo(handle: u32) -> Result<bool, JsValue> {
    match with_editor(handle, |e| e.can_undo()) {
        Ok(v) => Ok(v),
        Err(e) => Err(JsValue::from_str(e)),
    }
}

/// Check if redo is available on an engine.
#[wasm_bindgen]
pub fn engine_can_redo(handle: u32) -> Result<bool, JsValue> {
    match with_editor(handle, |e| e.can_redo()) {
        Ok(v) => Ok(v),
        Err(e) => Err(JsValue::from_str(e)),
    }
}
