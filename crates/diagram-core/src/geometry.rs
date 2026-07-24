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

impl Rect {
    /// Inflate by `m` units on all sides. Negative `m` clamps to zero-size minimum.
    pub fn inflate(&self, m: f64) -> Rect {
        Rect {
            origin: Point {
                x: self.origin.x - m,
                y: self.origin.y - m,
            },
            size: Size {
                width: (self.size.width + 2.0 * m).max(0.0),
                height: (self.size.height + 2.0 * m).max(0.0),
            },
        }
    }

    /// Edge-contact counts as intersection (closed-interval semantics).
    pub fn intersects(&self, other: &Rect) -> bool {
        self.origin.x <= other.origin.x + other.size.width
            && other.origin.x <= self.origin.x + self.size.width
            && self.origin.y <= other.origin.y + other.size.height
            && other.origin.y <= self.origin.y + self.size.height
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // === inflate tests ===

    #[test]
    fn inflate_positive() {
        let r = Rect {
            origin: Point { x: 100.0, y: 100.0 },
            size: Size {
                width: 200.0,
                height: 150.0,
            },
        };
        let inflated = r.inflate(50.0);
        assert_eq!(inflated.origin.x, 50.0);
        assert_eq!(inflated.origin.y, 50.0);
        assert_eq!(inflated.size.width, 300.0);
        assert_eq!(inflated.size.height, 250.0);
    }

    #[test]
    fn inflate_negative_clamped() {
        let r = Rect {
            origin: Point { x: 100.0, y: 100.0 },
            size: Size {
                width: 200.0,
                height: 150.0,
            },
        };
        // More negative inflate than available size clamps to zero
        let inflated = r.inflate(-120.0);
        assert!(inflated.size.width >= 0.0);
        assert!(inflated.size.height >= 0.0);
    }

    // === intersects tests ===

    #[test]
    fn intersects_overlap() {
        let r = Rect {
            origin: Point { x: 0.0, y: 0.0 },
            size: Size {
                width: 100.0,
                height: 100.0,
            },
        };
        let other = Rect {
            origin: Point { x: 50.0, y: 50.0 },
            size: Size {
                width: 100.0,
                height: 100.0,
            },
        };
        assert!(r.intersects(&other));
    }

    #[test]
    fn intersects_separate() {
        let r = Rect {
            origin: Point { x: 0.0, y: 0.0 },
            size: Size {
                width: 100.0,
                height: 100.0,
            },
        };
        let other = Rect {
            origin: Point { x: 200.0, y: 200.0 },
            size: Size {
                width: 100.0,
                height: 100.0,
            },
        };
        assert!(!r.intersects(&other));
    }
}
