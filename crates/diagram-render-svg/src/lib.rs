//! # diagram-render-svg
//!
//! SVG-first rendering backend for the Hodei diagram engine.
//!
//! ## Design Contracts
//!
//! - ADR-0003: SVG is the first visual surface.
//! - ADR-0015: Renderer consumes a `Scene`, not `diagram-core` directly.

#![deny(missing_docs)]
#![deny(unsafe_code)]

pub mod clip;
pub mod element;
pub mod error;
pub mod escape;
pub mod renderer;
pub mod style;

pub use error::RenderError;
pub use renderer::SvgRenderer;
