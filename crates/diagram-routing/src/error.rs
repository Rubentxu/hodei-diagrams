//! Routing error types for the diagram-routing crate.
//!
//! All routing operations return [`RoutingResult<T>`] which is a `Result`
//! wrapping [`RoutingError`].

use diagram_core::id::VertexId;

/// Errors that can occur during edge routing.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum RoutingError {
    /// A vertex referenced by an edge has no geometry data.
    #[error("vertex {0} has no geometry")]
    MissingGeometry(VertexId),

    /// Source and target vertices overlap (same centre position).
    #[error("overlapping vertices: source {0} and target {1}")]
    OverlappingVertices(VertexId, VertexId),

    /// The edge style is not supported by this crate.
    #[error("unsupported edge style: {0}")]
    UnsupportedEdgeStyle(String),

    /// The geometry is invalid (e.g., zero area).
    #[error("invalid geometry: {0}")]
    InvalidGeometry(String),
}

/// Convenience alias for `Result<T, RoutingError>`.
pub type RoutingResult<T> = Result<T, RoutingError>;

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::id::VertexId;

    #[test]
    fn missing_geometry_display() {
        let vid = VertexId::default();
        let err = RoutingError::MissingGeometry(vid);
        let msg = err.to_string();
        assert!(msg.contains("vertex"), "msg: {msg}");
        assert!(msg.contains("no geometry"), "msg: {msg}");
    }

    #[test]
    fn overlapping_vertices_display() {
        let s = VertexId::default();
        let t = VertexId::default();
        let err = RoutingError::OverlappingVertices(s, t);
        let msg = err.to_string();
        assert!(msg.contains("overlapping"), "msg: {msg}");
    }

    #[test]
    fn unsupported_style_display() {
        let err = RoutingError::UnsupportedEdgeStyle("curved".into());
        let msg = err.to_string();
        assert!(msg.contains("curved"), "msg: {msg}");
    }

    #[test]
    fn invalid_geometry_display() {
        let err = RoutingError::InvalidGeometry("zero area".into());
        let msg = err.to_string();
        assert!(msg.contains("zero area"), "msg: {msg}");
    }
}
