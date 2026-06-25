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
/// coordinates in `[0, 1]` when `perimeter_flag` is `true` (values stored as
/// percentages 0-100), and the raw pixel values when `perimeter_flag` is `false`.
///
/// Returns `None` if either `exitX` or `exitY` is absent or unparseable.
pub fn exit_point_from_style(map: &StyleMap) -> Option<(f64, f64, bool)> {
    let x = map.get("exitX")?.as_str().parse().ok()?;
    let y = map.get("exitY")?.as_str().parse().ok()?;
    let perimeter = map
        .get("exitPerimeter")
        .map(|v| v.as_str() != "0")
        .unwrap_or(true);
    // When perimeter=1, values are stored as percentages (0-100), convert to 0-1 range
    let (nx, ny) = if perimeter {
        (x / 100.0, y / 100.0)
    } else {
        (x, y)
    };
    Some((nx, ny, perimeter))
}

/// Parse `entryX` / `entryY` / `entryPerimeter` from a [`StyleMap`].
///
/// Returns `(nx, ny, perimeter_flag)` where `nx` and `ny` are the normalised
/// coordinates in `[0, 1]` when `perimeter_flag` is `true` (values stored as
/// percentages 0-100), and the raw pixel values when `perimeter_flag` is `false`.
///
/// Returns `None` if either `entryX` or `entryY` is absent or unparseable.
pub fn entry_point_from_style(map: &StyleMap) -> Option<(f64, f64, bool)> {
    let x = map.get("entryX")?.as_str().parse().ok()?;
    let y = map.get("entryY")?.as_str().parse().ok()?;
    let perimeter = map
        .get("entryPerimeter")
        .map(|v| v.as_str() != "0")
        .unwrap_or(true);
    // When perimeter=1, values are stored as percentages (0-100), convert to 0-1 range
    let (nx, ny) = if perimeter {
        (x / 100.0, y / 100.0)
    } else {
        (x, y)
    };
    Some((nx, ny, perimeter))
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

/// Which end of an edge an anchor refers to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnchorEnd {
    /// The source (from) end of an edge.
    Source,
    /// The target (to) end of an edge.
    Target,
}

/// Convert an [`Anchor`] into the `(key, value)` pairs that should go into a [`StyleMap`].
///
/// Returns an empty `Vec` for [`Anchor::Auto`] (preserves inheritance).
///
/// For [`Anchor::Cardinal`], emits the normalized coordinates that represent
/// that cardinal direction with perimeter=1:
/// - North → `exitY=0` (or `entryY=0`)
/// - South → `exitY=1` (or `entryY=1`)
/// - West → `exitX=0` (or `entryX=0`)
/// - East → `exitX=1` (or `entryX=1`)
///
/// For [`Anchor::Normalized`], emits the coordinates as percentages (0–100) with perimeter=1.
pub fn anchor_to_style_keys(anchor: &Anchor, end: AnchorEnd) -> Vec<(&'static str, String)> {
    match anchor {
        Anchor::Auto => Vec::new(),
        Anchor::Cardinal(dir) => match (end, dir) {
            (AnchorEnd::Source, Direction::North) => {
                vec![("exitY", "0".to_owned()), ("exitPerimeter", "1".to_owned())]
            }
            (AnchorEnd::Source, Direction::South) => {
                vec![("exitY", "1".to_owned()), ("exitPerimeter", "1".to_owned())]
            }
            (AnchorEnd::Source, Direction::West) => {
                vec![("exitX", "0".to_owned()), ("exitPerimeter", "1".to_owned())]
            }
            (AnchorEnd::Source, Direction::East) => {
                vec![("exitX", "1".to_owned()), ("exitPerimeter", "1".to_owned())]
            }
            (AnchorEnd::Target, Direction::North) => {
                vec![
                    ("entryY", "0".to_owned()),
                    ("entryPerimeter", "1".to_owned()),
                ]
            }
            (AnchorEnd::Target, Direction::South) => {
                vec![
                    ("entryY", "1".to_owned()),
                    ("entryPerimeter", "1".to_owned()),
                ]
            }
            (AnchorEnd::Target, Direction::West) => {
                vec![
                    ("entryX", "0".to_owned()),
                    ("entryPerimeter", "1".to_owned()),
                ]
            }
            (AnchorEnd::Target, Direction::East) => {
                vec![
                    ("entryX", "1".to_owned()),
                    ("entryPerimeter", "1".to_owned()),
                ]
            }
        },
        Anchor::Normalized { nx, ny } => match end {
            AnchorEnd::Source => vec![
                ("exitX", format!("{}", (*nx * 100.0).round())),
                ("exitY", format!("{}", (*ny * 100.0).round())),
                ("exitPerimeter", "1".to_owned()),
            ],
            AnchorEnd::Target => vec![
                ("entryX", format!("{}", (*nx * 100.0).round())),
                ("entryY", format!("{}", (*ny * 100.0).round())),
                ("entryPerimeter", "1".to_owned()),
            ],
        },
    }
}

/// Parse an [`Anchor`] out of a [`StyleMap`] by reading `exitX`/`exitY`/`exitPerimeter`
/// or `entryX`/`entryY`/`entryPerimeter`.
///
/// Returns [`Anchor::Auto`] if none of the required keys are present.
pub fn style_keys_to_anchor(style: &StyleMap, end: AnchorEnd) -> Anchor {
    let (x_key, y_key, perimeter_key) = match end {
        AnchorEnd::Source => ("exitX", "exitY", "exitPerimeter"),
        AnchorEnd::Target => ("entryX", "entryY", "entryPerimeter"),
    };

    // Check for normalized coordinates first
    if let (Some(x_val), Some(y_val)) = (style.get(x_key), style.get(y_key)) {
        if let (Ok(x), Ok(y)) = (x_val.as_str().parse::<f64>(), y_val.as_str().parse::<f64>()) {
            // Values are stored as percentages (0-100), convert back to 0-1 range
            let nx = x / 100.0;
            let ny = y / 100.0;
            return Anchor::Normalized { nx, ny };
        }
    }

    // Check for perimeter-based cardinal anchor
    if let Some(perimeter_val) = style.get(perimeter_key) {
        if perimeter_val.as_str() == "1" {
            // Infer cardinal direction from which coordinate is present and its value
            if let Some(y_val) = style.get(y_key) {
                if let Ok(y) = y_val.as_str().parse::<f64>() {
                    if y == 0.0 {
                        return Anchor::Cardinal(Direction::North);
                    } else if y == 1.0 {
                        return Anchor::Cardinal(Direction::South);
                    }
                }
            }
            if let Some(x_val) = style.get(x_key) {
                if let Ok(x) = x_val.as_str().parse::<f64>() {
                    if x == 0.0 {
                        return Anchor::Cardinal(Direction::West);
                    } else if x == 1.0 {
                        return Anchor::Cardinal(Direction::East);
                    }
                }
            }
        }
    }

    Anchor::Auto
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
        // perimeter=1 (default) means values are percentages (0-100), so 25 → 0.25
        let mut map = StyleMap::new();
        map.insert("exitX", StyleValue::from("25"));
        map.insert("exitY", StyleValue::from("0"));
        let result = exit_point_from_style(&map);
        assert_eq!(result, Some((0.25, 0.0, true)));
    }

    #[test]
    fn exit_point_missing_x_returns_none() {
        let mut map = StyleMap::new();
        map.insert("exitY", StyleValue::from("0"));
        assert_eq!(exit_point_from_style(&map), None);
    }

    #[test]
    fn exit_point_missing_y_returns_none() {
        let mut map = StyleMap::new();
        map.insert("exitX", StyleValue::from("50"));
        assert_eq!(exit_point_from_style(&map), None);
    }

    #[test]
    fn exit_point_perimeter_flag_false_when_zero() {
        // perimeter=0 means values are absolute pixels
        let mut map = StyleMap::new();
        map.insert("exitX", StyleValue::from("50"));
        map.insert("exitY", StyleValue::from("50"));
        map.insert("exitPerimeter", StyleValue::from("0"));
        let result = exit_point_from_style(&map);
        assert_eq!(result, Some((50.0, 50.0, false)));
    }

    #[test]
    fn exit_point_perimeter_flag_true_when_absent() {
        // perimeter=1 (default) means values are percentages (0-100), so 50 → 0.5
        let mut map = StyleMap::new();
        map.insert("exitX", StyleValue::from("50"));
        map.insert("exitY", StyleValue::from("50"));
        let result = exit_point_from_style(&map);
        assert_eq!(result, Some((0.5, 0.5, true)));
    }

    // ── entry_point_from_style ───────────────────────────────────────

    #[test]
    fn entry_point_both_coords_present() {
        // perimeter=1 (default) means values are percentages (0-100)
        let mut map = StyleMap::new();
        map.insert("entryX", StyleValue::from("50"));
        map.insert("entryY", StyleValue::from("100"));
        let result = entry_point_from_style(&map);
        assert_eq!(result, Some((0.5, 1.0, true)));
    }

    #[test]
    fn entry_point_missing_x_returns_none() {
        let mut map = StyleMap::new();
        map.insert("entryY", StyleValue::from("0"));
        assert_eq!(entry_point_from_style(&map), None);
    }

    #[test]
    fn entry_point_perimeter_flag_false_when_zero() {
        // perimeter=0 means values are absolute pixels
        let mut map = StyleMap::new();
        map.insert("entryX", StyleValue::from("0"));
        map.insert("entryY", StyleValue::from("0"));
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
        // perimeter=1 (default) means values are percentages (0-100)
        let mut map = StyleMap::new();
        map.insert("exitX", StyleValue::from("25"));
        map.insert("exitY", StyleValue::from("0"));
        map.insert("portConstraint", StyleValue::from("east"));
        let anchor = resolve_anchor(Some(&map), None, "exit");
        assert_eq!(anchor, Anchor::Normalized { nx: 0.25, ny: 0.0 });
    }

    #[test]
    fn resolve_anchor_entry_uses_entry_keys() {
        // perimeter=1 (default) means values are percentages (0-100)
        let mut map = StyleMap::new();
        map.insert("entryX", StyleValue::from("50"));
        map.insert("entryY", StyleValue::from("100"));
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

    // ── anchor_to_style_keys ──────────────────────────────────────────

    #[test]
    fn anchor_to_style_keys_auto_returns_empty() {
        let result = anchor_to_style_keys(&Anchor::Auto, AnchorEnd::Source);
        assert!(result.is_empty());
    }

    #[test]
    fn anchor_to_style_keys_cardinal_north_source() {
        let result = anchor_to_style_keys(&Anchor::Cardinal(Direction::North), AnchorEnd::Source);
        assert_eq!(result.len(), 2);
        // Should have exitY=0 and exitPerimeter=1
        let mut found_y = false;
        let mut found_perim = false;
        for (k, v) in &result {
            if *k == "exitY" {
                assert_eq!(*v, "0");
                found_y = true;
            }
            if *k == "exitPerimeter" {
                assert_eq!(*v, "1");
                found_perim = true;
            }
        }
        assert!(found_y && found_perim);
    }

    #[test]
    fn anchor_to_style_keys_normalized_target() {
        let result =
            anchor_to_style_keys(&Anchor::Normalized { nx: 0.5, ny: 0.3 }, AnchorEnd::Target);
        assert_eq!(result.len(), 3);
        let mut found_x = false;
        let mut found_y = false;
        let mut found_perim = false;
        for (k, v) in &result {
            if *k == "entryX" {
                assert_eq!(*v, "50"); // 0.5 * 100 = 50
                found_x = true;
            }
            if *k == "entryY" {
                assert_eq!(*v, "30"); // 0.3 * 100 = 30
                found_y = true;
            }
            if *k == "entryPerimeter" {
                assert_eq!(*v, "1");
                found_perim = true;
            }
        }
        assert!(found_x && found_y && found_perim);
    }

    // ── style_keys_to_anchor ─────────────────────────────────────────

    #[test]
    fn style_keys_to_anchor_empty_map_returns_auto() {
        let map = StyleMap::new();
        let result = style_keys_to_anchor(&map, AnchorEnd::Source);
        assert_eq!(result, Anchor::Auto);
    }

    #[test]
    fn style_keys_to_anchor_exit_y_0_perim_1_returns_north() {
        let mut map = StyleMap::new();
        map.insert("exitY", StyleValue::from("0"));
        map.insert("exitPerimeter", StyleValue::from("1"));
        let result = style_keys_to_anchor(&map, AnchorEnd::Source);
        assert_eq!(result, Anchor::Cardinal(Direction::North));
    }

    #[test]
    fn style_keys_to_anchor_exit_x_58_y_0_perim_1_returns_normalized() {
        let mut map = StyleMap::new();
        map.insert("exitX", StyleValue::from("58"));
        map.insert("exitY", StyleValue::from("0"));
        map.insert("exitPerimeter", StyleValue::from("1"));
        let result = style_keys_to_anchor(&map, AnchorEnd::Source);
        assert_eq!(result, Anchor::Normalized { nx: 0.58, ny: 0.0 });
    }
}
