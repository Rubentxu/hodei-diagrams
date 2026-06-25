//! Scene export: build and serialize scene from engine model.

use crate::engine::{WasmStencilProvider, with_engine};
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
