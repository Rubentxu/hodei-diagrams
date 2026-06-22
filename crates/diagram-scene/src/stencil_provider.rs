//! Stencil provider trait: allows SceneBuilder to resolve stencils from
//! external (WASM) library caches without depending on diagram-stencils.

use crate::element::{PathCommand, StencilAspect};

/// Provides stencil definitions from an external source (e.g. WASM engine cache).
///
/// This trait decouples `diagram-scene` from `diagram-stencils`, enabling the
/// WASM engine to inject its in-memory library cache into the scene build pipeline.
pub trait StencilProvider: Send + Sync {
    /// Look up a single stencil by library name and stencil name.
    ///
    /// Returns `(aspect, background_commands, foreground_commands)` on success.
    /// Returns `None` if the library or stencil name is not found.
    fn lookup(
        &self,
        library: &str,
        name: &str,
    ) -> Option<(StencilAspect, Vec<PathCommand>, Vec<PathCommand>)>;
}

/// A no-op stencil provider used when no external cache is configured.
impl StencilProvider for () {
    fn lookup(
        &self,
        _library: &str,
        _name: &str,
    ) -> Option<(StencilAspect, Vec<PathCommand>, Vec<PathCommand>)> {
        None
    }
}
