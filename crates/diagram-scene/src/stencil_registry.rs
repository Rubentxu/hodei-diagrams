//! Built-in shape stencil registry.
//!
//! Each stencil is defined with normalised [0,1] coordinates and an aspect ratio.
//! At render time the path is scaled to the vertex bounds.

use crate::element::{PathCommand, StencilAspect, StencilDef};
use std::sync::OnceLock;

// ─── Individual path commands as const slices ─────────────────────────────────

const RECTANGLE_PATH: &[PathCommand] = &[
    PathCommand::Move { x: 0.0, y: 0.0 },
    PathCommand::Line { x: 1.0, y: 0.0 },
    PathCommand::Line { x: 1.0, y: 1.0 },
    PathCommand::Line { x: 0.0, y: 1.0 },
    PathCommand::Close,
    PathCommand::FillStroke,
];

const ELLIPSE_PATH: &[PathCommand] = &[
    PathCommand::Move { x: 1.0, y: 0.5 },
    PathCommand::Curve {
        c1x: 1.0,
        c1y: 0.776,
        c2x: 0.776,
        c2y: 1.0,
        x: 0.5,
        y: 1.0,
    },
    PathCommand::Curve {
        c1x: 0.224,
        c1y: 1.0,
        c2x: 0.0,
        c2y: 0.776,
        x: 0.0,
        y: 0.5,
    },
    PathCommand::Curve {
        c1x: 0.0,
        c1y: 0.224,
        c2x: 0.224,
        c2y: 0.0,
        x: 0.5,
        y: 0.0,
    },
    PathCommand::Curve {
        c1x: 0.776,
        c1y: 0.0,
        c2x: 1.0,
        c2y: 0.224,
        x: 1.0,
        y: 0.5,
    },
    PathCommand::FillStroke,
];

const DIAMOND_PATH: &[PathCommand] = &[
    PathCommand::Move { x: 0.5, y: 0.0 },
    PathCommand::Line { x: 1.0, y: 0.5 },
    PathCommand::Line { x: 0.5, y: 1.0 },
    PathCommand::Line { x: 0.0, y: 0.5 },
    PathCommand::Close,
    PathCommand::FillStroke,
];

const TRIANGLE_PATH: &[PathCommand] = &[
    PathCommand::Move { x: 0.5, y: 0.0 },
    PathCommand::Line { x: 1.0, y: 1.0 },
    PathCommand::Line { x: 0.0, y: 1.0 },
    PathCommand::Close,
    PathCommand::FillStroke,
];

const HEXAGON_PATH: &[PathCommand] = &[
    PathCommand::Move { x: 0.25, y: 0.0 },
    PathCommand::Line { x: 0.75, y: 0.0 },
    PathCommand::Line { x: 1.0, y: 0.5 },
    PathCommand::Line { x: 0.75, y: 1.0 },
    PathCommand::Line { x: 0.25, y: 1.0 },
    PathCommand::Line { x: 0.0, y: 0.5 },
    PathCommand::Close,
    PathCommand::FillStroke,
];

const CYLINDER_PATH: &[PathCommand] = &[
    PathCommand::Move { x: 0.0, y: 0.15 },
    PathCommand::Line { x: 0.0, y: 0.85 },
    PathCommand::Curve {
        c1x: 0.0,
        c1y: 1.136,
        c2x: 0.364,
        c2y: 1.25,
        x: 0.5,
        y: 1.25,
    },
    PathCommand::Curve {
        c1x: 0.636,
        c1y: 1.25,
        c2x: 1.0,
        c2y: 1.136,
        x: 1.0,
        y: 0.85,
    },
    PathCommand::Line { x: 1.0, y: 0.15 },
    PathCommand::Curve {
        c1x: 1.0,
        c1y: -0.136,
        c2x: 0.636,
        c2y: -0.25,
        x: 0.5,
        y: -0.25,
    },
    PathCommand::Curve {
        c1x: 0.364,
        c1y: -0.25,
        c2x: 0.0,
        c2y: -0.136,
        x: 0.0,
        y: 0.15,
    },
    PathCommand::FillStroke,
    // Top ellipse (separate subpath for fill)
    PathCommand::Move { x: 0.0, y: 0.15 },
    PathCommand::Curve {
        c1x: 0.0,
        c1y: -0.136,
        c2x: 0.364,
        c2y: -0.25,
        x: 0.5,
        y: -0.25,
    },
    PathCommand::Curve {
        c1x: 0.636,
        c1y: -0.25,
        c2x: 1.0,
        c2y: -0.136,
        x: 1.0,
        y: 0.15,
    },
    PathCommand::Curve {
        c1x: 1.0,
        c1y: 0.436,
        c2x: 0.636,
        c2y: 0.55,
        x: 0.5,
        y: 0.55,
    },
    PathCommand::Curve {
        c1x: 0.364,
        c1y: 0.55,
        c2x: 0.0,
        c2y: 0.436,
        x: 0.0,
        y: 0.15,
    },
    PathCommand::FillStroke,
];

const CLOUD_PATH: &[PathCommand] = &[
    PathCommand::Move { x: 0.5, y: 0.0 },
    PathCommand::Curve {
        c1x: 0.5,
        c1y: 0.25,
        c2x: 0.25,
        c2y: 0.25,
        x: 0.18,
        y: 0.35,
    },
    PathCommand::Curve {
        c1x: 0.1,
        c1y: 0.45,
        c2x: 0.1,
        c2y: 0.75,
        x: 0.4,
        y: 0.75,
    },
    PathCommand::Curve {
        c1x: 0.7,
        c1y: 0.75,
        c2x: 0.75,
        c2y: 0.45,
        x: 0.9,
        y: 0.4,
    },
    PathCommand::Curve {
        c1x: 1.05,
        c1y: 0.35,
        c2x: 1.0,
        c2y: 0.1,
        x: 0.8,
        y: 0.1,
    },
    PathCommand::Curve {
        c1x: 0.6,
        c1y: 0.1,
        c2x: 0.55,
        c2y: 0.0,
        x: 0.5,
        y: 0.0,
    },
    PathCommand::FillStroke,
];

const PARALLELOGRAM_PATH: &[PathCommand] = &[
    PathCommand::Move { x: 0.15, y: 0.0 },
    PathCommand::Line { x: 1.0, y: 0.0 },
    PathCommand::Line { x: 0.85, y: 1.0 },
    PathCommand::Line { x: 0.0, y: 1.0 },
    PathCommand::Close,
    PathCommand::FillStroke,
];

const TRAPEZOID_PATH: &[PathCommand] = &[
    PathCommand::Move { x: 0.15, y: 0.0 },
    PathCommand::Line { x: 0.85, y: 0.0 },
    PathCommand::Line { x: 1.0, y: 1.0 },
    PathCommand::Line { x: 0.0, y: 1.0 },
    PathCommand::Close,
    PathCommand::FillStroke,
];

const BLOCK_ARROW_PATH: &[PathCommand] = &[
    PathCommand::Move { x: 0.0, y: 0.35 },
    PathCommand::Line { x: 0.65, y: 0.35 },
    PathCommand::Line { x: 0.65, y: 0.0 },
    PathCommand::Line { x: 1.0, y: 0.5 },
    PathCommand::Line { x: 0.65, y: 1.0 },
    PathCommand::Line { x: 0.65, y: 0.65 },
    PathCommand::Line { x: 0.0, y: 0.65 },
    PathCommand::Close,
    PathCommand::FillStroke,
];

// ─── Stencil definitions ─────────────────────────────────────────────────────

const STENCILS: &[(&str, StencilDef)] = &[
    (
        "rectangle",
        StencilDef {
            width: 1.0,
            height: 1.0,
            aspect: StencilAspect::Fixed,
            background: RECTANGLE_PATH,
            foreground: &[],
        },
    ),
    (
        "ellipse",
        StencilDef {
            width: 1.0,
            height: 1.0,
            aspect: StencilAspect::Fixed,
            background: ELLIPSE_PATH,
            foreground: &[],
        },
    ),
    (
        "diamond",
        StencilDef {
            width: 1.0,
            height: 1.0,
            aspect: StencilAspect::Fixed,
            background: DIAMOND_PATH,
            foreground: &[],
        },
    ),
    (
        "triangle",
        StencilDef {
            width: 1.0,
            height: 1.0,
            aspect: StencilAspect::Fixed,
            background: TRIANGLE_PATH,
            foreground: &[],
        },
    ),
    (
        "hexagon",
        StencilDef {
            width: 1.0,
            height: 1.0,
            aspect: StencilAspect::Fixed,
            background: HEXAGON_PATH,
            foreground: &[],
        },
    ),
    (
        "cylinder",
        StencilDef {
            width: 1.0,
            height: 1.25,
            aspect: StencilAspect::Fixed,
            background: CYLINDER_PATH,
            foreground: &[],
        },
    ),
    (
        "cloud",
        StencilDef {
            width: 1.0,
            height: 0.75,
            aspect: StencilAspect::Variable,
            background: CLOUD_PATH,
            foreground: &[],
        },
    ),
    (
        "parallelogram",
        StencilDef {
            width: 1.0,
            height: 1.0,
            aspect: StencilAspect::Fixed,
            background: PARALLELOGRAM_PATH,
            foreground: &[],
        },
    ),
    (
        "trapezoid",
        StencilDef {
            width: 1.0,
            height: 1.0,
            aspect: StencilAspect::Fixed,
            background: TRAPEZOID_PATH,
            foreground: &[],
        },
    ),
    (
        "blockArrow",
        StencilDef {
            width: 1.0,
            height: 1.0,
            aspect: StencilAspect::Fixed,
            background: BLOCK_ARROW_PATH,
            foreground: &[],
        },
    ),
];

// ─── Lookup map (lazily initialised from the const slice) ───────────────────

static STENCIL_MAP: OnceLock<std::collections::HashMap<&'static str, &'static StencilDef>> =
    OnceLock::new();

fn get_map() -> &'static std::collections::HashMap<&'static str, &'static StencilDef> {
    STENCIL_MAP.get_or_init(|| STENCILS.iter().map(|(k, v)| (*k, v)).collect())
}

/// Lookup a stencil definition by name. Returns `None` if unknown.
pub fn lookup(name: &str) -> Option<&'static StencilDef> {
    get_map().get(name).copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stencil_registry_has_builtin_stencils() {
        let names = [
            "rectangle",
            "ellipse",
            "diamond",
            "triangle",
            "hexagon",
            "cylinder",
            "cloud",
            "parallelogram",
            "trapezoid",
            "blockArrow",
        ];
        for name in names {
            assert!(lookup(name).is_some(), "stencil '{name}' not found");
        }
    }

    #[test]
    fn stencil_unknown_returns_none() {
        assert!(lookup("nonexistent").is_none());
    }
}
