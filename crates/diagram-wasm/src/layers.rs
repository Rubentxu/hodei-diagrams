//! Layers WASM interface: exposes layer enumeration per page.

use crate::engine::with_engine;
use diagram_core::id::StableIdExt;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct LayerDto {
    idx: u32,
    version: u32,
    name: Option<String>,
    visible: bool,
    locked: bool,
}

#[derive(Serialize)]
struct PageLayersDto {
    page_idx: u32,
    layers: Vec<LayerDto>,
}

/// Get all layers for a given page.
///
/// Returns a JSON `PageLayersDto`: `{ page_idx, layers: [{idx, version, name, visible, locked}, ...] }`.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid.
/// - `PageNotFound` if no page with the given `page_idx` exists.
#[wasm_bindgen]
pub fn get_page_layers(handle: u32, page_idx: u32) -> Result<String, JsValue> {
    let result = with_engine(handle, |e| {
        let editor = &e.editor;
        let model = editor.model();

        // Find the page by its slotmap index (nth by insertion order)
        let page_id = model
            .store
            .pages_with_ids()
            .nth(page_idx as usize)
            .map(|(id, _)| id)
            .ok_or("PageNotFound")?;

        let layers: Vec<LayerDto> = model
            .store
            .layers_with_ids()
            .filter(|(_, l)| l.page_id == page_id)
            .map(|(id, l)| {
                let (idx, version) = id.stable_id_parts();
                LayerDto {
                    idx,
                    version,
                    name: l.name.as_ref().map(|n| n.text.clone()),
                    visible: l.visible,
                    locked: l.locked,
                }
            })
            .collect();

        let dto = PageLayersDto { page_idx, layers };

        serde_json::to_string(&dto)
            .map_err(|err| JsValue::from_str(&format!("SerializeError: {err}")))
    });

    match result {
        Ok(json) => json,
        Err(_) => Err(JsValue::from_str("InvalidHandle")),
    }
}
