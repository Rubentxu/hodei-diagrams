//! diagram-wasm — Thin WASM Boundary Adapter
//!
//! # Architecture
//!
//! This crate is a pure translator between JavaScript and the Rust diagram engine.
//! 11 `#[wasm_bindgen]` free functions operate over an opaque `u32` handle into
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
mod import;
mod render;
mod scene;

pub use commands::{engine_can_redo, engine_can_undo, execute_command, redo, undo};
pub use engine::{create_engine, dispose_engine};
pub use import::import_drawio;
pub use render::{render_pages, render_svg};
pub use scene::get_scene;
