//! Drawio export: serialize the engine model back to `.drawio` XML.
//!
//! This is the mirror of [`crate::import::import_drawio`]. It reads the stored
//! [`IdMap`] from the [`Editor`], converts the domain model back to a raw
//! drawio document via [`DrawioMapping::to_raw`], and serializes it to XML
//! via [`write_drawio`].
//!
//! # Thin-adapter constraint
//!
//! No format logic lives in this module. All mapping and serialization is
//! delegated to `diagram_format_drawio`. This module is purely a bridge:
//! acquire engine lock → delegate to format crate → return `Result<String, JsValue>`.
//!
//! # Errors
//!
//! - `InvalidHandle` if the engine handle is invalid
//! - `ExportFailed: no import context` if the model was not imported
//! - `ExportFailed: to_raw: <error>` if domain→raw mapping fails
//! - `ExportFailed: write: <error>` if XML serialization fails

use crate::engine::with_engine;
use diagram_format_drawio::{DrawioMapping, synthesize_id_map};
use wasm_bindgen::prelude::*;

/// Export the engine's model to a `.drawio` XML string.
///
/// Requires that the model was imported from a `.drawio` file (i.e., an
/// [`IdMap`] is stored). Returns an error with prefix `ExportFailed:` if
/// no import context is available or if serialization fails.
///
/// Mirrors the shape of [`crate::import::import_drawio`]: acquire engine
/// lock, delegate to format crate, return `Result<String, JsValue>`.
#[wasm_bindgen]
pub fn export_drawio(handle: u32) -> Result<String, JsValue> {
    with_engine(handle, |e| {
        // Guard: require an import-time IdMap
        let id_map = e.editor.id_map().ok_or("ExportFailed: no import context")?;

        // Convert domain model back to raw drawio document
        let raw = DrawioMapping::new()
            .to_raw(e.editor.model(), id_map, &mut Vec::new())
            .map_err(|e| {
                Box::leak(format!("ExportFailed: to_raw: {e:?}").into_boxed_str()) as &str
            })?;

        // Serialize raw document to XML string
        let xml = diagram_format_drawio::write_drawio(&raw).map_err(|e| {
            Box::leak(format!("ExportFailed: write: {e:?}").into_boxed_str()) as &str
        })?;

        Ok(xml)
    })
    .and_then(|r| r)
    .map_err(JsValue::from_str)
}

/// Export the engine's model using a synthesized [`IdMap`].
///
/// Unlike [`export_drawio`], this does **not** require an import-time ID mapping.
/// It synthesizes sequential IDs (`v0`, `v1`, …, `e0`, `e1`, …, `g0`, `g1`, …)
/// from the current model state.
///
/// This is intended for:
/// - Version history snapshots (ADR-0064)
/// - Exporting a fresh engine that was built programmatically
///
/// Does NOT modify editor state.
///
/// # Errors
///
/// - `InvalidHandle` if the engine handle is invalid
/// - `ExportFailed: to_raw: <error>` if domain→raw mapping fails
/// - `ExportFailed: write: <error>` if XML serialization fails
#[wasm_bindgen]
pub fn export_drawio_fresh_engine(handle: u32) -> Result<String, JsValue> {
    export_with_synthesized_id_map(handle).map_err(JsValue::from_str)
}

/// Internal helper: export with a synthesized IdMap.
///
/// Does NOT modify editor state and does NOT require import context.
fn export_with_synthesized_id_map(handle: u32) -> Result<String, &'static str> {
    with_engine(handle, |e| {
        let model = e.editor.model();

        // Synthesize IdMap from current model state
        let id_map = synthesize_id_map(model);

        // Convert domain model back to raw drawio document
        let raw = DrawioMapping::new()
            .to_raw(model, &id_map, &mut Vec::new())
            .map_err(|e| {
                Box::leak(format!("ExportFailed: to_raw: {e:?}").into_boxed_str()) as &str
            })?;

        // Serialize raw document to XML string
        let xml = diagram_format_drawio::write_drawio(&raw).map_err(|e| {
            Box::leak(format!("ExportFailed: write: {e:?}").into_boxed_str()) as &str
        })?;

        Ok(xml)
    })
    .and_then(|r| r)
}
