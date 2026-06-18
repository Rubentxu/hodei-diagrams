//! SVG rendering: render scene pages to SVG strings.

use crate::engine::with_editor;
use diagram_core::PageId;
use diagram_render_svg::SvgRenderer;
use diagram_scene::SceneBuilder;
use wasm_bindgen::prelude::*;

#[derive(serde::Serialize)]
struct PageRender {
    page_id: u64,
    svg: String,
}

/// Render a single page to an SVG string.
///
/// The `page_id_json` must be a JSON string representing the `PageId` (slotmap key).
///
/// # Errors
///
/// - `InvalidPageId: <detail>` if the JSON cannot be parsed as PageId
/// - `InvalidHandle` if the engine handle is invalid
/// - `SceneError: <detail>` if scene building fails
/// - `PageNotFound: <page_id>` if the requested page does not exist
#[wasm_bindgen]
pub fn render_svg(handle: u32, page_id_json: &str) -> Result<String, JsValue> {
    // Parse PageId from JSON inside the closure so errors convert to &'static str
    with_editor(handle, |e| {
        let page_id: PageId = serde_json::from_str(page_id_json)
            .map_err(|e| Box::leak(format!("InvalidPageId: {e}").into_boxed_str()) as &str)?;

        let scene = SceneBuilder::new()
            .build(e.model())
            .map_err(|err| Box::leak(format!("SceneError: {err:?}").into_boxed_str()) as &str)?;
        SvgRenderer::new()
            .render(&scene, page_id)
            .map_err(|err| Box::leak(format!("{err:?}").into_boxed_str()) as &str)
    })
    .and_then(|r| r)
    .map_err(JsValue::from_str)
}

/// Render all pages and return a JSON array of `{page_id, svg}` objects.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `SceneError: <detail>` if scene building fails
#[wasm_bindgen]
pub fn render_pages(handle: u32) -> Result<String, JsValue> {
    with_editor(handle, |e| {
        let scene = SceneBuilder::new()
            .build(e.model())
            .map_err(|err| Box::leak(format!("SceneError: {err:?}").into_boxed_str()) as &str)?;

        let pages: Vec<PageRender> = SvgRenderer::new()
            .render_pages(&scene)
            .map_err(|err| Box::leak(format!("{err:?}").into_boxed_str()) as &str)?
            .into_iter()
            .map(|(page_id, svg)| {
                // PageId serializes as {"idx":..., "version":...} via slotmap serde
                let page_id_value = serde_json::to_value(page_id).expect("PageId should serialize");
                let page_id_index = page_id_value
                    .as_object()
                    .expect("PageId should serialize to object")["idx"]
                    .as_u64()
                    .expect("PageId idx should be u64") as u64;
                PageRender {
                    page_id: page_id_index,
                    svg,
                }
            })
            .collect();

        serde_json::to_string(&pages)
            .map_err(|e| Box::leak(format!("Serialize: {e}").into_boxed_str()) as &str)
    })
    .and_then(|r| r)
    .map_err(JsValue::from_str)
}
