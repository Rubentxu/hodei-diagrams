//! Style resolution: resolves a `StyleMap` into typed `ResolvedStyle` fields.
//!
//! `StyleResolver`, `ResolvedStyle`, and `ShapeKind` are implemented in PR1.
//! This stub exists to keep the workspace compiling during the skeleton PR.

/// The resolved style with typed hot-key fields and a `remaining` tail.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ResolvedStyle {
    /// Fill color — raw string, e.g. `"#dae8fc"`.
    pub fill_color: Option<String>,
    /// Stroke color — raw string.
    pub stroke_color: Option<String>,
    /// Stroke width — parsed as `f64`.
    pub stroke_width: Option<f64>,
    /// Rounded corner flag.
    pub rounded: Option<bool>,
    /// Dashed line flag.
    pub dashed: Option<bool>,
    /// Font color — raw string.
    pub font_color: Option<String>,
    /// Font size — parsed as `f64`.
    pub font_size: Option<f64>,
    /// Font family — raw string.
    pub font_family: Option<String>,
    /// Opacity — parsed as `f64`.
    pub opacity: Option<f64>,
    /// Unknown keys preserved from the original `StyleMap`.
    pub remaining: diagram_core::StyleMap,
}

/// The shape kind of a vertex, classified from its style.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum ShapeKind {
    /// A rectangle.
    Rect,
    /// A rectangle with rounded corners.
    RoundedRect,
    /// An ellipse.
    Ellipse,
}

/// The stateless style resolver.
///
/// Resolves a `StyleMap` into a `ResolvedStyle` and classifies the shape kind.
#[derive(Debug, Clone, Default)]
pub struct StyleResolver;
