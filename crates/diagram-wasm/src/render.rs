//! SVG rendering: render scene pages to SVG strings.

use crate::engine::{WasmStencilProvider, with_engine, with_engine_mut};
use diagram_render_svg::SvgRenderer;
use diagram_scene::SceneBuilder;
use wasm_bindgen::prelude::*;

#[derive(serde::Serialize)]
struct PageRender {
    /// Full slotmap key (idx + version). Storing only the `idx` would
    /// drop the version, so RemovePage / SetPageMathEnabled calls from
    /// the TS editor would fail to find the page.
    page_id: diagram_core::PageId,
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
    with_engine(handle, |e| {
        let provider = WasmStencilProvider::new(e.stencil_libraries.clone());
        let scene = SceneBuilder::new()
            .with_stencil_provider(Box::new(provider))
            .build(e.editor.model())
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
    with_engine(handle, |e| {
        let provider = WasmStencilProvider::new(e.stencil_libraries.clone());
        let scene = SceneBuilder::new()
            .with_stencil_provider(Box::new(provider))
            .build(e.editor.model())
            .map_err(|err| Box::leak(format!("SceneError: {err:?}").into_boxed_str()) as &str)?;

        let pages: Vec<PageRender> = SvgRenderer::new()
            .render_pages(&scene)
            .map_err(|err| Box::leak(format!("{err:?}").into_boxed_str()) as &str)?
            .into_iter()
            .map(|(page_id, svg)| PageRender { page_id, svg })
            .collect();

        serde_json::to_string(&pages)
            .map_err(|e| Box::leak(format!("Serialize: {e}").into_boxed_str()) as &str)
    })
    .and_then(|r| r)
    .map_err(JsValue::from_str)
}

// ─── Zero-copy SVG buffer (Phase 2 / P2-3 Phase C) ──────────────────────────
//
// Render SVG to a pre-allocated slab in WASM linear memory. JS reads
// the bytes directly via `new Uint8Array(wasm.memory.buffer, ptr, len)`
// and decodes as UTF-8 — zero copy, no String round-trip.

/// Render the page at `page_idx` to the engine's SVG buffer.
/// Returns the number of bytes written. JS then calls
/// `get_svg_buffer_ptr` and `get_svg_buffer_len` to read the data.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `SceneError: <detail>` if scene building fails
/// - `PageNotFound: <page_idx>` if the page doesn't exist
/// - `<render error>` if the SVG renderer fails
#[wasm_bindgen]
pub fn write_svg_to_buffer(handle: u32, page_idx: u64) -> Result<usize, JsValue> {
    with_engine_mut(handle, |e| {
        // Build scene (borrows e.editor immutably)
        let provider = WasmStencilProvider::new(e.stencil_libraries.clone());
        let scene = SceneBuilder::new()
            .with_stencil_provider(Box::new(provider))
            .build(e.editor.model())
            .map_err(|err| Box::leak(format!("SceneError: {err:?}").into_boxed_str()) as &str)?;

        // Find the page
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

        // Render the page (produces owned String)
        let svg = SvgRenderer::new()
            .render(&scene, page.page_id)
            .map_err(|err| Box::leak(format!("{err:?}").into_boxed_str()) as &str)?;

        // Write to the SVG buffer (borrows e.buffers mutably — different field, OK)
        let written = e.buffers.svg.write(svg.as_bytes());
        Ok(written)
    })
    .and_then(|r| r)
    .map_err(JsValue::from_str)
}

/// Get the raw pointer to the SVG buffer data.
///
/// JS creates a `Uint8Array` view: `new Uint8Array(wasm.memory.buffer, ptr, len)`
/// and decodes UTF-8 via `new TextDecoder().decode(bytes)`.
#[wasm_bindgen]
pub fn get_svg_buffer_ptr(handle: u32) -> usize {
    with_engine(handle, |e| e.buffers.svg.as_ptr() as usize).unwrap_or(0)
}

/// Get the current data length of the SVG buffer.
#[wasm_bindgen]
pub fn get_svg_buffer_len(handle: u32) -> usize {
    with_engine(handle, |e| e.buffers.svg.len()).unwrap_or(0)
}
