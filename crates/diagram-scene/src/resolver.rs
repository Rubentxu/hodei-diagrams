//! Style resolution: resolves a `StyleMap` into typed `ResolvedStyle` fields.
//!
//! `StyleResolver`, `ResolvedStyle`, and `ShapeKind` are implemented in PR1.
//! This stub exists to keep the workspace compiling during the skeleton PR.

use diagram_core::StyleMap;
use serde::{Deserialize, Serialize};

/// The resolved style with typed hot-key fields and a `remaining` tail.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ResolvedStyle {
    /// Fill color — raw string, e.g. `"#dae8fc"`.
    pub fill_color: Option<String>,
    /// Stroke color — raw string.
    pub stroke_color: Option<String>,
    /// Stroke width — parsed as `f64`.
    pub stroke_width: Option<f64>,
    /// Rounded corner flag.
    pub rounded: Option<bool>,
    /// Dashed line flag.
    pub dashed: Option<bool>,
    /// Font color — raw string.
    pub font_color: Option<String>,
    /// Font size — parsed as `f64`.
    pub font_size: Option<f64>,
    /// Font family — raw string.
    pub font_family: Option<String>,
    /// Opacity — parsed as `f64`, clamped to 0.0–1.0.
    pub opacity: Option<f64>,
    /// Unknown keys preserved from the original `StyleMap`.
    pub remaining: StyleMap,
}

impl ResolvedStyle {
    /// Returns `true` if every typed field is `None` and `remaining` is empty.
    pub fn is_empty(&self) -> bool {
        self.fill_color.is_none()
            && self.stroke_color.is_none()
            && self.stroke_width.is_none()
            && self.rounded.is_none()
            && self.dashed.is_none()
            && self.font_color.is_none()
            && self.font_size.is_none()
            && self.font_family.is_none()
            && self.opacity.is_none()
            && self.remaining.is_empty()
    }
}

/// The shape kind of a vertex, classified from its style.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[non_exhaustive]
pub enum ShapeKind {
    /// A rectangle.
    #[default]
    Rect,
    /// A rectangle with rounded corners.
    RoundedRect,
    /// An ellipse.
    Ellipse,
    /// A diamond (rhombus).
    Diamond,
    /// A triangle.
    Triangle,
    /// A hexagon.
    Hexagon,
    /// A cylinder (3D-ish).
    Cylinder,
    /// A cloud shape.
    Cloud,
    /// A parallelogram.
    Parallelogram,
    /// A trapezoid.
    Trapezoid,
    /// A free-form polygon.
    Polygon,
    /// A draw.io stencil — resolved from `shape=stencil:<name>`.
    Stencil,
}

/// The stateless style resolver.
///
/// Resolves a `StyleMap` into a `ResolvedStyle` and classifies the shape kind.
#[derive(Debug, Clone, Default)]
pub struct StyleResolver;

impl StyleResolver {
    /// Create a new `StyleResolver`.
    pub fn new() -> Self {
        Self
    }

    /// Returns the set of known style keys that are resolved into typed fields.
    #[allow(dead_code)]
    pub(crate) fn known_keys() -> &'static [&'static str] {
        &[
            "fillColor",
            "strokeColor",
            "strokeWidth",
            "rounded",
            "dashed",
            "fontColor",
            "fontSize",
            "fontFamily",
            "opacity",
        ]
    }

    /// Resolve a `StyleMap` into a `ResolvedStyle`.
    ///
    /// Known keys are extracted into typed fields. Unknown keys are preserved
    /// in the `remaining` map. Numeric parse failures cause the key to remain in
    /// `remaining` rather than being dropped.
    pub fn resolve(&self, style: &StyleMap) -> ResolvedStyle {
        let mut remaining = StyleMap::new();
        let mut fill_color = None;
        let mut stroke_color = None;
        let mut stroke_width = None;
        let mut rounded = None;
        let mut dashed = None;
        let mut font_color = None;
        let mut font_size = None;
        let mut font_family = None;
        let mut opacity = None;

        for (key, value) in style.iter() {
            match key {
                "fillColor" => fill_color = Some(value.as_str().to_owned()),
                "strokeColor" => stroke_color = Some(value.as_str().to_owned()),
                "strokeWidth" => {
                    if let Ok(parsed) = value.as_str().parse::<f64>() {
                        stroke_width = Some(parsed);
                    } else {
                        remaining.insert(key, value.as_str());
                    }
                }
                "rounded" => {
                    if let Some(b) = parse_bool(value.as_str()) {
                        rounded = Some(b);
                    } else {
                        remaining.insert(key, value.as_str());
                    }
                }
                "dashed" => {
                    if let Some(b) = parse_bool(value.as_str()) {
                        dashed = Some(b);
                    } else {
                        remaining.insert(key, value.as_str());
                    }
                }
                "fontColor" => font_color = Some(value.as_str().to_owned()),
                "fontSize" => {
                    if let Ok(parsed) = value.as_str().parse::<f64>() {
                        font_size = Some(parsed);
                    } else {
                        remaining.insert(key, value.as_str());
                    }
                }
                "fontFamily" => font_family = Some(value.as_str().to_owned()),
                "opacity" => {
                    if let Ok(parsed) = value.as_str().parse::<f64>() {
                        // Clamp to 0.0–1.0
                        let clamped = parsed.clamp(0.0, 1.0);
                        opacity = Some(clamped);
                    } else {
                        remaining.insert(key, value.as_str());
                    }
                }
                _ => {
                    remaining.insert(key, value.as_str());
                }
            }
        }

        ResolvedStyle {
            fill_color,
            stroke_color,
            stroke_width,
            rounded,
            dashed,
            font_color,
            font_size,
            font_family,
            opacity,
            remaining,
        }
    }

    /// Classify the shape kind from a `StyleMap`.
    ///
    /// - `shape=ellipse` or `ellipse=1`/`true` → `Ellipse`
    /// - `rounded=1`/`true` → `RoundedRect`
    /// - `shape=diamond` or `shape=rhombus` → `Diamond`
    /// - `shape=triangle` → `Triangle`
    /// - `shape=hexagon` → `Hexagon`
    /// - `shape=cylinder` → `Cylinder`
    /// - `shape=cloud` → `Cloud`
    /// - `shape=parallelogram` → `Parallelogram`
    /// - `shape=trapezoid` → `Trapezoid`
    /// - `shape=polygon` → `Polygon`
    /// - otherwise → `Rect`
    pub fn classify(&self, style: &StyleMap) -> ShapeKind {
        // Check for explicit shape= key
        if let Some(v) = style.get("shape") {
            let s = v.as_str();
            if s.eq_ignore_ascii_case("ellipse") {
                return ShapeKind::Ellipse;
            }
            if s.eq_ignore_ascii_case("diamond") || s.eq_ignore_ascii_case("rhombus") {
                return ShapeKind::Diamond;
            }
            if s.eq_ignore_ascii_case("triangle") {
                return ShapeKind::Triangle;
            }
            if s.eq_ignore_ascii_case("hexagon") {
                return ShapeKind::Hexagon;
            }
            if s.eq_ignore_ascii_case("cylinder") {
                return ShapeKind::Cylinder;
            }
            if s.eq_ignore_ascii_case("cloud") {
                return ShapeKind::Cloud;
            }
            if s.eq_ignore_ascii_case("parallelogram") {
                return ShapeKind::Parallelogram;
            }
            if s.eq_ignore_ascii_case("trapezoid") {
                return ShapeKind::Trapezoid;
            }
            if s.eq_ignore_ascii_case("polygon") {
                return ShapeKind::Polygon;
            }
            // stencil:<name> — a draw.io stencil reference
            if s.starts_with("stencil:") {
                return ShapeKind::Stencil;
            }
        }

        // Check for ellipse legacy key
        if let Some(v) = style.get("ellipse") {
            if parse_bool(v.as_str()) == Some(true) {
                return ShapeKind::Ellipse;
            }
        }

        // Check for rounded
        if let Some(v) = style.get("rounded") {
            if parse_bool(v.as_str()) == Some(true) {
                return ShapeKind::RoundedRect;
            }
        }

        ShapeKind::Rect
    }
}

/// Parse a boolean value.
///
/// Recognizes `"1"` and `"true"` (case-insensitive) as `true`,
/// `"0"` and `"false"` (case-insensitive) as `false`, and everything else as `None`.
fn parse_bool(s: &str) -> Option<bool> {
    match s {
        "1" | "true" | "TRUE" | "True" => Some(true),
        "0" | "false" | "FALSE" | "False" => Some(false),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn style_map<const N: usize>(entries: [(&str, &str); N]) -> StyleMap {
        let mut map = StyleMap::new();
        for (k, v) in entries {
            map.insert(k, v);
        }
        map
    }

    // ─── resolve tests ────────────────────────────────────────────────────────

    #[test]
    fn resolve_empty_style_yields_defaults() {
        let map = StyleMap::new();
        let resolved = StyleResolver::new().resolve(&map);
        assert!(resolved.fill_color.is_none());
        assert!(resolved.stroke_color.is_none());
        assert!(resolved.stroke_width.is_none());
        assert!(resolved.rounded.is_none());
        assert!(resolved.dashed.is_none());
        assert!(resolved.font_color.is_none());
        assert!(resolved.font_size.is_none());
        assert!(resolved.font_family.is_none());
        assert!(resolved.opacity.is_none());
        assert!(resolved.remaining.is_empty());
    }

    #[test]
    fn resolve_known_keys_populate_typed_fields() {
        let map = style_map([
            ("fillColor", "#dae8fc"),
            ("strokeColor", "#000000"),
            ("strokeWidth", "2"),
            ("rounded", "1"),
            ("dashed", "0"),
            ("fontColor", "#ffffff"),
            ("fontSize", "12"),
            ("fontFamily", "Helvetica"),
            ("opacity", "100"),
        ]);
        let resolved = StyleResolver::new().resolve(&map);

        assert_eq!(resolved.fill_color, Some("#dae8fc".to_owned()));
        assert_eq!(resolved.stroke_color, Some("#000000".to_owned()));
        assert_eq!(resolved.stroke_width, Some(2.0));
        assert_eq!(resolved.rounded, Some(true));
        assert_eq!(resolved.dashed, Some(false));
        assert_eq!(resolved.font_color, Some("#ffffff".to_owned()));
        assert_eq!(resolved.font_size, Some(12.0));
        assert_eq!(resolved.font_family, Some("Helvetica".to_owned()));
        assert_eq!(resolved.opacity, Some(1.0)); // clamped from 100
        assert!(resolved.remaining.is_empty());
    }

    #[test]
    fn resolve_unknown_key_preserved_in_remaining() {
        let mut map = StyleMap::new();
        map.insert("fillColor", "#ffffff");
        map.insert("customKey", "foo");
        let resolved = StyleResolver::new().resolve(&map);

        assert_eq!(resolved.fill_color, Some("#ffffff".to_owned()));
        assert_eq!(resolved.remaining.len(), 1);
        assert_eq!(
            resolved.remaining.get("customKey").map(|v| v.as_str()),
            Some("foo")
        );
    }

    #[test]
    fn resolve_mixed_known_and_unknown() {
        let map = style_map([
            ("fillColor", "#fff"),
            ("strokeColor", "#000"),
            ("unknown1", "val1"),
            ("unknown2", "val2"),
        ]);
        let resolved = StyleResolver::new().resolve(&map);

        assert_eq!(resolved.fill_color, Some("#fff".to_owned()));
        assert_eq!(resolved.stroke_color, Some("#000".to_owned()));
        assert_eq!(resolved.remaining.len(), 2);
        assert!(resolved.remaining.get("unknown1").is_some());
        assert!(resolved.remaining.get("unknown2").is_some());
    }

    #[test]
    fn resolve_numeric_parse_failure_preserves_key() {
        let mut map = StyleMap::new();
        map.insert("strokeWidth", "not-a-number");
        let resolved = StyleResolver::new().resolve(&map);

        assert!(resolved.stroke_width.is_none());
        assert_eq!(resolved.remaining.len(), 1);
        assert_eq!(
            resolved.remaining.get("strokeWidth").map(|v| v.as_str()),
            Some("not-a-number")
        );
    }

    #[test]
    fn resolve_boolean_truthy_variants() {
        let truthy = ["1", "true", "TRUE", "True"];
        let falsy = ["0", "false", "FALSE", "False"];
        let unknown = ["yes", "no", "maybe", ""];

        for val in truthy {
            let mut map = StyleMap::new();
            map.insert("rounded", val);
            let resolved = StyleResolver::new().resolve(&map);
            assert_eq!(
                resolved.rounded,
                Some(true),
                "rounded={val} should be Some(true)"
            );
        }

        for val in falsy {
            let mut map = StyleMap::new();
            map.insert("rounded", val);
            let resolved = StyleResolver::new().resolve(&map);
            assert_eq!(
                resolved.rounded,
                Some(false),
                "rounded={val} should be Some(false)"
            );
        }

        for val in unknown {
            let mut map = StyleMap::new();
            map.insert("rounded", val);
            let resolved = StyleResolver::new().resolve(&map);
            assert!(resolved.rounded.is_none(), "rounded={val} should be None");
            assert_eq!(
                resolved.remaining.get("rounded").map(|v| v.as_str()),
                Some(val),
                "rounded={val} should be preserved in remaining"
            );
        }
    }

    #[test]
    fn resolve_opacity_clamped_to_valid_range() {
        let mut map = StyleMap::new();
        map.insert("opacity", "150");
        let resolved = StyleResolver::new().resolve(&map);
        assert_eq!(resolved.opacity, Some(1.0));

        let mut map2 = StyleMap::new();
        map2.insert("opacity", "-0.5");
        let resolved = StyleResolver::new().resolve(&map2);
        assert_eq!(resolved.opacity, Some(0.0));
    }

    // ─── classify tests ───────────────────────────────────────────────────────

    #[test]
    fn classify_default_is_rect() {
        let map = StyleMap::new();
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::Rect);
    }

    #[test]
    fn classify_rounded_one_is_rounded_rect() {
        let mut map = StyleMap::new();
        map.insert("rounded", "1");
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::RoundedRect);
    }

    #[test]
    fn classify_ellipse_keyword_is_ellipse() {
        let mut map = StyleMap::new();
        map.insert("shape", "ellipse");
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::Ellipse);
    }

    #[test]
    fn classify_ellipse_legacy_keyword() {
        let mut map = StyleMap::new();
        map.insert("ellipse", "1");
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::Ellipse);
    }

    #[test]
    fn classify_rounded_takes_precedence_over_default() {
        let mut map = StyleMap::new();
        map.insert("rounded", "1");
        // No shape key — just rounded=1
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::RoundedRect);
    }

    #[test]
    fn classify_shape_ellipse_takes_precedence() {
        let mut map = StyleMap::new();
        map.insert("shape", "ellipse");
        map.insert("rounded", "1");
        // ellipse should win over rounded
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::Ellipse);
    }

    // ─── new shape classify tests ───────────────────────────────────────────────

    #[test]
    fn classify_diamond() {
        let mut map = StyleMap::new();
        map.insert("shape", "diamond");
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::Diamond);
    }

    #[test]
    fn classify_rhombus_alias() {
        let mut map = StyleMap::new();
        map.insert("shape", "rhombus");
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::Diamond);
    }

    #[test]
    fn classify_triangle() {
        let mut map = StyleMap::new();
        map.insert("shape", "triangle");
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::Triangle);
    }

    #[test]
    fn classify_hexagon() {
        let mut map = StyleMap::new();
        map.insert("shape", "hexagon");
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::Hexagon);
    }

    #[test]
    fn classify_cylinder() {
        let mut map = StyleMap::new();
        map.insert("shape", "cylinder");
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::Cylinder);
    }

    #[test]
    fn classify_cloud() {
        let mut map = StyleMap::new();
        map.insert("shape", "cloud");
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::Cloud);
    }

    #[test]
    fn classify_parallelogram() {
        let mut map = StyleMap::new();
        map.insert("shape", "parallelogram");
        assert_eq!(
            StyleResolver::new().classify(&map),
            ShapeKind::Parallelogram
        );
    }

    #[test]
    fn classify_trapezoid() {
        let mut map = StyleMap::new();
        map.insert("shape", "trapezoid");
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::Trapezoid);
    }

    #[test]
    fn classify_polygon() {
        let mut map = StyleMap::new();
        map.insert("shape", "polygon");
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::Polygon);
    }

    #[test]
    fn classify_shape_case_insensitive() {
        let mut map = StyleMap::new();
        map.insert("shape", "DIAMOND");
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::Diamond);

        let mut map2 = StyleMap::new();
        map2.insert("shape", "Hexagon");
        assert_eq!(StyleResolver::new().classify(&map2), ShapeKind::Hexagon);
    }

    #[test]
    fn classify_shape_with_fill_style_still_classifies() {
        // shape key should be read from remaining map, not interfere with fill
        let mut map = StyleMap::new();
        map.insert("shape", "cloud");
        map.insert("fillColor", "#ff0000");
        assert_eq!(StyleResolver::new().classify(&map), ShapeKind::Cloud);
    }

    // ─── helper tests ─────────────────────────────────────────────────────────

    #[test]
    fn resolved_style_is_empty() {
        let empty = ResolvedStyle::default();
        assert!(empty.is_empty());

        let non_empty = ResolvedStyle {
            fill_color: Some("#fff".to_owned()),
            ..Default::default()
        };
        assert!(!non_empty.is_empty());
    }

    #[test]
    fn known_keys_includes_all_resolved_keys() {
        let keys = StyleResolver::known_keys();
        let expected = [
            "fillColor",
            "strokeColor",
            "strokeWidth",
            "rounded",
            "dashed",
            "fontColor",
            "fontSize",
            "fontFamily",
            "opacity",
        ];
        assert_eq!(keys.len(), expected.len());
        for k in expected {
            assert!(keys.contains(&k), "known_keys should contain {k}");
        }
    }
}
