//! Error types for the diagram-layout crate.
//!
//! All layout operations return [`LayoutResult<T>`] which is a `Result`
//! wrapping [`LayoutError`].

use diagram_core::id::VertexId;

/// Errors that can occur during diagram layout.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum LayoutError {
    /// A vertex referenced by an edge has no geometry data.
    #[error("vertex {0} has no geometry")]
    MissingGeometry(VertexId),

    /// The direction string was not recognized.
    #[error("unsupported direction: {0}")]
    UnsupportedDirection(String),

    /// An algorithm-internal failure occurred.
    #[error("layout failed: {0}")]
    LayoutFailed(String),

    /// A petgraph operation returned an error (opaque).
    #[error("petgraph error: {0}")]
    Petgraph(String),

    /// Tree validation: the graph has multiple roots (vertices with no incoming edges).
    #[error("multiple roots: {0:?}")]
    MultipleRoots(Vec<VertexId>),

    /// Tree validation: a cycle was detected in the graph.
    #[error("cycle detected: {0:?}")]
    CycleDetected(Vec<VertexId>),

    /// Tree validation: a vertex has more than one incoming edge.
    #[error("vertex {0} has multiple parents: {1:?}")]
    MultipleParents(VertexId, Vec<VertexId>),

    /// Tree validation: no root found (graph is empty or all vertices have incoming edges).
    #[error("no root found")]
    NoRoot,

    /// Tree validation: unknown layout kind encountered.
    #[error("unknown layout kind: {0}")]
    UnknownKind(String),
}

/// Convenience alias for `Result<T, LayoutError>`.
pub type LayoutResult<T> = Result<T, LayoutError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_geometry_display() {
        let vid = VertexId::default();
        let err = LayoutError::MissingGeometry(vid);
        let msg = err.to_string();
        assert!(msg.contains("vertex"), "msg: {msg}");
        assert!(msg.contains("no geometry"), "msg: {msg}");
    }

    #[test]
    fn unsupported_direction_display() {
        let err = LayoutError::UnsupportedDirection("diagonal".into());
        let msg = err.to_string();
        assert!(msg.contains("diagonal"), "msg: {msg}");
    }

    #[test]
    fn layout_failed_display() {
        let err = LayoutError::LayoutFailed("cycle detection overflow".into());
        let msg = err.to_string();
        assert!(msg.contains("layout failed"), "msg: {msg}");
        assert!(msg.contains("cycle detection"), "msg: {msg}");
    }

    #[test]
    fn petgraph_error_display() {
        let err = LayoutError::Petgraph("node index out of bounds".into());
        let msg = err.to_string();
        assert!(msg.contains("petgraph"), "msg: {msg}");
    }

    #[test]
    fn multiple_roots_display() {
        let v1 = VertexId::default();
        let v2 = VertexId::default();
        let err = LayoutError::MultipleRoots(vec![v1, v2]);
        let msg = err.to_string();
        assert!(msg.contains("multiple roots"), "msg: {msg}");
    }

    #[test]
    fn cycle_detected_display() {
        let v1 = VertexId::default();
        let v2 = VertexId::default();
        let err = LayoutError::CycleDetected(vec![v1, v2]);
        let msg = err.to_string();
        assert!(msg.contains("cycle detected"), "msg: {msg}");
    }

    #[test]
    fn multiple_parents_display() {
        let v1 = VertexId::default();
        let v2 = VertexId::default();
        let v3 = VertexId::default();
        let err = LayoutError::MultipleParents(v1, vec![v2, v3]);
        let msg = err.to_string();
        assert!(msg.contains("multiple parents"), "msg: {msg}");
    }

    #[test]
    fn no_root_display() {
        let err = LayoutError::NoRoot;
        let msg = err.to_string();
        assert!(msg.contains("no root"), "msg: {msg}");
    }

    #[test]
    fn unknown_kind_display() {
        let err = LayoutError::UnknownKind("Radial".into());
        let msg = err.to_string();
        assert!(msg.contains("unknown layout kind"), "msg: {msg}");
    }
}
