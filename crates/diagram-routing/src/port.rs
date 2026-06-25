//! Port constraint parsing for edge routing.
//!
//! A port constraint specifies which side of a vertex an edge should connect
//! to. This module defines the [`Direction`] enum and provides parsing
//! functions to extract port constraints from [`StyleMap`] entries.

use diagram_core::style::StyleMap;
use serde::{Deserialize, Serialize};

/// A cardinal direction indicating which side of a vertex to connect to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Direction {
    /// Top edge.
    North,
    /// Right edge.
    East,
    /// Bottom edge.
    South,
    /// Left edge.
    West,
}

/// Parse a `portConstraint` value string into a [`Direction`].
///
/// Recognised values (case-insensitive):
/// - `"north"` → [`Direction::North`]
/// - `"east"`  → [`Direction::East`]
/// - `"south"` → [`Direction::South`]
/// - `"west"`  → [`Direction::West`]
///
/// Returns `None` for any unrecognised value (matching the upstream draw.io
/// behaviour of falling back to auto-selection).
pub fn parse_port_constraint(s: &str) -> Option<Direction> {
    match s.trim().to_lowercase().as_str() {
        "north" => Some(Direction::North),
        "east" => Some(Direction::East),
        "south" => Some(Direction::South),
        "west" => Some(Direction::West),
        _ => None,
    }
}

/// Read the `"portConstraint"` key from a [`StyleMap`] and parse it.
///
/// Returns `None` if the key is missing or the value is unrecognised.
pub fn port_constraint_from_style(map: &StyleMap) -> Option<Direction> {
    map.get("portConstraint")
        .and_then(|v| parse_port_constraint(v.as_str()))
}

/// Parse `exitX` / `exitY` / `exitPerimeter` from a [`StyleMap`].
///
/// Returns `(nx, ny, perimeter_flag)` where `nx` and `ny` are the normalised
/// coordinates (typically in `[0, 1]`), and `perimeter_flag` is `false` when
/// `exitPerimeter=0` (use exact point even if outside the bounding box).
///
/// Returns `None` if either `exitX` or `exitY` is absent or unparseable.
pub fn exit_point_from_style(map: &StyleMap) -> Option<(f64, f64, bool)> {
    let x = map.get("exitX")?.as_str().parse().ok()?;
    let y = map.get("exitY")?.as_str().parse().ok()?;
    let perimeter = map
        .get("exitPerimeter")
        .map(|v| v.as_str() != "0")
        .unwrap_or(true);
    Some((x, y, perimeter))
}

/// Parse `entryX` / `entryY` / `entryPerimeter` from a [`StyleMap`].
///
/// Returns `(nx, ny, perimeter_flag)` where `nx` and `ny` are the normalised
/// coordinates (typically in `[0, 1]`), and `perimeter_flag` is `false` when
/// `entryPerimeter=0` (use exact point even if outside the bounding box).
///
/// Returns `None` if either `entryX` or `entryY` is absent or unparseable.
pub fn entry_point_from_style(map: &StyleMap) -> Option<(f64, f64, bool)> {
    let x = map.get("entryX")?.as_str().parse().ok()?;
    let y = map.get("entryY")?.as_str().parse().ok()?;
    let perimeter = map
        .get("entryPerimeter")
        .map(|v| v.as_str() != "0")
        .unwrap_or(true);
    Some((x, y, perimeter))
}

/// An anchor point for edge routing.
///
/// An anchor determines where on a vertex's perimeter an edge connects.
/// `Anchor` values are resolved from a combination of style metadata and
/// explicit (interactive) user selections, with a clear precedence order.
#[derive(Debug, Clone, PartialEq, Default)]
pub enum Anchor {
    /// Automatic selection based on relative vertex positions.
    #[default]
    Auto,
    /// A fixed cardinal direction (north / east / south / west).
    Cardinal(Direction),
    /// A normalised coordinate pair `(nx, ny)` in `[0, 1]` × `[0, 1]`,
    /// interpreted relative to the vertex's bounding box.
    Normalized {
        /// Normalised x coordinate (relative to vertex width).
        nx: f64,
        /// Normalised y coordinate (relative to vertex height).
        ny: f64,
    },
}

/// Resolve an [`Anchor`] from a [`StyleMap`] and an optional explicit direction.
///
/// The `style_key` selects which normalised-coordinate keys to read:
/// - `"exit"` reads `exitX`/`exitY` (for the source anchor of an edge)
/// - `"entry"` reads `entryX`/`entryY` (for the target anchor of an edge)
///
/// Precedence (highest to lowest):
/// 1. Normalised coordinates from style keys  → `Anchor::Normalized`
/// 2. `portConstraint` from style           → `Anchor::Cardinal`
/// 3. Explicit direction (interactive path)   → `Anchor::Cardinal`
/// 4. Neither present                        → `Anchor::Auto`
pub fn resolve_anchor(
    style: Option<&StyleMap>,
    explicit: Option<Direction>,
    style_key: &str,
) -> Anchor {
    if let Some(map) = style {
        let normalised = match style_key {
            "exit" => exit_point_from_style(map),
            "entry" => entry_point_from_style(map),
            _ => None,
        };
        if let Some((nx, ny, _)) = normalised {
            return Anchor::Normalized { nx, ny };
        }
        if let Some(d) = port_constraint_from_style(map) {
            return Anchor::Cardinal(d);
        }
    }
    explicit.map(Anchor::Cardinal).unwrap_or(Anchor::Auto)
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::style::{StyleMap, StyleValue};

    #[test]
    fn parse_north() {
        assert_eq!(parse_port_constraint("north"), Some(Direction::North));
    }

    #[test]
    fn parse_east() {
        assert_eq!(parse_port_constraint("east"), Some(Direction::East));
    }

    #[test]
    fn parse_south() {
        assert_eq!(parse_port_constraint("south"), Some(Direction::South));
    }

    #[test]
    fn parse_west() {
        assert_eq!(parse_port_constraint("west"), Some(Direction::West));
    }

    #[test]
    fn parse_case_insensitive() {
        assert_eq!(parse_port_constraint("North"), Some(Direction::North));
        assert_eq!(parse_port_constraint("EAST"), Some(Direction::East));
    }

    #[test]
    fn parse_missing_key() {
        let map = StyleMap::new();
        assert_eq!(port_constraint_from_style(&map), None);
    }

    #[test]
    fn parse_unknown_value() {
        let mut map = StyleMap::new();
        map.insert("portConstraint", StyleValue::from("diagonal"));
        assert_eq!(port_constraint_from_style(&map), None);
    }

    #[test]
    fn parse_empty_string() {
        assert_eq!(parse_port_constraint(""), None);
    }

    // ── exit_point_from_style ─────────────────────────────────────────

    #[test]
    fn exit_point_both_coords_present() {
        let mut map = StyleMap::new();
        map.insert("exitX", StyleValue::from("0.25"));
        map.insert("exitY", StyleValue::from("0.0"));
        let result = exit_point_from_style(&map);
        assert_eq!(result, Some((0.25, 0.0, true)));
    }

    #[test]
    fn exit_point_missing_x_returns_none() {
        let mut map = StyleMap::new();
        map.insert("exitY", StyleValue::from("0.0"));
        assert_eq!(exit_point_from_style(&map), None);
    }

    #[test]
    fn exit_point_missing_y_returns_none() {
        let mut map = StyleMap::new();
        map.insert("exitX", StyleValue::from("0.5"));
        assert_eq!(exit_point_from_style(&map), None);
    }

    #[test]
    fn exit_point_perimeter_flag_false_when_zero() {
        let mut map = StyleMap::new();
        map.insert("exitX", StyleValue::from("0.5"));
        map.insert("exitY", StyleValue::from("0.5"));
        map.insert("exitPerimeter", StyleValue::from("0"));
        let result = exit_point_from_style(&map);
        assert_eq!(result, Some((0.5, 0.5, false)));
    }

    #[test]
    fn exit_point_perimeter_flag_true_when_absent() {
        let mut map = StyleMap::new();
        map.insert("exitX", StyleValue::from("0.5"));
        map.insert("exitY", StyleValue::from("0.5"));
        let result = exit_point_from_style(&map);
        assert_eq!(result, Some((0.5, 0.5, true)));
    }

    // ── entry_point_from_style ───────────────────────────────────────

    #[test]
    fn entry_point_both_coords_present() {
        let mut map = StyleMap::new();
        map.insert("entryX", StyleValue::from("0.5"));
        map.insert("entryY", StyleValue::from("1.0"));
        let result = entry_point_from_style(&map);
        assert_eq!(result, Some((0.5, 1.0, true)));
    }

    #[test]
    fn entry_point_missing_x_returns_none() {
        let mut map = StyleMap::new();
        map.insert("entryY", StyleValue::from("0.0"));
        assert_eq!(entry_point_from_style(&map), None);
    }

    #[test]
    fn entry_point_perimeter_flag_false_when_zero() {
        let mut map = StyleMap::new();
        map.insert("entryX", StyleValue::from("0.0"));
        map.insert("entryY", StyleValue::from("0.0"));
        map.insert("entryPerimeter", StyleValue::from("0"));
        let result = entry_point_from_style(&map);
        assert_eq!(result, Some((0.0, 0.0, false)));
    }

    // ── Anchor & resolve_anchor ──────────────────────────────────────

    #[test]
    fn anchor_default_is_auto() {
        assert_eq!(Anchor::default(), Anchor::Auto);
    }

    #[test]
    fn resolve_anchor_normalized_wins_over_port_constraint() {
        let mut map = StyleMap::new();
        map.insert("exitX", StyleValue::from("0.25"));
        map.insert("exitY", StyleValue::from("0.0"));
        map.insert("portConstraint", StyleValue::from("east"));
        let anchor = resolve_anchor(Some(&map), None, "exit");
        assert_eq!(anchor, Anchor::Normalized { nx: 0.25, ny: 0.0 });
    }

    #[test]
    fn resolve_anchor_entry_uses_entry_keys() {
        let mut map = StyleMap::new();
        map.insert("entryX", StyleValue::from("0.5"));
        map.insert("entryY", StyleValue::from("1.0"));
        let anchor = resolve_anchor(Some(&map), None, "entry");
        assert_eq!(anchor, Anchor::Normalized { nx: 0.5, ny: 1.0 });
    }

    #[test]
    fn resolve_anchor_port_constraint_wins_over_explicit() {
        let mut map = StyleMap::new();
        map.insert("portConstraint", StyleValue::from("south"));
        let anchor = resolve_anchor(Some(&map), Some(Direction::East), "exit");
        assert_eq!(anchor, Anchor::Cardinal(Direction::South));
    }

    #[test]
    fn resolve_anchor_explicit_wins_when_no_style() {
        let map = StyleMap::new();
        let anchor = resolve_anchor(Some(&map), Some(Direction::West), "exit");
        assert_eq!(anchor, Anchor::Cardinal(Direction::West));
    }

    #[test]
    fn resolve_anchor_auto_when_nothing_present() {
        let map = StyleMap::new();
        let anchor = resolve_anchor(Some(&map), None, "exit");
        assert_eq!(anchor, Anchor::Auto);
    }

    #[test]
    fn resolve_anchor_none_style_returns_auto() {
        let anchor = resolve_anchor(None, None, "exit");
        assert_eq!(anchor, Anchor::Auto);
    }
}
