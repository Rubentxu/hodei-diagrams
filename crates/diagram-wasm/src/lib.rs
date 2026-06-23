//! diagram-wasm — Thin WASM Boundary Adapter
//!
//! # Architecture
//!
//! This crate is a pure translator between JavaScript and the Rust diagram engine.
//! 12 `#[wasm_bindgen]` free functions operate over an opaque `u32` handle into
//! a static `Slab`-backed `Editor` pool.
//!
//! # Error Handling
//!
//! All functions return `Result<T, JsValue>` where `JsValue` carries a string
//! description. No structured error types cross the boundary.
//!
//! # JSON Contract
//!
//! - Commands IN: `{"variant":"AddVertex","payload":{...}}`
//! - Scene OUT: serde serialization of `Scene`
//! - IDs cross as JSON numbers (u64)
//!
//! # Invariants
//!
//! - `unsafe_code = "forbid"` — no unsafe code permitted
//! - Max 64 simultaneous engines per process
//! - No re-entrancy (single `Mutex` acquire per call)
//! - Editor/Model never appear in `#[wasm_bindgen]` signatures

#![forbid(unsafe_code)]
#![deny(missing_docs)]

mod commands;
mod engine;
mod export;
mod import;
mod metadata;
mod render;
mod scene;
mod stencil;

pub use commands::{
    ROUTING_KIND_ORTHOGONAL, ROUTING_KIND_STRAIGHT, connect_vertices, disconnect_edge,
    engine_can_redo, engine_can_undo, execute_command, execute_transaction, get_resolved_style,
    redo, undo,
};
pub use engine::{create_engine, dispose_engine};
pub use export::export_drawio;
pub use import::import_drawio;
pub use metadata::{get_metadata, set_metadata};
pub use render::{render_pages, render_svg};
pub use scene::get_scene;
pub use stencil::{PathCommandDto, parse_stencil_library_xml, parse_stencil_xml};
