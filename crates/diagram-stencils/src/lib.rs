//! # diagram-stencils
//!
//! Parser for draw.io stencil XML format.
//!
//! Supports the subset defined in ADR-0059: move, line, quad, curve, arc,
//! close, fillstroke. Text, gradients, and images emit diagnostics and are
//! skipped.
//!
//! ## Example
//!
//! ```rust
//! let xml = r#"<shapes name="test"><shape name="Box" w="80" h="40"/></shapes>"#;
//! let stencil = diagram_stencils::parse_stencil(xml).unwrap();
//! assert_eq!(stencil.name, "Box");
//! ```
//!
//! ## Serde
//!
//! This crate supports `serde` serialization/deserialization via the `serde`
//! feature flag. The `PathCommand` enum and `Stencil` struct serialize to a
//! machine-readable format suitable for caching or IPC.

mod error;
mod parse;

pub use error::{Diagnostic, StencilError};
pub use parse::parse_stencil;

/// A parsed draw.io stencil.
#[derive(Debug, Clone, PartialEq)]
pub struct Stencil {
    /// Library name (from `<shapes name="...">`).
    pub library: String,
    /// Shape name (from `<shape name="...">`).
    pub name: String,
    /// Width hint. `0` means "variable".
    pub width: f64,
    /// Height hint. `0` means "variable".
    pub height: f64,
    /// Whether aspect ratio is constrained.
    pub aspect: Aspect,
    /// Background path commands.
    pub background: Vec<PathCommand>,
    /// Foreground path commands.
    pub foreground: Vec<PathCommand>,
    /// SPDX license identifier, if present as a comment.
    pub license: Option<SpdxId>,
    /// Diagnostics collected during parsing.
    pub diagnostics: Vec<Diagnostic>,
}

/// Aspect ratio constraint for a stencil.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Aspect {
    /// Fixed aspect ratio (width / height is locked).
    Fixed,
    /// Variable — can stretch independently.
    Variable,
}

impl Aspect {
    /// Parse from the string value in the XML attribute.
    fn from_str(s: &str) -> Self {
        match s {
            "fixed" => Aspect::Fixed,
            _ => Aspect::Variable,
        }
    }
}

/// A command within a `<path>` element.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum PathCommand {
    /// `move to x,y`
    Move { x: f64, y: f64 },
    /// `line to x,y`
    Line { x: f64, y: f64 },
    /// `quadratic curve to cx,cy x,y`
    Quad { cx: f64, cy: f64, x: f64, y: f64 },
    /// `cubic curve to c1x,c1y c2x,c2y x,y`
    Curve {
        c1x: f64,
        c1y: f64,
        c2x: f64,
        c2y: f64,
        x: f64,
        y: f64,
    },
    /// `arc rx,ry x-axis-rotation large-arc-flag sweep-flag x,y`
    Arc {
        rx: f64,
        ry: f64,
        x_axis_rotation: f64,
        large_arc: bool,
        sweep: bool,
        x: f64,
        y: f64,
    },
    /// Close the current subpath.
    Close,
    /// Fill and stroke the current path.
    FillStroke,
}

/// SPDX license identifier for open-source stencils.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SpdxId {
    Mit,
    Apache20,
    Cc010,
    Bsd3,
    Unknown(String),
}

impl SpdxId {
    /// Parse from a license string value.
    fn from_str(s: &str) -> Self {
        match s {
            "MIT" => SpdxId::Mit,
            "Apache-2.0" | "Apache-2" => SpdxId::Apache20,
            "CC0-1.0" | "CC0" => SpdxId::Cc010,
            "BSD-3-Clause" | "BSD-3" => SpdxId::Bsd3,
            other => SpdxId::Unknown(other.to_owned()),
        }
    }
}

impl Stencil {
    /// Returns a new `Stencil` with coordinates normalized to the [0,1] unit square.
    ///
    /// Normalization divides x/y coordinates by the stencil's width/height.
    /// Arc radii (`rx`, `ry`) are divided by the arithmetic mean `(w + h) / 2`.
    ///
    /// If `w == 0.0` or `h == 0.0`, x/y are clamped to `1.0` (no NaN/Inf) and a
    /// `Diagnostic::DegenerateAspect` is emitted.
    pub fn normalize(&self) -> Stencil {
        let w = self.width;
        let h = self.height;
        let degenerate_w = w == 0.0;
        let degenerate_h = h == 0.0;
        let degenerate = degenerate_w || degenerate_h;

        let mut new_diagnostics = self.diagnostics.clone();
        if degenerate {
            new_diagnostics.push(Diagnostic::degenerate_aspect());
        }

        Stencil {
            library: self.library.clone(),
            name: self.name.clone(),
            width: self.width,
            height: self.height,
            aspect: self.aspect,
            background: normalize_commands(&self.background, w, h, degenerate_w, degenerate_h),
            foreground: normalize_commands(&self.foreground, w, h, degenerate_w, degenerate_h),
            license: self.license.clone(),
            diagnostics: new_diagnostics,
        }
    }
}

/// Normalize a slice of path commands.
fn normalize_commands(
    commands: &[PathCommand],
    w: f64,
    h: f64,
    degenerate_w: bool,
    degenerate_h: bool,
) -> Vec<PathCommand> {
    commands
        .iter()
        .map(|cmd| match cmd {
            PathCommand::Move { x, y } => PathCommand::Move {
                x: normalize_coord(*x, w, degenerate_w),
                y: normalize_coord(*y, h, degenerate_h),
            },
            PathCommand::Line { x, y } => PathCommand::Line {
                x: normalize_coord(*x, w, degenerate_w),
                y: normalize_coord(*y, h, degenerate_h),
            },
            PathCommand::Quad { cx, cy, x, y } => PathCommand::Quad {
                cx: normalize_coord(*cx, w, degenerate_w),
                cy: normalize_coord(*cy, h, degenerate_h),
                x: normalize_coord(*x, w, degenerate_w),
                y: normalize_coord(*y, h, degenerate_h),
            },
            PathCommand::Curve {
                c1x,
                c1y,
                c2x,
                c2y,
                x,
                y,
            } => PathCommand::Curve {
                c1x: normalize_coord(*c1x, w, degenerate_w),
                c1y: normalize_coord(*c1y, h, degenerate_h),
                c2x: normalize_coord(*c2x, w, degenerate_w),
                c2y: normalize_coord(*c2y, h, degenerate_h),
                x: normalize_coord(*x, w, degenerate_w),
                y: normalize_coord(*y, h, degenerate_h),
            },
            PathCommand::Arc {
                rx,
                ry,
                x_axis_rotation,
                large_arc,
                sweep,
                x,
                y,
            } => {
                let degenerate_arc = degenerate_w || degenerate_h;
                let scale = if degenerate_arc { 1.0 } else { (w + h) / 2.0 };
                PathCommand::Arc {
                    rx: normalize_coord(*rx, scale, false),
                    ry: normalize_coord(*ry, scale, false),
                    x_axis_rotation: *x_axis_rotation,
                    large_arc: *large_arc,
                    sweep: *sweep,
                    x: normalize_coord(*x, w, degenerate_w),
                    y: normalize_coord(*y, h, degenerate_h),
                }
            }
            PathCommand::Close => PathCommand::Close,
            PathCommand::FillStroke => PathCommand::FillStroke,
        })
        .collect()
}

/// Normalize a single coordinate: divide by dim, clamping to 1.0 if degenerate.
fn normalize_coord(value: f64, dim: f64, degenerate: bool) -> f64 {
    if degenerate {
        1.0
    } else {
        value / dim
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aspect_from_str() {
        assert_eq!(Aspect::from_str("fixed"), Aspect::Fixed);
        assert_eq!(Aspect::from_str("variable"), Aspect::Variable);
        assert_eq!(Aspect::from_str("anything else"), Aspect::Variable);
    }

    #[test]
    fn spdx_from_str() {
        assert_eq!(SpdxId::from_str("MIT"), SpdxId::Mit);
        assert_eq!(SpdxId::from_str("Apache-2.0"), SpdxId::Apache20);
        assert_eq!(SpdxId::from_str("CC0-1.0"), SpdxId::Cc010);
        assert_eq!(SpdxId::from_str("BSD-3-Clause"), SpdxId::Bsd3);
        assert_eq!(
            SpdxId::from_str("Proprietary"),
            SpdxId::Unknown("Proprietary".to_owned())
        );
    }

    #[test]
    fn normalize_unit_square_path() {
        // w=120, h=60; path M 0,0 L 120,0 L 120,60 L 0,60 Z
        let stencil = Stencil {
            library: "test".into(),
            name: "Rect".into(),
            width: 120.0,
            height: 60.0,
            aspect: Aspect::Fixed,
            background: vec![
                PathCommand::Move { x: 0.0, y: 0.0 },
                PathCommand::Line { x: 120.0, y: 0.0 },
                PathCommand::Line { x: 120.0, y: 60.0 },
                PathCommand::Line { x: 0.0, y: 60.0 },
                PathCommand::Close,
                PathCommand::FillStroke,
            ],
            foreground: vec![],
            license: None,
            diagnostics: vec![],
        };

        let normalized = stencil.normalize();
        assert_eq!(normalized.background.len(), 6);
        assert_eq!(normalized.background[0], PathCommand::Move { x: 0.0, y: 0.0 });
        assert_eq!(normalized.background[1], PathCommand::Line { x: 1.0, y: 0.0 });
        assert_eq!(normalized.background[2], PathCommand::Line { x: 1.0, y: 1.0 });
        assert_eq!(normalized.background[3], PathCommand::Line { x: 0.0, y: 1.0 });
        assert_eq!(normalized.background[4], PathCommand::Close);
        assert_eq!(normalized.background[5], PathCommand::FillStroke);
    }

    #[test]
    fn normalize_non_uniform_coordinates() {
        // w=80, h=80; path M 40,40 L 60,60
        let stencil = Stencil {
            library: "test".into(),
            name: "Diag".into(),
            width: 80.0,
            height: 80.0,
            aspect: Aspect::Variable,
            background: vec![
                PathCommand::Move { x: 40.0, y: 40.0 },
                PathCommand::Line { x: 60.0, y: 60.0 },
            ],
            foreground: vec![],
            license: None,
            diagnostics: vec![],
        };

        let normalized = stencil.normalize();
        assert_eq!(normalized.background[0], PathCommand::Move { x: 0.5, y: 0.5 });
        assert_eq!(normalized.background[1], PathCommand::Line { x: 0.75, y: 0.75 });
    }

    #[test]
    fn normalize_degenerate_zero_width_emits_diagnostic() {
        let stencil = Stencil {
            library: "test".into(),
            name: "ZeroW".into(),
            width: 0.0,
            height: 60.0,
            aspect: Aspect::Variable,
            background: vec![PathCommand::Move { x: 50.0, y: 30.0 }],
            foreground: vec![],
            license: None,
            diagnostics: vec![],
        };

        let normalized = stencil.normalize();
        // x clamped to 1.0, y = 30/60 = 0.5
        assert_eq!(normalized.background[0], PathCommand::Move { x: 1.0, y: 0.5 });
        assert!(normalized
            .diagnostics
            .iter()
            .any(|d| d.message.contains("degenerate")));
    }

    #[test]
    fn normalize_preserves_original_diagnostics() {
        let stencil = Stencil {
            library: "test".into(),
            name: "WithDiag".into(),
            width: 100.0,
            height: 50.0,
            aspect: Aspect::Variable,
            background: vec![],
            foreground: vec![],
            license: None,
            diagnostics: vec![Diagnostic::new("test", "pre-existing")],
        };

        let normalized = stencil.normalize();
        assert_eq!(normalized.diagnostics.len(), 1);
        assert_eq!(normalized.diagnostics[0].message, "pre-existing");
    }

    #[test]
    fn normalize_arc_rx_ry_by_scale() {
        // w=100, h=50 -> scale = (100+50)/2 = 75
        // Arc rx=25, ry=15 should become rx=25/75=0.333..., ry=15/75=0.2
        let stencil = Stencil {
            library: "test".into(),
            name: "ArcShape".into(),
            width: 100.0,
            height: 50.0,
            aspect: Aspect::Variable,
            background: vec![PathCommand::Arc {
                rx: 25.0,
                ry: 15.0,
                x_axis_rotation: 0.0,
                large_arc: false,
                sweep: true,
                x: 100.0,
                y: 25.0,
            }],
            foreground: vec![],
            license: None,
            diagnostics: vec![],
        };

        let normalized = stencil.normalize();
        match &normalized.background[0] {
            PathCommand::Arc {
                rx,
                ry,
                x_axis_rotation,
                large_arc,
                sweep,
                x,
                y,
            } => {
                assert!((*rx - 0.333333).abs() < 0.001, "rx = {}", rx);
                assert!((*ry - 0.2).abs() < 0.001, "ry = {}", ry);
                assert_eq!(*x_axis_rotation, 0.0);
                assert!(!*large_arc);
                assert!(*sweep);
                assert_eq!(*x, 1.0);
                assert_eq!(*y, 0.5);
            }
            _ => panic!("Expected Arc"),
        }
    }

    #[test]
    fn normalize_preserves_stencil_metadata() {
        let stencil = Stencil {
            library: "mylib".into(),
            name: "myname".into(),
            width: 200.0,
            height: 100.0,
            aspect: Aspect::Fixed,
            background: vec![],
            foreground: vec![],
            license: Some(SpdxId::Mit),
            diagnostics: vec![],
        };

        let normalized = stencil.normalize();
        assert_eq!(normalized.library, "mylib");
        assert_eq!(normalized.name, "myname");
        assert_eq!(normalized.width, 200.0);
        assert_eq!(normalized.height, 100.0);
        assert_eq!(normalized.aspect, Aspect::Fixed);
        assert_eq!(normalized.license, Some(SpdxId::Mit));
    }
}
