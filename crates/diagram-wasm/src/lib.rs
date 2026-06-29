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

mod buffer;
mod commands;
mod engine;
mod export;
mod import;
mod layout;
mod metadata;
mod render;
mod scene;
mod stencil;
mod types;

pub use commands::{
    ROUTING_KIND_ORTHOGONAL, ROUTING_KIND_STRAIGHT, clear_edge_anchor, connect_vertices,
    connect_vertices_anchored, disconnect_edge, engine_can_redo, engine_can_undo, execute_command,
    execute_transaction, get_edge_anchors, get_resolved_style, redo, set_edge_anchor, undo,
};
pub use engine::{create_engine, dispose_engine};
pub use export::{export_drawio, export_drawio_fresh_engine};
pub use import::import_drawio;
pub use layout::{apply_layout, route_all_edges};
pub use metadata::{get_metadata, set_metadata};
pub use render::{get_svg_buffer_len, get_svg_buffer_ptr, render_pages, render_svg, write_svg_to_buffer};
pub use scene::{
    get_scene, get_scene_buffer_capacity, get_scene_buffer_len, get_scene_buffer_ptr,
    write_scene_to_buffer,
};
pub use stencil::{PathCommandDto, parse_stencil_library_xml, parse_stencil_xml};
pub use types::{
    AnchorDto, AnchorEnd, AnchorNormalizedDto, EdgeAnchorsDto, anchor_dto_auto,
    anchor_dto_cardinal, anchor_dto_normalized,
};
