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
}
