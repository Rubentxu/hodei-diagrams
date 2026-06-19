//! `WgpuContext` — WebGPU device, adapter, queue, and surface lifecycle.
//!
//! Owns the wgpu instance, adapter, device, queue, and surface configuration.
//! Create via [`WgpuContext::new`] with a `winit::window::Window`.

use crate::error::WgpuError;

/// The core WebGPU context, owning all GPU resources needed for rendering.
///
/// The lifetime parameter `'window` ties the surface to the window it was
/// created from. For winit applications this is typically `'static` since
/// the window lives for the duration of the event loop.
pub struct WgpuContext<'window> {
    /// The wgpu instance.
    pub instance: wgpu::Instance,
    /// The adapter representing the physical GPU.
    pub adapter: wgpu::Adapter,
    /// The logical device for resource creation.
    pub device: wgpu::Device,
    /// The command queue for submitting work.
    pub queue: wgpu::Queue,
    /// The surface for presenting rendered frames.
    pub surface: wgpu::Surface<'window>,
    /// The surface configuration.
    pub config: wgpu::SurfaceConfiguration,
}

impl<'window> WgpuContext<'window> {
    /// Create a new `WgpuContext` from a winit window.
    ///
    /// # Errors
    ///
    /// Returns [`WgpuError::DeviceLost`] if adapter or device creation fails.
    /// Returns [`WgpuError::SurfaceError`] if surface creation fails.
    pub async fn new(
        window: &'window winit::window::Window,
    ) -> Result<Self, WgpuError> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::PRIMARY,
            flags: wgpu::InstanceFlags::default(),
            memory_budget_thresholds: wgpu::MemoryBudgetThresholds {
                for_resource_creation: None,
                for_device_loss: None,
            },
            backend_options: wgpu::BackendOptions::from_env_or_default(),
            display: None,
        });

        let surface = instance
            .create_surface(window)
            .map_err(|e| WgpuError::SurfaceError(format!("create_surface: {e}")))?;

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .map_err(|_| WgpuError::DeviceLost)?;

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: None,
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                experimental_features: wgpu::ExperimentalFeatures::disabled(),
                memory_hints: wgpu::MemoryHints::Performance,
                trace: wgpu::Trace::Off,
            })
            .await
            .map_err(|_| WgpuError::DeviceLost)?;

        let size = window.inner_size();
        let width = size.width.max(1);
        let height = size.height.max(1);

        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: wgpu::TextureFormat::Bgra8UnormSrgb,
            width,
            height,
            present_mode: wgpu::PresentMode::AutoVsync,
            alpha_mode: wgpu::CompositeAlphaMode::Auto,
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };

        surface.configure(&device, &config);

        Ok(Self {
            instance,
            adapter,
            device,
            queue,
            surface,
            config,
        })
    }

    /// Resize the surface to new dimensions.
    ///
    /// Call when the window or viewport size changes.
    pub fn resize(&mut self, width: u32, height: u32) {
        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&self.device, &self.config);
    }

    /// Access the device.
    pub fn device(&self) -> &wgpu::Device {
        &self.device
    }

    /// Access the queue.
    pub fn queue(&self) -> &wgpu::Queue {
        &self.queue
    }

    /// Access the surface.
    pub fn surface(&self) -> &wgpu::Surface<'window> {
        &self.surface
    }

    /// Access the surface configuration.
    pub fn config(&self) -> &wgpu::SurfaceConfiguration {
        &self.config
    }
}
