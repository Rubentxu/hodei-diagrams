//! Engine pool: manages a static slab of `Editor` instances.

use diagram_commands::Editor;
use diagram_core::DiagramModel;
use parking_lot::Mutex;
use slab::Slab;
use std::sync::LazyLock;
use wasm_bindgen::prelude::*;

/// Maximum number of simultaneous engine instances.
pub(crate) const MAX_ENGINES: usize = 64;

/// The global engine pool: maps `u32` handle → `Editor`.
static ENGINES: LazyLock<Mutex<Slab<Editor>>> = LazyLock::new(|| Mutex::new(Slab::new()));

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
pub(crate) fn with_editor<F, R>(handle: u32, f: F) -> Result<R, &'static str>
where
    F: FnOnce(&Editor) -> R,
{
    let slab = ENGINES.lock();
    slab.get(handle as usize).ok_or(ERR_INVALID_HANDLE).map(f)
}

/// Execute a mutable closure over an engine, returning `Err` if the handle
/// is invalid.
pub(crate) fn with_editor_mut<F, R>(handle: u32, f: F) -> Result<R, &'static str>
where
    F: FnOnce(&mut Editor) -> R,
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
    let key = slab.insert(Editor::new(DiagramModel::default()));
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
