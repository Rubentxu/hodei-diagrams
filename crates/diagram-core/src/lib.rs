//! # diagram-core
//!
//! Domain model for the Hodei Diagrams Diagram Engine. This crate owns the
//! semantic model — pages, vertices, edges, groups, geometry, styles, labels,
//! and engine-owned stable identifiers — and exposes them through slotmap
//! stores. It is the inner layer of the Semantic Port and must not depend on
//! any format, render, or web concern.
//!
//! See `docs/adr/0010-foundational-crate-matrix-by-layer.md`,
//! `docs/adr/0020-core-model-starts-with-pages-groups-styles-and-labels.md`,
//! and `docs/adr/0023-use-engine-owned-stable-ids-with-external-id-mapping.md`.

#![deny(missing_docs)]

pub mod edge;
pub mod error;
pub mod geometry;
pub mod group;
pub mod id;
pub mod label;
pub mod layer;
pub mod model;
pub mod page;
pub mod selection;
pub mod store;
pub mod style;
pub mod vertex;

pub use edge::Edge;
pub use error::CoreError;
pub use geometry::CellGeometry;
pub use geometry::Point;
pub use group::Group;
pub use id::{EdgeId, GroupId, LayerId, PageId, StableIdExt, StyleId, VertexId};
pub use label::Label;
pub use layer::Layer;
pub use model::DiagramModel;
pub use model::Metadata;
pub use page::Page;
pub use selection::{
    HitStack, SceneAccess, SelectionModifiers, SelectionState, SelectionTarget, compute_hit_stack,
    is_target_locked, resolve_selection_intent,
};
pub use store::ModelStore;
pub use style::{StyleMap, StyleValue};
pub use vertex::Vertex;
