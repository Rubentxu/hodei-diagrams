//! Configuration types for the layout engine.

/// The direction in which the layout flows.
#[derive(Debug, Clone, Copy, PartialEq)]
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
#[derive(Debug, Clone, PartialEq)]
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
