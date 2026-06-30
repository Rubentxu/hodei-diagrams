//! Drawio import: parse, replace engine model, and retain IdMap for export.

use crate::engine::with_engine_mut;
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
    with_engine_mut(handle, |e| {
        // Parse raw XML
        let raw = diagram_format_drawio::parse_drawio(xml).map_err(|e| {
            Box::leak(format!("ImportFailed: parse: {e:?}").into_boxed_str()) as &str
        })?;

        // Map to domain model
        let (model, id_map) = DrawioMapping::new().to_domain(&raw).map_err(|e| {
            Box::leak(format!("ImportFailed: mapping: {e:?}").into_boxed_str()) as &str
        })?;

        // Replace model atomically, storing the IdMap for later export
        e.editor.replace_model(model, Some(id_map));
        Ok(())
    })
    .and_then(|r| r)
    .map_err(JsValue::from_str)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::{create_engine, dispose_engine};
    use crate::export::export_drawio;
    use crate::scene::get_scene;

    /// Round-trip test: import a fixture, export the engine back, re-import
    /// the export, and verify the scene is stable across the round-trip.
    ///
    /// This catches subtle bugs in the engine↔.drawio mapping: if a
    /// field is dropped on export, the second import produces a smaller
    /// scene; if a field is synthesized (not round-trippable), the
    /// second scene differs from the first.
    ///
    /// Uses `export_drawio_fresh_engine` for the second pass because the
    /// first pass's IdMap is consumed by `replace_model`. Synthesizing a
    /// fresh IdMap on the second pass lets us test the same engine state
    /// through a re-import without coupling to the first IdMap's
    /// internals. Both passes must agree on the *content* of the scene
    /// (vertices/edges/groups) — the IdMap is just an identifier
    /// translation table.
    ///
    /// Cycle 24 closes the import/export surface for v0.78+; the same
    /// property is already covered indirectly by the e2e suite but
    /// had no native Rust unit test.
    #[test]
    fn import_export_reimport_round_trip_preserves_scene() {
        let handle = create_engine().expect("create_engine returns a valid handle");

        let xml = include_str!("../../../web-shell/public/fixtures/multi-shapes.drawio");
        import_drawio(handle, xml).expect("first import succeeds");

        // First-pass export: uses the IdMap stored by import_drawio.
        let first_export =
            export_drawio(handle).expect("export after import succeeds (IdMap present)");

        // Second engine to isolate the second-pass state from any first-pass
        // mutation. Both engines go through the same fixture-derived model.
        let handle2 = create_engine().expect("second engine for round-trip");
        import_drawio(handle2, &first_export).expect("re-import of export succeeds");

        // Re-export the second engine. The scenes must agree on the
        // vertex/edge/group counts at least — and ideally on the full
        // text of the round-trip.
        let second_export =
            crate::export::export_drawio_fresh_engine(handle2).expect("re-export succeeds");
        let first_re_parsed = crate::export::export_drawio_fresh_engine(handle)
            .expect("first engine re-export (synthesized) succeeds");

        // The two fresh exports (which both go through synthesized IdMap
        // and therefore share the same ID semantics) must serialize to
        // the same text. This is the strict form of the round-trip
        // property: the engine + .drawio mapping is lossless.
        assert_eq!(
            second_export, first_re_parsed,
            "scene must round-trip losslessly: import -> export -> re-import -> re-export"
        );

        // Sanity: the second engine actually has the imported content
        // (not empty). Just check the JSON is non-empty.
        let scene = get_scene(handle2).expect("get_scene works on second engine");
        assert!(
            !scene.is_empty(),
            "scene JSON should not be empty after import"
        );

        let _ = dispose_engine(handle);
        let _ = dispose_engine(handle2);
    }

    // Negative-case import (e.g. malformed XML, empty file) is covered
    // indirectly by error-path e2e tests. Testing it natively here
    // would require a wasm-bindgen-test harness because the import
    // function's Err path uses JsValue::from_str which panics on
    // native targets.
}
