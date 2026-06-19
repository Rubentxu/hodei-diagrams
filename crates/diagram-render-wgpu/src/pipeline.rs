//! Single-instanced render pipeline for all shapes.
//!
//! Builds a [`ShapePipeline`] from the inline WGSL shader, with bind group
//! layout for the viewport uniform and vertex/instance buffer layouts from
//! [`crate::buffers`].

use crate::buffers::{shape_instance_buffer_layout, shape_vertex_buffer_layout};
use crate::error::WgpuError;

/// The single instanced shape pipeline.
///
/// Contains the render pipeline and the bind group layout for the viewport
/// uniform. The bind group itself is created per-frame (or per-resize) via
/// [`create_viewport_bind_group`].
pub struct ShapePipeline {
    /// The render pipeline.
    pub pipeline: wgpu::RenderPipeline,
    /// The bind group layout for the viewport uniform (`@group(0)`).
    pub bind_group_layout: wgpu::BindGroupLayout,
}

/// Build the single shape pipeline from the inline WGSL shader.
///
/// # Errors
///
/// Returns [`WgpuError::ShaderCompilation`] if the WGSL shader fails to
/// compile (validated by naga via `create_shader_module`).
///
/// Returns [`WgpuError::PipelineCreation`] if the render pipeline cannot be
/// created from the shader and vertex layouts.
pub fn build_shape_pipeline(
    device: &wgpu::Device,
    surface_format: wgpu::TextureFormat,
) -> Result<ShapePipeline, WgpuError> {
    // ── Shader module ────────────────────────────────────────────────────
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("shape_pipeline"),
        source: wgpu::ShaderSource::Wgsl(crate::shapes::SHAPE_WGSL.into()),
    });

    // ── Bind group layout: viewport uniform ──────────────────────────────
    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("viewport_bind_group_layout"),
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::VERTEX,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: Some(wgpu::BufferSize::new(8).expect("vec2<f32> is 8 bytes")),
            },
            count: None,
        }],
    });

    // ── Pipeline layout ──────────────────────────────────────────────────
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("shape_pipeline_layout"),
        bind_group_layouts: &[Some(&bind_group_layout)],
        immediate_size: 0,
    });

    // ── Render pipeline ──────────────────────────────────────────────────
    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("shape_pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[shape_vertex_buffer_layout(), shape_instance_buffer_layout()],
        },
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            strip_index_format: None,
            front_face: wgpu::FrontFace::Ccw,
            cull_mode: None,
            polygon_mode: wgpu::PolygonMode::Fill,
            unclipped_depth: false,
            conservative: false,
        },
        depth_stencil: None,
        multisample: wgpu::MultisampleState {
            count: 1,
            mask: !0,
            alpha_to_coverage_enabled: false,
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format: surface_format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        multiview_mask: None,
        cache: None,
    });

    Ok(ShapePipeline {
        pipeline,
        bind_group_layout,
    })
}

/// Create a bind group for the viewport uniform.
///
/// Uploads `[page_width, page_height]` as a `vec2<f32>` uniform buffer, bound
/// at `@group(0) @binding(0)`.
///
/// Uses `mapped_at_creation` to write the viewport data without needing a
/// queue reference.
pub fn create_viewport_bind_group(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    layout: &wgpu::BindGroupLayout,
    page_width: f32,
    page_height: f32,
) -> wgpu::BindGroup {
    // Viewport uniform: two f32 values (8 bytes)
    let viewport_data: [f32; 2] = [page_width, page_height];

    let viewport_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("viewport_uniform_buffer"),
        size: 8,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    queue.write_buffer(&viewport_buffer, 0, bytemuck::cast_slice(&viewport_data));

    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("viewport_bind_group"),
        layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: viewport_buffer.as_entire_binding(),
        }],
    })
}
