//! Engine pool: manages a static slab of `WasmEngine` instances.

use crate::buffer::BufferManager;
use diagram_commands::Editor;
use diagram_core::DiagramModel;
use diagram_scene::{
    PathCommand as ScenePathCommand, StencilAspect as SceneStencilAspect, StencilProvider,
};
use diagram_stencils::Stencil;
use parking_lot::Mutex;
use slab::Slab;
use std::collections::HashMap;
use std::sync::LazyLock;
use wasm_bindgen::prelude::*;

/// Maximum number of simultaneous engine instances.
pub(crate) const MAX_ENGINES: usize = 64;

/// Engine state: holds the editor plus WASM-specific caches.
pub struct WasmEngine {
    /// The diagram editor instance.
    pub(crate) editor: Editor,
    /// Loaded stencil libraries keyed by library name.
    pub(crate) stencil_libraries: HashMap<String, Vec<Stencil>>,
    /// Zero-copy bridge buffers for high-frequency data exchange.
    pub(crate) buffers: BufferManager,
}

impl WasmEngine {
    /// Create a new engine with an empty stencil library cache.
    pub fn new() -> Self {
        Self {
            editor: Editor::new(DiagramModel::default()),
            stencil_libraries: HashMap::new(),
            buffers: BufferManager::new(),
        }
    }
}

impl Default for WasmEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// The global engine pool: maps `u32` handle → `WasmEngine`.
static ENGINES: LazyLock<Mutex<Slab<WasmEngine>>> = LazyLock::new(|| Mutex::new(Slab::new()));

/// Opaque handle type for engine instances.
///
/// Internally this is a `u32` index into the [`ENGINES`] slab. The JS side
/// sees only the raw `u32` — no `wasm_bindgen` wrapper struct is exposed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub struct WasmEngineHandle(u32);

#[allow(dead_code)]
impl WasmEngineHandle {
    /// Create from a raw `u32`.
    #[inline]
    pub fn from_u32(v: u32) -> Self {
        Self(v)
    }

    /// Convert to a raw `u32`.
    #[inline]
    pub fn as_u32(self) -> u32 {
        self.0
    }
}

/// Shared error message for invalid handles.
const ERR_INVALID_HANDLE: &str = "InvalidHandle";

/// Execute a read-only closure over an engine, returning `Err` if the handle
/// is invalid.
pub(crate) fn with_engine<F, R>(handle: u32, f: F) -> Result<R, &'static str>
where
    F: FnOnce(&WasmEngine) -> R,
{
    let slab = ENGINES.lock();
    slab.get(handle as usize).ok_or(ERR_INVALID_HANDLE).map(f)
}

/// Execute a mutable closure over an engine, returning `Err` if the handle
/// is invalid.
pub(crate) fn with_engine_mut<F, R>(handle: u32, f: F) -> Result<R, &'static str>
where
    F: FnOnce(&mut WasmEngine) -> R,
{
    let mut slab = ENGINES.lock();
    slab.get_mut(handle as usize)
        .ok_or(ERR_INVALID_HANDLE)
        .map(f)
}

/// Create a new engine and return its opaque handle.
///
/// # Errors
///
/// Returns `Err` if the pool is full (> 64 engines).
#[wasm_bindgen]
pub fn create_engine() -> Result<u32, JsValue> {
    let mut slab = ENGINES.lock();
    if slab.len() >= MAX_ENGINES {
        return Err(JsValue::from_str("TooManyEngines"));
    }
    let key = slab.insert(WasmEngine::new());
    Ok(key as u32)
}

/// Dispose of an engine by handle.
///
/// Idempotent: returns `Ok(())` even if the handle was already disposed.
#[wasm_bindgen]
pub fn dispose_engine(handle: u32) -> Result<(), JsValue> {
    let mut slab = ENGINES.lock();
    // Remove only if the key is present (Slab::remove panics on invalid keys)
    if slab.contains(handle as usize) {
        slab.remove(handle as usize);
    }
    Ok(())
}

/// Load a stencil library XML into the engine's cache.
///
/// Replaces any existing library with the same name.
///
/// # Errors
///
/// Returns `Err` if the handle is invalid or the XML cannot be parsed.
#[wasm_bindgen]
pub fn set_stencil_library(handle: u32, library: &str, xml: &str) -> Result<(), JsValue> {
    let stencils = diagram_stencils::parse_stencil_library(xml)
        .map_err(|e| JsValue::from_str(&format!("StencilParseError: {e}")))?;

    with_engine_mut(handle, |engine| {
        // Normalize each stencil before storing
        let normalized: Vec<Stencil> = stencils.into_iter().map(|s| s.normalize()).collect();
        engine
            .stencil_libraries
            .insert(library.to_string(), normalized);
    })
    .map_err(|_| JsValue::from_str(ERR_INVALID_HANDLE))
}

/// A `StencilProvider` backed by a HashMap of parsed stencil libraries.
///
/// This is constructed in `get_scene()` with a clone of the engine's
/// `stencil_libraries` cache, allowing the scene builder to resolve
/// `stencil:<library>:<name>` references without a direct dependency on
/// `diagram-stencils`.
#[derive(Clone)]
pub struct WasmStencilProvider {
    libraries: HashMap<String, Vec<Stencil>>,
}

impl WasmStencilProvider {
    pub fn new(libraries: HashMap<String, Vec<Stencil>>) -> Self {
        Self { libraries }
    }
}

impl StencilProvider for WasmStencilProvider {
    fn lookup(
        &self,
        library: &str,
        name: &str,
    ) -> Option<(
        SceneStencilAspect,
        Vec<ScenePathCommand>,
        Vec<ScenePathCommand>,
    )> {
        let stencils = self.libraries.get(library)?;
        let stencil = stencils.iter().find(|s| s.name == name)?;
        // PathCommand is re-exported identically from diagram_stencils via diagram_scene
        Some((
            stencil.aspect.into(),
            stencil.background.clone(),
            stencil.foreground.clone(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wasm_engine_has_empty_stencil_cache_on_creation() {
        let engine = WasmEngine::new();
        assert!(engine.stencil_libraries.is_empty());
    }

    #[test]
    fn stencil_library_can_be_inserted_and_retrieved() {
        let xml = r#"<shapes name="test">
            <shape name="Box" w="100" h="50"/>
            <shape name="Circle" w="80" h="80"/>
        </shapes>"#;

        let stencils = diagram_stencils::parse_stencil_library(xml).unwrap();
        let normalized: Vec<Stencil> = stencils.into_iter().map(|s| s.normalize()).collect();

        let mut engine = WasmEngine::new();
        engine
            .stencil_libraries
            .insert("test".to_string(), normalized);

        let retrieved = engine.stencil_libraries.get("test").unwrap();
        assert_eq!(retrieved.len(), 2);
        assert_eq!(retrieved[0].name, "Box");
        assert_eq!(retrieved[1].name, "Circle");
    }

    #[test]
    fn second_set_overwrites_previous_library() {
        let xml1 = r#"<shapes name="v1"><shape name="Shape1" w="100" h="100"/></shapes>"#;
        let xml2 = r#"<shapes name="v2"><shape name="Shape2" w="200" h="200"/></shapes>"#;

        let stencils1 = diagram_stencils::parse_stencil_library(xml1).unwrap();
        let stencils2 = diagram_stencils::parse_stencil_library(xml2).unwrap();

        let mut engine = WasmEngine::new();
        engine.stencil_libraries.insert(
            "lib".to_string(),
            stencils1.into_iter().map(|s| s.normalize()).collect(),
        );
        engine.stencil_libraries.insert(
            "lib".to_string(),
            stencils2.into_iter().map(|s| s.normalize()).collect(),
        );

        let retrieved = engine.stencil_libraries.get("lib").unwrap();
        assert_eq!(retrieved.len(), 1);
        assert_eq!(retrieved[0].name, "Shape2");
    }
}
