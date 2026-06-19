//! Error types for WebGPU rendering.

use std::fmt;

/// Errors that can occur during WebGPU rendering.
#[non_exhaustive]
#[derive(Debug)]
pub enum WgpuError {
    /// The requested page was not found in the scene.
    PageNotFound {
        /// The page ID that was not found.
        page_id: diagram_scene::PageId,
    },
    /// The GPU device was lost.
    DeviceLost,
    /// A surface error occurred.
    SurfaceError(String),
    /// The render pipeline could not be created.
    PipelineCreation(String),
    /// A GPU buffer could not be created.
    BufferCreation(String),
    /// A shader module failed to compile.
    ShaderCompilation(String),
    /// An invalid color string was encountered.
    InvalidColor(String),
}

impl fmt::Display for WgpuError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WgpuError::PageNotFound { page_id } => {
                write!(f, "page not found: {page_id:?}")
            }
            WgpuError::DeviceLost => {
                write!(f, "GPU device lost")
            }
            WgpuError::SurfaceError(msg) => {
                write!(f, "surface error: {msg}")
            }
            WgpuError::PipelineCreation(msg) => {
                write!(f, "pipeline creation failed: {msg}")
            }
            WgpuError::BufferCreation(msg) => {
                write!(f, "buffer creation failed: {msg}")
            }
            WgpuError::ShaderCompilation(msg) => {
                write!(f, "shader compilation failed: {msg}")
            }
            WgpuError::InvalidColor(msg) => {
                write!(f, "invalid color: {msg}")
            }
        }
    }
}

impl std::error::Error for WgpuError {}
