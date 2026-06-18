//! Drawio import: parse and replace engine model.

use crate::engine::with_editor_mut;
use diagram_format_drawio::DrawioMapping;
use wasm_bindgen::prelude::*;

/// Import a `.drawio` XML string, replacing the engine's model atomically.
///
/// Parses the XML via `diagram_format_drawio::parse_drawio`, maps it to the
/// domain model via `DrawioMapping::to_domain`, and replaces the engine's model
/// in a single step. Undo/redo history is cleared by [`Editor::replace_model`].
///
/// # Atomicity
///
/// If either `parse_drawio` or `to_domain` fails, the engine's model is
/// unchanged.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `ImportFailed: parse: <error>` if XML parsing fails
/// - `ImportFailed: mapping: <error>` if domain mapping fails
#[wasm_bindgen]
pub fn import_drawio(handle: u32, xml: &str) -> Result<(), JsValue> {
    with_editor_mut(handle, |e| {
        // Parse raw XML
        let raw = diagram_format_drawio::parse_drawio(xml).map_err(|e| {
            Box::leak(format!("ImportFailed: parse: {e:?}").into_boxed_str()) as &str
        })?;

        // Map to domain model
        let (model, _id_map) = DrawioMapping::new().to_domain(&raw).map_err(|e| {
            Box::leak(format!("ImportFailed: mapping: {e:?}").into_boxed_str()) as &str
        })?;

        // Replace model atomically
        e.replace_model(model);
        Ok(())
    })
    .and_then(|r| r)
    .map_err(JsValue::from_str)
}
