//! Engine-owned stable identifiers.
//!
//! The Diagram Engine is the source of truth for IDs. External identifiers
//! (e.g., `.drawio` `id="..."` attributes) are mapped to and from these
//! internal IDs but never used directly as keys inside slotmap stores.
//!
//! See `docs/adr/0023-use-engine-owned-stable-ids-with-external-id-mapping.md`.

use std::fmt;

slotmap::new_key_type! {
    /// Identifier for a vertex (a node in a diagram).
    pub struct VertexId;
    /// Identifier for an edge (a connection between two vertices).
    pub struct EdgeId;
    /// Identifier for a group (a container for vertices and other groups).
    pub struct GroupId;
    /// Identifier for a page (a tab in the editor).
    pub struct PageId;
    /// Identifier for a style entry in the engine style store.
    pub struct StyleId;
}

// `slotmap::new_key_type!` derives `Copy`, `Clone`, `Default`, `Eq`,
// `PartialEq`, `Ord`, `PartialOrd`, `Hash`, and `Debug`, and (when the
// `serde` feature is enabled on `slotmap`) implements `Serialize` and
// `Deserialize`. It does NOT derive `Display`, so we add a small wrapper
// that uses the FFI-safe 64-bit representation for ergonomic error messages.

macro_rules! impl_display {
    ($name:ident, $label:literal) => {
        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, concat!($label, "#{:#x}"), self.0.as_ffi())
            }
        }
    };
}

impl_display!(VertexId, "vertex");
impl_display!(EdgeId, "edge");
impl_display!(GroupId, "group");
impl_display!(PageId, "page");
impl_display!(StyleId, "style");

/// Access the `(idx, version)` pair of a slotmap key without going through
/// `serde_json`. Implemented for every `new_key_type!` produced in this crate.
///
/// Used by hot paths that need a compact `"idx:version"` representation
/// (e.g. SVG `data-vertex-id` / `data-edge-id` attributes) and by tests
/// that want to assert against the raw slotmap identity without serializing.
///
/// The values match what `slotmap`'s serde impl produces:
/// `version` is the odd-encoded `NonZeroU32::get()` value, and `idx` is the
/// raw slot index. We extract them by decomposing `KeyData::as_ffi()` —
/// `KeyData`'s fields are private in slotmap 1.x, so we cannot read them
/// directly.
pub trait StableIdExt {
    /// Returns `(idx, version)` — the same values slotmap's serde impl emits.
    fn stable_id_parts(&self) -> (u32, u32);
}

macro_rules! impl_stable_id_ext {
    ($($name:ident),* $(,)?) => {
        $(
            impl StableIdExt for $name {
                fn stable_id_parts(&self) -> (u32, u32) {
                    // as_ffi() packs `(version << 32) | idx` into a u64.
                    // version here is the same value serde emits (the odd
                    // NonZeroU32::get()), so the output matches the old
                    // JSON-based stable_id byte-for-byte.
                    let ffi = self.0.as_ffi();
                    let idx = (ffi & 0xffff_ffff) as u32;
                    let version = (ffi >> 32) as u32;
                    (idx, version)
                }
            }
        )*
    };
}

impl_stable_id_ext!(VertexId, EdgeId, GroupId, PageId, StyleId);
