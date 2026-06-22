//! Scene export: build and serialize scene from engine model.

use crate::engine::{WasmStencilProvider, with_engine};
use diagram_scene::SceneBuilder;
use wasm_bindgen::prelude::*;

/// Get the scene snapshot for an engine as a JSON string.
///
/// The scene is built from the engine's current model and serialized via
/// `serde_json`. IDs (vertex, edge, group, page) use slotmap serde format.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `SceneError: <detail>` if scene building fails
/// - `Serialize: <json_error>` if serialization fails
#[wasm_bindgen]
pub fn get_scene(handle: u32) -> Result<String, JsValue> {
    with_engine(handle, |e| {
        let provider = WasmStencilProvider::new(e.stencil_libraries.clone());
        let scene = SceneBuilder::new()
            .with_stencil_provider(Box::new(provider))
            .build(e.editor.model())
            .map_err(|err| Box::leak(format!("SceneError: {err:?}").into_boxed_str()) as &str)?;
        serde_json::to_string(&scene)
            .map_err(|e| Box::leak(format!("Serialize: {e}").into_boxed_str()) as &str)
    })
    .and_then(|r| r)
    .map_err(JsValue::from_str)
}
