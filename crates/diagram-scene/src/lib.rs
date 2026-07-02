//! # diagram-scene
//!
//! Render-agnostic projection layer: pure-function `&DiagramModel -> Scene`.
//!
//! ## Architecture
//!
//! This crate is the scene-projection layer of the Hodei Diagram Engine. It
//! consumes a `DiagramModel` and produces a `Scene` — an owned, multi-page,
//! deterministic display list ready for any render backend (SVG, WebGPU, etc.).
//!
//! ## Key Types
//!
//! - [`Scene`] — the top-level output, containing pages with display lists.
//! - [`PageScene`] — a single page's projected scene.
//! - [`SceneBuilder`] — the pure function `&DiagramModel -> Result<Scene, SceneError>`.
//! - [`VisualElement`] — enum of all renderable element kinds.
//! - [`StyleResolver`] — resolves a `StyleMap` into typed `ResolvedStyle` fields.
//!
//! ## Design Contracts
//!
//! - ADR-0015: Renderers consume a scene, not core directly.
//! - ADR-0016: Style resolution happens in the engine, not per-renderer.
//! - ADR-0023: Elements carry typed engine IDs (`VertexId`, `EdgeId`, `GroupId`).
//! - ADR-0036: Scene shape — hybrid list + nested group.
//! - ADR-0037: Eager style resolution in diagram-scene.

#![deny(missing_docs)]

pub mod builder;
pub mod element;
pub mod error;
pub mod hit_tester;
pub mod resolver;
pub mod scene;
pub mod stencil_provider;
pub mod stencil_registry;

pub use builder::SceneBuilder;
pub use diagram_core::id::PageId;
pub use element::{
    CloudElement, CylinderElement, DEFAULT_ROUNDED_RADIUS, DiamondElement, EllipseElement,
    EntityId, GroupElement, HexagonElement, ImageAspect, ImageElement, LineElement,
    ParallelogramElement, PathCommand, PathElement, PolygonElement, RectElement,
    RoundedRectElement, StencilAspect, StencilElement, SwimlaneHeader, TextElement,
    TrapezoidElement, TriangleElement, VisualElement,
};
pub use error::{SceneError, SceneResult};
pub use resolver::{ResolvedStyle, ShapeKind, StyleResolver};
pub use scene::{PageScene, Scene};
pub use stencil_provider::StencilProvider;
