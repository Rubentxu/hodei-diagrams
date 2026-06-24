//! Configuration types for the layout engine.

use serde::{Deserialize, Serialize};

/// Configuration for the Fruchterman-Reingold organic layout algorithm.
///
/// Draw.io defaults are used when no explicit value is provided.
/// The algorithm is deterministic — no random seed required.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OrganicLayoutConfig {
    /// Ideal distance between all vertex pairs. Higher values spread vertices apart.
    /// Draw.io default: 50.0.
    pub force_constant: f64,
    /// Minimum distance below which repulsion force is clamped (prevents singularities).
    /// Draw.io default: 2.0.
    pub min_distance_limit: f64,
    /// Maximum distance beyond which forces are ignored (performance cutoff).
    /// Draw.io default: 500.0.
    pub max_distance_limit: f64,
    /// Initial temperature controlling maximum displacement per iteration.
    /// Draw.io default: 200.0.
    pub initial_temp: f64,
    /// Maximum iterations. 0 means auto-calc as 20 * sqrt(vertex_count).
    pub max_iterations: u32,
    /// Reset all edge waypoints to straight lines after layout.
    /// Draw.io default: true.
    pub reset_edges: bool,
    /// Disable per-edge style evaluation (treat all edges uniformly).
    /// Draw.io default: true.
    pub disable_edge_style: bool,
}

impl Default for OrganicLayoutConfig {
    fn default() -> Self {
        Self {
            force_constant: 50.0,
            min_distance_limit: 2.0,
            max_distance_limit: 500.0,
            initial_temp: 200.0,
            max_iterations: 0,
            reset_edges: true,
            disable_edge_style: true,
        }
    }
}

/// Configuration for the circular layout algorithm.
///
/// Draw.io defaults are used when no explicit value is provided.
/// The algorithm is deterministic and closed-form — no iteration required.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CircularLayoutConfig {
    /// Circle radius in user-space units.
    /// Draw.io default: 100.0.
    pub radius: f64,
    /// Move the entire circle so that (x0, y0) becomes the top-left corner.
    /// Draw.io default: false.
    pub move_circle: bool,
    /// X coordinate of the top-left corner when `move_circle` is true.
    /// Draw.io default: 0.0.
    pub x0: f64,
    /// Y coordinate of the top-left corner when `move_circle` is true.
    /// Draw.io default: 0.0.
    pub y0: f64,
    /// Reset all edge waypoints to straight lines after layout.
    /// Draw.io default: true.
    pub reset_edges: bool,
    /// Disable per-edge style evaluation (treat all edges uniformly).
    /// Draw.io default: true.  v1 no-op — deferred to routing layer (ADR-0044).
    pub disable_edge_style: bool,
}

impl Default for CircularLayoutConfig {
    fn default() -> Self {
        Self {
            radius: 100.0,
            move_circle: false,
            x0: 0.0,
            y0: 0.0,
            reset_edges: true,
            disable_edge_style: true,
        }
    }
}

#[cfg(test)]
mod organic_config_tests {
    use super::*;

    #[test]
    fn organic_defaults_match_drawio() {
        let cfg = OrganicLayoutConfig::default();
        assert!((cfg.force_constant - 50.0).abs() < 1e-9);
        assert!((cfg.min_distance_limit - 2.0).abs() < 1e-9);
        assert!((cfg.max_distance_limit - 500.0).abs() < 1e-9);
        assert!((cfg.initial_temp - 200.0).abs() < 1e-9);
        assert_eq!(cfg.max_iterations, 0);
        assert!(cfg.reset_edges);
        assert!(cfg.disable_edge_style);
    }
}

#[cfg(test)]
mod circular_config_tests {
    use super::*;

    #[test]
    fn circular_defaults_match_drawio() {
        let cfg = CircularLayoutConfig::default();
        assert!((cfg.radius - 100.0).abs() < 1e-9);
        assert!(!cfg.move_circle);
        assert!((cfg.x0 - 0.0).abs() < 1e-9);
        assert!((cfg.y0 - 0.0).abs() < 1e-9);
        assert!(cfg.reset_edges);
        assert!(cfg.disable_edge_style);
    }
}

/// The direction in which the layout flows.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Direction {
    /// Flow from top to bottom (default).
    TopToBottom,
    /// Flow from left to right.
    LeftToRight,
    // v2: BottomToTop, RightToLeft
}

/// Configuration for the layout algorithm pipeline.
///
/// Controls spacing, direction, and iteration limits. Sensible defaults
/// are provided that match the upstream draw.io layout behaviour.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LayoutConfig {
    /// The direction of the layout flow.
    pub direction: Direction,
    /// Horizontal spacing between adjacent vertices in the same layer.
    pub intra_cell_spacing: f64,
    /// Vertical spacing between layers (in TopToBottom direction).
    pub inter_rank_spacing: f64,
    /// Maximum number of iterations for iterative stages (crossing reduction,
    /// coordinate assignment). Capped at 8 to match upstream behaviour.
    pub max_iterations: u8,
}

impl Default for LayoutConfig {
    fn default() -> Self {
        Self {
            direction: Direction::TopToBottom,
            intra_cell_spacing: 30.0,
            inter_rank_spacing: 100.0,
            max_iterations: 8,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_has_sensible_values() {
        let cfg = LayoutConfig::default();
        assert_eq!(cfg.direction, Direction::TopToBottom);
        assert!((cfg.intra_cell_spacing - 30.0).abs() < 1e-9);
        assert!((cfg.inter_rank_spacing - 100.0).abs() < 1e-9);
        assert_eq!(cfg.max_iterations, 8);
    }

    #[test]
    fn direction_equality() {
        assert_eq!(Direction::TopToBottom, Direction::TopToBottom);
        assert_ne!(Direction::TopToBottom, Direction::LeftToRight);
    }

    #[test]
    fn config_clone() {
        let a = LayoutConfig::default();
        let b = a.clone();
        assert_eq!(a, b);
    }
}
