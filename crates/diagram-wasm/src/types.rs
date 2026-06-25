//! WASM DTOs for connection points (anchors).

use wasm_bindgen::prelude::*;

/// Anchor kind discriminator for WASM boundary.
///
/// Corresponds to the variants of `diagram_routing::Anchor`.
#[wasm_bindgen]
pub enum AnchorDto {
    /// Automatic anchor selection.
    Auto,
    /// North (top) cardinal anchor.
    North,
    /// South (bottom) cardinal anchor.
    South,
    /// East (right) cardinal anchor.
    East,
    /// West (left) cardinal anchor.
    West,
}

/// Which end of an edge an anchor refers to (WASM DTO).
#[wasm_bindgen]
pub enum AnchorEnd {
    /// Source (from) end of an edge.
    Source,
    /// Target (to) end of an edge.
    Target,
}

/// A normalized (0-1 coordinate range) anchor position.
#[wasm_bindgen]
pub struct AnchorNormalizedDto {
    /// Normalized x coordinate (0-1).
    pub nx: f64,
    /// Normalized y coordinate (0-1).
    pub ny: f64,
}

/// DTO containing both source and target anchor information for an edge.
/// This struct is serializable so it can be returned as JSON.
#[derive(serde::Serialize)]
pub struct EdgeAnchorsDto {
    /// Source anchor kind: "auto", "north", "south", "east", "west", or "normalized".
    pub source_anchor_kind: String,
    /// Source normalized x (meaningful when kind is "normalized").
    pub source_nx: f64,
    /// Source normalized y (meaningful when kind is "normalized").
    pub source_ny: f64,
    /// Target anchor kind: "auto", "north", "south", "east", "west", or "normalized".
    pub target_anchor_kind: String,
    /// Target normalized x (meaningful when kind is "normalized").
    pub target_nx: f64,
    /// Target normalized y (meaningful when kind is "normalized").
    pub target_ny: f64,
}

/// Create an AnchorDto representing Auto anchor selection.
#[wasm_bindgen]
pub fn anchor_dto_auto() -> AnchorDto {
    AnchorDto::Auto
}

/// Create an AnchorDto representing a cardinal anchor direction.
#[wasm_bindgen]
pub fn anchor_dto_cardinal(direction: AnchorDto) -> AnchorDto {
    direction
}

/// Create an AnchorNormalizedDto with the given normalized coordinates.
#[wasm_bindgen]
pub fn anchor_dto_normalized(nx: f64, ny: f64) -> AnchorNormalizedDto {
    AnchorNormalizedDto { nx, ny }
}

impl AnchorDto {
    /// Convert to a string representation matching the variant name.
    pub fn as_str(&self) -> &'static str {
        match self {
            AnchorDto::Auto => "auto",
            AnchorDto::North => "north",
            AnchorDto::South => "south",
            AnchorDto::East => "east",
            AnchorDto::West => "west",
        }
    }

    /// Parse from a string, returning None for unrecognized values.
    pub fn from_str(s: &str) -> Option<AnchorDto> {
        match s.trim().to_lowercase().as_str() {
            "auto" => Some(AnchorDto::Auto),
            "north" => Some(AnchorDto::North),
            "south" => Some(AnchorDto::South),
            "east" => Some(AnchorDto::East),
            "west" => Some(AnchorDto::West),
            _ => None,
        }
    }
}
