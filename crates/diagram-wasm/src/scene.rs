//! Scene export: build and serialize scene from engine model.

use crate::engine::{WasmStencilProvider, with_engine, with_engine_mut};
use diagram_scene::SceneBuilder;
use wasm_bindgen::prelude::*;

#[cfg(test)]
mod tests {
    use diagram_scene::{PageScene, Scene};

    /// Verifies that `PageScene.math_enabled` is preserved through JSON serialization.
    /// This is the engine-side precondition for MATH-020: the TS overlay can only
    /// activate when `math_enabled` arrives intact at the WASM boundary.
    #[test]
    fn math_enabled_round_trips_through_json() {
        let page = PageScene {
            page_id: diagram_core::PageId::default(),
            name: "Math Page".to_owned(),
            width: 800.0,
            height: 600.0,
            display_list: vec![],
            background: None,
            math_enabled: true,
        };
        let scene = Scene { pages: vec![page] };

        let json = serde_json::to_string(&scene).expect("scene must serialize");
        let round_tripped: Scene = serde_json::from_str(&json).expect("scene must deserialize");

        assert_eq!(round_tripped.pages.len(), 1);
        assert!(
            round_tripped.pages[0].math_enabled,
            "math_enabled must be preserved through JSON round-trip"
        );
    }

    /// Verifies that `math_enabled = false` is also preserved (not just true).
    #[test]
    fn math_enabled_false_round_trips_through_json() {
        let page = PageScene {
            page_id: diagram_core::PageId::default(),
            name: "Normal Page".to_owned(),
            width: 200.0,
            height: 100.0,
            display_list: vec![],
            background: None,
            math_enabled: false,
        };
        let scene = Scene { pages: vec![page] };

        let json = serde_json::to_string(&scene).expect("scene must serialize");
        let round_tripped: Scene = serde_json::from_str(&json).expect("scene must deserialize");

        assert_eq!(round_tripped.pages.len(), 1);
        assert!(
            !round_tripped.pages[0].math_enabled,
            "math_enabled=false must be preserved through JSON round-trip"
        );
    }
}

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

// ─── Zero-copy scene buffer (Phase 2 / P2-3) ──────────────────────────────────
//
// These functions write the scene as postcard-encoded bytes to a
// pre-allocated buffer in WASM linear memory. JS reads the bytes
// directly via `Uint8Array(wasm.memory.buffer, ptr, len)` — zero copy,
// no JSON.stringify, no UTF-8 round-trip.
//
// Safety contract: JS must re-fetch ptr after each call to
// `write_scene_to_buffer` because the buffer may have been reallocated
// (growing) and the old ptr would be stale.

/// Serialize the scene as postcard bytes into the engine's scene buffer.
///
/// Returns the number of bytes written. JS then calls
/// `get_scene_buffer_ptr` to get the pointer and creates a
/// `Uint8Array` view to read the data.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `SceneError: <detail>` if scene building fails
/// - `Postcard: <error>` if postcard serialization fails
#[wasm_bindgen]
pub fn write_scene_to_buffer(handle: u32) -> Result<usize, JsValue> {
    with_engine_mut(handle, |e| {
        // Build scene (borrows e.editor immutably)
        let provider = WasmStencilProvider::new(e.stencil_libraries.clone());
        let scene = SceneBuilder::new()
            .with_stencil_provider(Box::new(provider))
            .build(e.editor.model())
            .map_err(|err| Box::leak(format!("SceneError: {err:?}").into_boxed_str()) as &str)?;

        // Serialize to postcard bytes
        let bytes = postcard::to_allocvec(&scene)
            .map_err(|e| Box::leak(format!("Postcard: {e}").into_boxed_str()) as &str)?;

        // Write to the scene buffer (borrows e.buffers mutably — OK, different field)
        let written = e.buffers.scene.write(&bytes);
        Ok(written)
    })
    .and_then(|r| r)
    .map_err(JsValue::from_str)
}

/// Get the raw pointer to the scene buffer data.
///
/// JS uses this to create a `Uint8Array` view into WASM linear memory:
/// ```ignore
/// const ptr = wasm.get_scene_buffer_ptr(handle);
/// const len = wasm.get_scene_buffer_len(handle);
/// const bytes = new Uint8Array(wasm.memory.buffer, ptr, len);
/// ```
///
/// **IMPORTANT**: This pointer is only valid until the next call to
/// `write_scene_to_buffer` or any other function that might grow WASM
/// memory. Do not cache the pointer across WASM calls.
#[wasm_bindgen]
pub fn get_scene_buffer_ptr(handle: u32) -> usize {
    with_engine(handle, |e| e.buffers.scene.as_ptr() as usize)
        .unwrap_or(0)
}

/// Get the current data length of the scene buffer.
///
/// This is the number of valid bytes after the last `write_scene_to_buffer`
/// call, NOT the buffer capacity.
#[wasm_bindgen]
pub fn get_scene_buffer_len(handle: u32) -> usize {
    with_engine(handle, |e| e.buffers.scene.len())
        .unwrap_or(0)
}

/// Get the current capacity of the scene buffer in bytes.
///
/// Useful for JS to know the maximum scene size before reallocation
/// would occur (which changes the ptr).
#[wasm_bindgen]
pub fn get_scene_buffer_capacity(handle: u32) -> usize {
    with_engine(handle, |e| e.buffers.scene.capacity())
        .unwrap_or(0)
}
