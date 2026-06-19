//! GPU buffer types for the shape pipeline.
//!
//! # Safety carve-out
//!
//! `unsafe` is confined to this module. The only `unsafe` usage is the
//! auto-derived `bytemuck::Pod` and `bytemuck::Zeroable` impls on `#[repr(C)]`
//! GPU vertex/instance structs. These are proven safe by the `#[repr(C)]`
//! layout guarantee and the fact that all fields are `Pod`-compatible primitive
//! types.

#![allow(unsafe_code)]

use std::mem::size_of;

/// A vertex in the unit quad.
///
/// Each vertex is a corner position in `[0, 1] × [0, 1]` UV space. The vertex
/// shader maps this to page coordinates using the per-instance `bounds` field.
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct ShapeVertex {
    /// Unit quad corner position: `(0,0)`, `(1,0)`, `(0,1)`, `(1,1)`.
    pub position: [f32; 2],
}

/// Per-instance data for one shape in the instanced draw call.
///
/// Total byte size: **60 bytes** (6 fields: 4×vec4 + 2×f32 + 1×u32 → but
/// alignment: vec4 aligns at 16-byte boundaries, so the struct packs as:
///   bounds: [f32;4]  → offset 0, 16 bytes
///   color: [f32;4]   → offset 16, 16 bytes
///   stroke_color: [f32;4] → offset 32, 16 bytes
///   corner_radius: f32   → offset 48, 4 bytes
///   stroke_width: f32    → offset 52, 4 bytes
///   shape_type: u32      → offset 56, 4 bytes
///   Total: 60 bytes
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct ShapeInstance {
    /// Bounding box: `[x, y, width, height]` in page coordinates.
    ///
    /// For `SHAPE_LINE`, `(x, y)` is the `from` endpoint and `(width, height)`
    /// is the offset to the `to` endpoint (i.e. `to - from`).
    pub bounds: [f32; 4],
    /// Fill RGBA color in `[0, 1]` range.
    pub color: [f32; 4],
    /// Stroke RGBA color in `[0, 1]` range.
    pub stroke_color: [f32; 4],
    /// Corner radius for rounded rects.
    ///
    /// - `0.0` = sharp corners (plain rect)
    /// - `> 0.0` = rounded corners at this radius
    /// - `-1.0` = ellipse sentinel (ignored, shader uses ellipse SDF)
    pub corner_radius: f32,
    /// Stroke width in CSS pixels. `0.0` means no stroke.
    pub stroke_width: f32,
    /// Shape type discriminator:
    ///
    /// - `0` = [`SHAPE_RECT`](crate::shapes::SHAPE_RECT)
    /// - `1` = [`SHAPE_ROUNDED`](crate::shapes::SHAPE_ROUNDED)
    /// - `2` = [`SHAPE_ELLIPSE`](crate::shapes::SHAPE_ELLIPSE)
    /// - `3` = [`SHAPE_LINE`](crate::shapes::SHAPE_LINE)
    pub shape_type: u32,
}

/// The 6 vertices of a unit quad covering `[0,0]` → `[1,1]` as two triangles.
///
/// Triangle 1: (0,0) → (1,0) → (0,1)
/// Triangle 2: (1,0) → (1,1) → (0,1)
pub const UNIT_QUAD_VERTICES: [ShapeVertex; 6] = [
    ShapeVertex {
        position: [0.0, 0.0],
    },
    ShapeVertex {
        position: [1.0, 0.0],
    },
    ShapeVertex {
        position: [0.0, 1.0],
    },
    ShapeVertex {
        position: [1.0, 0.0],
    },
    ShapeVertex {
        position: [1.0, 1.0],
    },
    ShapeVertex {
        position: [0.0, 1.0],
    },
];

/// Returns the vertex buffer layout for [`ShapeVertex`].
///
/// Step mode: `Vertex` (per-vertex), one attribute `float32x2` at location 0.
pub fn shape_vertex_buffer_layout() -> wgpu::VertexBufferLayout<'static> {
    wgpu::VertexBufferLayout {
        array_stride: size_of::<ShapeVertex>() as wgpu::BufferAddress,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &[wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x2,
            offset: 0,
            shader_location: 0,
        }],
    }
}

/// Returns the instance buffer layout for [`ShapeInstance`].
///
/// Step mode: `Instance` (per-instance), 6 attributes at locations 1–6.
pub fn shape_instance_buffer_layout() -> wgpu::VertexBufferLayout<'static> {
    wgpu::VertexBufferLayout {
        array_stride: size_of::<ShapeInstance>() as wgpu::BufferAddress,
        step_mode: wgpu::VertexStepMode::Instance,
        attributes: &[
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 0,
                shader_location: 1,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 16,
                shader_location: 2,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 32,
                shader_location: 3,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32,
                offset: 48,
                shader_location: 4,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32,
                offset: 52,
                shader_location: 5,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Uint32,
                offset: 56,
                shader_location: 6,
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shape_instance_size_is_60_bytes() {
        // The 6-field #[repr(C)] layout computes to 60 bytes:
        // 3 × vec4<f32> (16 bytes each) + 2 × f32 + 1 × u32
        assert_eq!(size_of::<ShapeInstance>(), 60);
    }

    #[test]
    fn shape_vertex_size_is_8_bytes() {
        assert_eq!(size_of::<ShapeVertex>(), 8);
    }

    #[test]
    fn unit_quad_has_6_vertices() {
        assert_eq!(UNIT_QUAD_VERTICES.len(), 6);
    }

    #[test]
    fn shape_instance_is_pod() {
        // Verify the struct can be safely zero-initialized
        let zeroed: ShapeInstance = bytemuck::Zeroable::zeroed();
        assert_eq!(zeroed.bounds, [0.0; 4]);
        assert_eq!(zeroed.color, [0.0; 4]);
        assert_eq!(zeroed.stroke_color, [0.0; 4]);
        assert_eq!(zeroed.corner_radius, 0.0);
        assert_eq!(zeroed.stroke_width, 0.0);
        assert_eq!(zeroed.shape_type, 0);
    }

    #[test]
    fn shape_vertex_is_pod() {
        let zeroed: ShapeVertex = bytemuck::Zeroable::zeroed();
        assert_eq!(zeroed.position, [0.0; 2]);
    }
}
