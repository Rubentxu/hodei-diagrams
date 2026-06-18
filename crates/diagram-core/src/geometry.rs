//! Geometry primitives for the Diagram Engine core.
//!
//! Keep this module focused on data types — `Point`, `Size`, `Rect`, and
//! helpers — without baking in render-backend semantics. The diagram-scene
//! crate projects geometry into render commands; diagram-core stays
//! presentation-agnostic.

use serde::{Deserialize, Serialize};

/// A 2D point in the diagram's user-space coordinate system.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point {
    /// Horizontal coordinate.
    pub x: f64,
    /// Vertical coordinate.
    pub y: f64,
}

/// A 2D size with non-negative width and height.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Size {
    /// Width in user-space units. Must be finite and non-negative.
    pub width: f64,
    /// Height in user-space units. Must be finite and non-negative.
    pub height: f64,
}

/// An axis-aligned rectangle in user-space coordinates.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    /// Top-left corner.
    pub origin: Point,
    /// Size of the rectangle.
    pub size: Size,
}