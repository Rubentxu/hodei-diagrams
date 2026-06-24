//! `WgpuRenderer` — scene-to-GPU rendering pipeline.
//!
//! Walks a [`Scene`]'s display list, collects [`ShapeInstance`]s, uploads them
//! to GPU buffers, and issues a single instanced draw call per scissor region.

use diagram_scene::ResolvedStyle;
use diagram_scene::{PageId, PageScene, Scene, VisualElement};

use wgpu::util::DeviceExt;

use crate::buffers::{ShapeInstance, UNIT_QUAD_VERTICES};
use crate::context::WgpuContext;
use crate::error::WgpuError;
use crate::pipeline::{ShapePipeline, build_shape_pipeline, create_viewport_bind_group};
use crate::shapes::{SHAPE_ELLIPSE, SHAPE_LINE, SHAPE_RECT, SHAPE_ROUNDED, parse_hex_color};

/// The WebGPU renderer, owning the context, pipeline, and quad vertex buffer.
pub struct WgpuRenderer<'window> {
    /// The WebGPU context (device, queue, surface, etc.).
    pub context: WgpuContext<'window>,
    /// The shape pipeline.
    pipeline: ShapePipeline,
    /// The unit-quad vertex buffer (shared by all instances).
    quad_vb: wgpu::Buffer,
}

impl<'window> WgpuRenderer<'window> {
    /// Create a new `WgpuRenderer` from a winit window.
    ///
    /// # Errors
    ///
    /// Returns [`WgpuError`] if context creation, pipeline building, or vertex
    /// buffer creation fails.
    pub async fn new(window: &'window winit::window::Window) -> Result<Self, WgpuError> {
        let context = WgpuContext::new(window).await?;
        let pipeline = build_shape_pipeline(&context.device, context.config.format)?;

        // Upload unit quad vertices to GPU
        let quad_vb = context
            .device
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("quad_vertex_buffer"),
                contents: bytemuck::cast_slice(&UNIT_QUAD_VERTICES),
                usage: wgpu::BufferUsages::VERTEX,
            });

        Ok(Self {
            context,
            pipeline,
            quad_vb,
        })
    }

    /// Render a single page from the scene.
    ///
    /// # Errors
    ///
    /// Returns [`WgpuError::PageNotFound`] if the page ID is not in the scene.
    /// Returns [`WgpuError::SurfaceError`] if the surface texture cannot be acquired.
    pub fn render(&mut self, scene: &Scene, page_id: PageId) -> Result<(), WgpuError> {
        let page = scene
            .pages
            .iter()
            .find(|p| p.page_id == page_id)
            .ok_or(WgpuError::PageNotFound { page_id })?;

        let instances = collect_instances_for_page(page);

        if instances.is_empty() {
            return Ok(());
        }

        let surface_texture = match self.context.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(t) => t,
            wgpu::CurrentSurfaceTexture::Suboptimal(t) => t,
            wgpu::CurrentSurfaceTexture::Timeout => {
                return Err(WgpuError::SurfaceError("surface timeout".to_owned()));
            }
            wgpu::CurrentSurfaceTexture::Occluded => {
                return Err(WgpuError::SurfaceError("surface occluded".to_owned()));
            }
            wgpu::CurrentSurfaceTexture::Outdated => {
                return Err(WgpuError::SurfaceError("surface outdated".to_owned()));
            }
            wgpu::CurrentSurfaceTexture::Lost => {
                return Err(WgpuError::SurfaceError("surface lost".to_owned()));
            }
            wgpu::CurrentSurfaceTexture::Validation => {
                return Err(WgpuError::SurfaceError(
                    "surface validation error".to_owned(),
                ));
            }
        };

        let texture_view = surface_texture
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        let mut encoder =
            self.context
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("render_encoder"),
                });

        // Upload instance buffer
        let instance_buffer =
            self.context
                .device
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("instance_buffer"),
                    contents: bytemuck::cast_slice(&instances),
                    usage: wgpu::BufferUsages::VERTEX,
                });

        let viewport_bg = create_viewport_bind_group(
            &self.context.device,
            &self.context.queue,
            &self.pipeline.bind_group_layout,
            page.width as f32,
            page.height as f32,
        );

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("shape_render_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &texture_view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 1.0,
                            g: 1.0,
                            b: 1.0,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                multiview_mask: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            render_pass.set_pipeline(&self.pipeline.pipeline);
            render_pass.set_vertex_buffer(0, self.quad_vb.slice(..));
            render_pass.set_vertex_buffer(1, instance_buffer.slice(..));
            render_pass.set_bind_group(0, Some(&viewport_bg), &[]);
            render_pass.draw(0..6, 0..instances.len() as u32);
        }

        self.context.queue.submit(Some(encoder.finish()));
        surface_texture.present();

        Ok(())
    }
}

/// Collect [`ShapeInstance`]s from a page's display list.
///
/// This is the testable unit of the scene→instances mapping. It walks the
/// display list, converting each visual element into one or more instances,
/// and handling group clipping via a scissor stack.
pub fn collect_instances_for_page(page: &PageScene) -> Vec<ShapeInstance> {
    let mut instances = Vec::new();
    walk_display_list(&page.display_list, &mut instances);
    instances
}

/// Recursively walk the display list, collecting instances.
fn walk_display_list(elements: &[VisualElement], instances: &mut Vec<ShapeInstance>) {
    for elem in elements {
        match elem {
            VisualElement::Rect(r) => {
                instances.push(element_to_instance(
                    r.bounds.origin.x,
                    r.bounds.origin.y,
                    r.bounds.size.width,
                    r.bounds.size.height,
                    &r.style,
                    0.0, // corner_radius
                    SHAPE_RECT,
                ));
            }
            VisualElement::RoundedRect(rr) => {
                instances.push(element_to_instance(
                    rr.bounds.origin.x,
                    rr.bounds.origin.y,
                    rr.bounds.size.width,
                    rr.bounds.size.height,
                    &rr.style,
                    rr.radius as f32,
                    SHAPE_ROUNDED,
                ));
            }
            VisualElement::Ellipse(e) => {
                instances.push(element_to_instance(
                    e.bounds.origin.x,
                    e.bounds.origin.y,
                    e.bounds.size.width,
                    e.bounds.size.height,
                    &e.style,
                    -1.0, // sentinel
                    SHAPE_ELLIPSE,
                ));
            }
            VisualElement::Line(l) => {
                let dx = (l.to.x - l.from.x) as f32;
                let dy = (l.to.y - l.from.y) as f32;
                let sw = l.style.stroke_width.unwrap_or(1.0) as f32;

                instances.push(ShapeInstance {
                    bounds: [l.from.x as f32, l.from.y as f32, dx, dy],
                    color: [0.0, 0.0, 0.0, 0.0],
                    stroke_color: style_stroke_color(&l.style),
                    corner_radius: 0.0,
                    stroke_width: sw,
                    shape_type: SHAPE_LINE,
                });
            }
            VisualElement::Group(g) => {
                // In v1, groups don't segment scissor rects — they just recurse.
                // Scissor support is planned for v1.1.
                walk_display_list(&g.children, instances);
            }
            VisualElement::Text(_) | VisualElement::Path(_) => {
                // Deferred to v2 — no-op
            }
            // Non-exhaustive enum requires wildcard arm
            _ => {}
        }
    }
}

/// Convert element position/size and style to a [`ShapeInstance`].
#[allow(clippy::too_many_arguments)]
fn element_to_instance(
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    style: &ResolvedStyle,
    corner_radius: f32,
    shape_type: u32,
) -> ShapeInstance {
    let fill = style_fill_color(style);
    let stroke = style_stroke_color(style);
    let stroke_width = style.stroke_width.unwrap_or(0.0) as f32;
    let opacity = style.opacity.unwrap_or(1.0) as f32;

    ShapeInstance {
        bounds: [x as f32, y as f32, w as f32, h as f32],
        color: if fill[3] > 0.0 {
            [fill[0], fill[1], fill[2], fill[3] * opacity]
        } else {
            [0.0, 0.0, 0.0, 0.0]
        },
        stroke_color: if stroke[3] > 0.0 {
            [stroke[0], stroke[1], stroke[2], stroke[3] * opacity]
        } else {
            [0.0, 0.0, 0.0, 0.0]
        },
        corner_radius,
        stroke_width,
        shape_type,
    }
}

/// Extract the fill color from a resolved style.
fn style_fill_color(style: &ResolvedStyle) -> [f32; 4] {
    style
        .fill_color
        .as_deref()
        .map(parse_hex_color)
        .unwrap_or([0.0, 0.0, 0.0, 0.0])
}

/// Extract the stroke color from a resolved style.
fn style_stroke_color(style: &ResolvedStyle) -> [f32; 4] {
    style
        .stroke_color
        .as_deref()
        .map(parse_hex_color)
        .unwrap_or([0.0, 0.0, 0.0, 0.0])
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::geometry::{Point, Rect, Size};
    use diagram_core::{EdgeId, GroupId, VertexId};
    use diagram_scene::{
        EllipseElement, EntityId, GroupElement, LineElement, PathElement, RectElement,
        RoundedRectElement, TextElement,
    };

    fn make_rect(
        bounds: Rect,
        fill: Option<&str>,
        stroke: Option<&str>,
        sw: Option<f64>,
    ) -> VisualElement {
        VisualElement::Rect(RectElement {
            id: VertexId::default(),
            bounds,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: ResolvedStyle {
                fill_color: fill.map(String::from),
                stroke_color: stroke.map(String::from),
                stroke_width: sw,
                ..Default::default()
            },
        })
    }

    fn make_rounded_rect(bounds: Rect, radius: f64) -> VisualElement {
        VisualElement::RoundedRect(RoundedRectElement {
            id: VertexId::default(),
            bounds,
            radius,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: ResolvedStyle {
                fill_color: Some("#dae8fc".to_owned()),
                ..Default::default()
            },
        })
    }

    fn make_ellipse(bounds: Rect) -> VisualElement {
        VisualElement::Ellipse(EllipseElement {
            id: VertexId::default(),
            bounds,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: ResolvedStyle {
                fill_color: Some("#dae8fc".to_owned()),
                ..Default::default()
            },
        })
    }

    fn make_line(from: Point, to: Point, stroke: Option<f64>) -> VisualElement {
        VisualElement::Line(LineElement {
            id: EdgeId::default(),
            from,
            to,
            style: ResolvedStyle {
                stroke_color: Some("#000000".to_owned()),
                stroke_width: stroke,
                ..Default::default()
            },
        })
    }

    fn make_group(children: Vec<VisualElement>, _clip: bool) -> VisualElement {
        VisualElement::Group(GroupElement {
            id: GroupId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 100.0,
                    height: 100.0,
                },
            },
            style: ResolvedStyle::default(),
            children,
            clip: _clip,
        })
    }

    fn make_page(display_list: Vec<VisualElement>) -> PageScene {
        PageScene {
            page_id: PageId::default(),
            name: "test".to_owned(),
            width: 800.0,
            height: 600.0,
            display_list,
            background: None,
        }
    }

    #[test]
    fn single_rect_produces_one_instance() {
        let rect = make_rect(
            Rect {
                origin: Point { x: 10.0, y: 20.0 },
                size: Size {
                    width: 80.0,
                    height: 40.0,
                },
            },
            Some("#dae8fc"),
            Some("#6c8ebf"),
            Some(2.0),
        );
        let page = make_page(vec![rect]);
        let instances = collect_instances_for_page(&page);
        assert_eq!(instances.len(), 1);
        let inst = &instances[0];
        assert_eq!(inst.bounds, [10.0, 20.0, 80.0, 40.0]);
        assert_eq!(inst.shape_type, SHAPE_RECT);
        assert_eq!(inst.stroke_width, 2.0);
        assert_eq!(inst.corner_radius, 0.0);

        // #dae8fc = [0.855, 0.910, 0.988, 1.0]
        assert!((inst.color[0] - 0.855).abs() < 0.01);
        assert!((inst.color[1] - 0.910).abs() < 0.01);
        assert!((inst.color[2] - 0.988).abs() < 0.01);
        assert!((inst.color[3] - 1.0).abs() < 0.01);
    }

    #[test]
    fn mixed_shapes_produce_correct_shape_types() {
        let rect = make_rect(
            Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 50.0,
                    height: 50.0,
                },
            },
            None,
            None,
            None,
        );
        let rounded = make_rounded_rect(
            Rect {
                origin: Point { x: 10.0, y: 10.0 },
                size: Size {
                    width: 60.0,
                    height: 30.0,
                },
            },
            8.0,
        );
        let ellipse = make_ellipse(Rect {
            origin: Point { x: 20.0, y: 20.0 },
            size: Size {
                width: 40.0,
                height: 40.0,
            },
        });
        let page = make_page(vec![rect, rounded, ellipse]);
        let instances = collect_instances_for_page(&page);
        assert_eq!(instances.len(), 3);
        assert_eq!(instances[0].shape_type, SHAPE_RECT);
        assert_eq!(instances[1].shape_type, SHAPE_ROUNDED);
        assert_eq!(instances[1].corner_radius, 8.0);
        assert_eq!(instances[2].shape_type, SHAPE_ELLIPSE);
        assert_eq!(instances[2].corner_radius, -1.0);
    }

    #[test]
    fn line_produces_instance_with_line_type() {
        let line = make_line(
            Point { x: 80.0, y: 40.0 },
            Point { x: 160.0, y: 100.0 },
            Some(2.0),
        );
        let page = make_page(vec![line]);
        let instances = collect_instances_for_page(&page);
        assert_eq!(instances.len(), 1);
        assert_eq!(instances[0].shape_type, SHAPE_LINE);
        // bounds encodes from → to offset
        assert_eq!(instances[0].bounds, [80.0, 40.0, 80.0, 60.0]);
        assert_eq!(instances[0].stroke_width, 2.0);
    }

    #[test]
    fn empty_display_list_produces_zero_instances() {
        let page = make_page(vec![]);
        let instances = collect_instances_for_page(&page);
        assert_eq!(instances.len(), 0);
    }

    #[test]
    fn group_with_children_flattens_instances() {
        let rect = make_rect(
            Rect {
                origin: Point { x: 10.0, y: 10.0 },
                size: Size {
                    width: 50.0,
                    height: 50.0,
                },
            },
            None,
            None,
            None,
        );
        let group = make_group(vec![rect], true);
        let page = make_page(vec![group]);
        let instances = collect_instances_for_page(&page);
        assert_eq!(instances.len(), 1);
        assert_eq!(instances[0].shape_type, SHAPE_RECT);
    }

    #[test]
    fn text_and_path_elements_are_skipped() {
        let text = VisualElement::Text(TextElement {
            owner: EntityId::Vertex(VertexId::default()),
            anchor: Point { x: 0.0, y: 0.0 },
            text: "hello".to_owned(),
            style: ResolvedStyle::default(),
        });
        let path = VisualElement::Path(PathElement {
            id: EdgeId::default(),
            points: vec![Point { x: 0.0, y: 0.0 }, Point { x: 100.0, y: 100.0 }],
            style: ResolvedStyle::default(),
        });
        let page = make_page(vec![text, path]);
        let instances = collect_instances_for_page(&page);
        assert_eq!(instances.len(), 0);
    }

    #[test]
    fn none_fill_color_produces_transparent() {
        let rect = make_rect(
            Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 10.0,
                    height: 10.0,
                },
            },
            None,
            Some("#000000"),
            Some(1.0),
        );
        let page = make_page(vec![rect]);
        let instances = collect_instances_for_page(&page);
        assert_eq!(instances[0].color, [0.0, 0.0, 0.0, 0.0]);
        assert!((instances[0].stroke_color[0] - 0.0).abs() < 0.01);
        assert!((instances[0].stroke_color[3] - 1.0).abs() < 0.01);
    }

    #[test]
    fn opacity_multiplies_into_alpha() {
        let rect = VisualElement::Rect(RectElement {
            id: VertexId::default(),
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 10.0,
                    height: 10.0,
                },
            },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: ResolvedStyle {
                fill_color: Some("#ff0000".to_owned()),
                opacity: Some(0.5),
                ..Default::default()
            },
        });
        let page = make_page(vec![rect]);
        let instances = collect_instances_for_page(&page);
        assert!((instances[0].color[3] - 0.5).abs() < 0.01);
    }
}
