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
#[derive(Debug, Clone, PartialEq)]
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
}
