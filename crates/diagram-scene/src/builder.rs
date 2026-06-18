//! Scene builder: the pure function `&DiagramModel -> Result<Scene, SceneError>`.
//!
//! `SceneBuilder` and its `build` method are implemented in PR2. This stub
//! exists to keep the workspace compiling during the skeleton PR.

use super::{Scene, SceneResult};

/// The scene builder — constructs a `Scene` from a `DiagramModel`.
#[derive(Debug, Default)]
pub struct SceneBuilder {
    #[allow(dead_code)]
    resolver: super::StyleResolver,
}

impl SceneBuilder {
    /// Creates a new `SceneBuilder`.
    pub fn new() -> Self {
        Self::default()
    }

    /// Builds a `Scene` from the given diagram model.
    ///
    /// This is a pure function — calling it twice with the same model
    /// produces byte-identical scenes.
    pub fn build(&self, _model: &diagram_core::DiagramModel) -> SceneResult<Scene> {
        // Implemented in PR2.
        Ok(Scene::default())
    }
}
