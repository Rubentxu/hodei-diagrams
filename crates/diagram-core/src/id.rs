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
