//! `diagram-render-wgpu` — WebGPU render backend for Hodei Diagrams.
//!
//! v1 renders Rect, RoundedRect, Ellipse, and Line elements via a single
//! instanced pipeline with analytic SDF fragment shaders. Groups support
//! scissor-rect clipping. Text and Path are deferred to v2.
//!
//! ## Architecture Invariants
//!
//! - Consumes `diagram_scene::Scene`, never `diagram_core` (ADR-0015)
//! - Style is pre-resolved (ADR-0016/0037) — the renderer never re-resolves
//! - `#![deny(unsafe_code)]` except the documented `bytemuck` carve-out in
//!   `buffers.rs` (ADR-0046)

pub mod error;

pub use error::WgpuError;
