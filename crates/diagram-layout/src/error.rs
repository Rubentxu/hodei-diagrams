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
}
