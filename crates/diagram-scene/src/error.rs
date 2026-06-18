//! Error types for scene construction.

use diagram_core::{EdgeId, GroupId, VertexId};
use thiserror::Error;

/// Errors that can occur while building a scene from a diagram model.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum SceneError {
    /// The vertex has no geometry attached.
    #[error("vertex {0} has no geometry")]
    MissingGeometry(VertexId),

    /// The edge references a source vertex that does not exist.
    #[error("edge {0} references missing source")]
    DanglingEdgeSource(EdgeId),

    /// The edge references a target vertex that does not exist.
    #[error("edge {0} references missing target")]
    DanglingEdgeTarget(EdgeId),

    /// The group has no geometry attached.
    #[error("group {0} has no geometry")]
    MissingGroupGeometry(GroupId),
}

/// A result type alias for scene operations.
pub type SceneResult<T> = Result<T, SceneError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scene_error_missing_geometry_display() {
        let err = SceneError::MissingGeometry(VertexId::default());
        let s = format!("{}", err);
        assert!(s.contains("vertex"), "Display should contain 'vertex'");
    }

    #[test]
    fn scene_error_dangling_edge_source_display() {
        let err = SceneError::DanglingEdgeSource(EdgeId::default());
        let s = format!("{}", err);
        assert!(s.contains("edge"), "Display should contain 'edge'");
    }

    #[test]
    fn scene_error_dangling_edge_target_display() {
        let err = SceneError::DanglingEdgeTarget(EdgeId::default());
        let s = format!("{}", err);
        assert!(s.contains("edge"), "Display should contain 'edge'");
    }

    #[test]
    fn scene_error_missing_group_geometry_display() {
        let err = SceneError::MissingGroupGeometry(GroupId::default());
        let s = format!("{}", err);
        assert!(s.contains("group"), "Display should contain 'group'");
    }
}
