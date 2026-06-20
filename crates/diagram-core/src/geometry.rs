//! Geometry primitives for the Diagram Engine core.
//!
//! Keep this module focused on data types — `Point`, `Size`, `Rect`, and
//! helpers — without baking in render-backend semantics. The diagram-scene
//! crate projects geometry into render commands; diagram-core stays
//! presentation-agnostic.

use serde::{Deserialize, Serialize};

/// Geometry for a cell (vertex or group) in user-space coordinates.
///
/// The `relative` flag encodes the `as` attribute from draw.io XML:
/// - `relative = false` when `as == "geometry"` (absolute positioning)
/// - `relative = true` when `as` is missing or any other value
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct CellGeometry {
    /// Horizontal coordinate.
    pub x: f64,
    /// Vertical coordinate.
    pub y: f64,
    /// Width in user-space units.
    pub width: f64,
    /// Height in user-space units.
    pub height: f64,
    /// Whether the geometry is relative to the parent.
    ///
    /// `relative = true` when the raw `as` attribute is missing or ≠ `"geometry"`.
    /// `relative = false` when `as == "geometry"`.
    pub relative: bool,
    /// Rotation angle in radians (clockwise positive). Default 0.0.
    pub rotation: f64,
    /// Horizontal flip flag. Default false.
    pub flip_h: bool,
    /// Vertical flip flag. Default false.
    pub flip_v: bool,
}

impl Default for CellGeometry {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
            relative: false,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
        }
    }
}

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
