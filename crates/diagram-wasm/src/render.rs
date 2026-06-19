//! SVG rendering: render scene pages to SVG strings.

use crate::engine::with_editor;
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
/// The `page_idx` is the flat `u64` index from `render_pages` page_id field.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `SceneError: <detail>` if scene building fails
/// - `PageNotFound: <page_idx>` if the requested page does not exist
#[wasm_bindgen]
pub fn render_svg(handle: u32, page_idx: u64) -> Result<String, JsValue> {
    with_editor(handle, |e| {
        let scene = SceneBuilder::new()
            .build(e.model())
            .map_err(|err| Box::leak(format!("SceneError: {err:?}").into_boxed_str()) as &str)?;

        // Find the page whose slotmap idx matches the flat u64 index
        let page = scene
            .pages
            .iter()
            .find(|p| {
                serde_json::to_value(p.page_id)
                    .ok()
                    .and_then(|v| v["idx"].as_u64())
                    == Some(page_idx)
            })
            .ok_or_else(|| {
                Box::leak(format!("PageNotFound: {page_idx}").into_boxed_str()) as &str
            })?;

        SvgRenderer::new()
            .render(&scene, page.page_id)
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
