//! Style resolution: resolves a `StyleMap` into typed `ResolvedStyle` fields.
//!
//! `StyleResolver`, `ResolvedStyle`, and `ShapeKind` are implemented in PR1.
//! This stub exists to keep the workspace compiling during the skeleton PR.

use diagram_core::StyleMap;
use serde::{Deserialize, Serialize};

/// Shadow configuration for a shape.
/// SVG: emitted as `<feDropShadow>` inside a `<filter>`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShadowConfig {
    /// Enable shadow.
    pub enabled: bool,
    /// Horizontal offset in user-space units.
    pub dx: f64,
    /// Vertical offset in user-space units.
    pub dy: f64,
    /// Blur standard deviation.
    pub blur: f64,
    /// Shadow color as hex string, e.g. "#00000080".
    pub color: String,
}

/// Glass effect configuration for a shape.
/// SVG: emitted as `fill-opacity`. CSS `backdrop-filter` is applied via
/// the `shape--glass` class in the web-shell.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GlassConfig {
    /// Enable glass effect.
    pub enabled: bool,
    /// Fill opacity in 0.0..1.0 range.
    pub opacity: f64,
}

/// Gradient kind.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum GradientKind {
    /// Linear gradient with an angle.
    Linear,
    /// Radial gradient with a focal point.
    Radial,
}

/// A single color stop in a gradient.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GradientStop {
    /// Stop position as fraction 0.0..1.0.
    pub offset: f64,
    /// Hex color string.
    pub color: String,
}

/// Gradient configuration for a shape fill.
/// SVG: emitted as `<linearGradient>` or `<radialGradient>` inside `<defs>`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GradientConfig {
    /// Gradient kind.
    pub kind: GradientKind,
    /// Rotation angle in degrees for Linear gradients. Ignored for Radial.
    pub angle: f64,
    /// Radial focal point X (0..1, relative to bounding box). Only for Radial.
    pub fx: f64,
    /// Radial focal point Y (0..1, relative to bounding box). Only for Radial.
    pub fy: f64,
    /// Color stops, ordered by offset.
    pub stops: Vec<GradientStop>,
}

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
    /// Drop shadow configuration.
    pub shadow: Option<ShadowConfig>,
    /// Glass effect configuration.
    pub glass: Option<GlassConfig>,
    /// Gradient fill configuration.
    pub gradient: Option<GradientConfig>,
    /// Arrow style at the end (target) of an edge. Default: "classic".
    pub end_arrow: Option<String>,
    /// Arrow style at the start (source) of an edge. Default: "none".
    pub start_arrow: Option<String>,
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
            && self.shadow.is_none()
            && self.glass.is_none()
            && self.gradient.is_none()
            && self.end_arrow.is_none()
            && self.start_arrow.is_none()
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
            "shadow",
            "shadowDx",
            "shadowDy",
            "shadowBlur",
            "shadowColor",
            "glass",
            "glassOpacity",
            "gradient",
            "gradientType",
            "gradientAngle",
            "gradientColor1",
            "gradientColor2",
            "gradientColor3",
            "gradientColor4",
            "gradientColor5",
            "endArrow",
            "startArrow",
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
        let mut end_arrow = None;
        let mut start_arrow = None;

        // Effect fields collected in first pass
        let mut shadow_enabled = false;
        let mut shadow_dx: Option<f64> = None;
        let mut shadow_dy: Option<f64> = None;
        let mut shadow_blur: Option<f64> = None;
        let mut shadow_color: Option<String> = None;

        let mut glass_enabled = false;
        let mut glass_opacity: Option<f64> = None;

        let mut gradient_enabled = false;
        let mut gradient_kind: Option<GradientKind> = None;
        let mut gradient_angle: Option<f64> = None;
        let mut gradient_stops: Vec<(usize, String)> = Vec::new();

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
                // Shadow keys
                "shadow" => {
                    if let Some(b) = parse_bool(value.as_str()) {
                        shadow_enabled = b;
                    }
                }
                "shadowDx" => {
                    if let Ok(v) = value.as_str().parse::<f64>() {
                        shadow_dx = Some(v);
                    }
                }
                "shadowDy" => {
                    if let Ok(v) = value.as_str().parse::<f64>() {
                        shadow_dy = Some(v);
                    }
                }
                "shadowBlur" => {
                    if let Ok(v) = value.as_str().parse::<f64>() {
                        shadow_blur = Some(v);
                    }
                }
                "shadowColor" => {
                    shadow_color = Some(value.as_str().to_owned());
                }
                // Glass keys
                "glass" => {
                    if let Some(b) = parse_bool(value.as_str()) {
                        glass_enabled = b;
                    }
                }
                "glassOpacity" => {
                    if let Ok(v) = value.as_str().parse::<f64>() {
                        glass_opacity = Some(v.clamp(0.0, 1.0));
                    }
                }
                // Gradient keys
                "gradient" => {
                    if let Some(b) = parse_bool(value.as_str()) {
                        gradient_enabled = b;
                    }
                }
                "gradientType" => {
                    if value.as_str() == "radial" {
                        gradient_kind = Some(GradientKind::Radial);
                    } else {
                        gradient_kind = Some(GradientKind::Linear);
                    }
                }
                "gradientAngle" => {
                    if let Ok(v) = value.as_str().parse::<f64>() {
                        gradient_angle = Some(v);
                    }
                }
                k if k.starts_with("gradientColor") => {
                    // gradientColor1=#ff0000, gradientColor2=#0000ff, ...
                    // Collect into gradient_stops_collected for sorting.
                    // Actual building of sorted stops happens after the loop.
                    if let Some(idx_str) = k.strip_prefix("gradientColor") {
                        if let Ok(idx) = idx_str.parse::<usize>() {
                            gradient_stops.push((idx, value.as_str().to_owned()));
                        }
                    }
                }
                "endArrow" => end_arrow = Some(value.as_str().to_owned()),
                "startArrow" => start_arrow = Some(value.as_str().to_owned()),
                _ => {
                    remaining.insert(key, value.as_str());
                }
            }
        }

        // Sort gradient stops by key index and build proper GradientStop list
        gradient_stops.sort_by_key(|(idx, _)| *idx);
        let n = gradient_stops.len();
        let gradient_stops: Vec<GradientStop> = gradient_stops
            .into_iter()
            .enumerate()
            .map(|(i, (_, color))| {
                let offset = if n == 1 {
                    0.5
                } else {
                    i as f64 / (n - 1) as f64
                };
                GradientStop { offset, color }
            })
            .collect();

        // Build effect configs only if enabled
        let shadow = if shadow_enabled {
            Some(ShadowConfig {
                enabled: true,
                dx: shadow_dx.unwrap_or(3.0),
                dy: shadow_dy.unwrap_or(3.0),
                blur: shadow_blur.unwrap_or(3.0),
                color: shadow_color.unwrap_or_else(|| "#00000040".to_owned()),
            })
        } else {
            None
        };

        let glass = if glass_enabled {
            Some(GlassConfig {
                enabled: true,
                opacity: glass_opacity.unwrap_or(0.5),
            })
        } else {
            None
        };

        let gradient = if gradient_enabled && !gradient_stops.is_empty() {
            Some(GradientConfig {
                kind: gradient_kind.unwrap_or(GradientKind::Linear),
                angle: gradient_angle.unwrap_or(0.0),
                fx: 0.5,
                fy: 0.5,
                stops: gradient_stops,
            })
        } else {
            None
        };

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
            shadow,
            glass,
            gradient,
            end_arrow,
            start_arrow,
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
        let resolved2 = StyleResolver::new().resolve(&map2);
        assert_eq!(resolved2.opacity, Some(0.0));
    }

    #[test]
    fn resolve_end_arrow_classic() {
        let mut map = StyleMap::new();
        map.insert("endArrow", "classic");
        let resolved = StyleResolver::new().resolve(&map);
        assert_eq!(resolved.end_arrow, Some("classic".to_owned()));
    }

    #[test]
    fn resolve_end_arrow_none() {
        let mut map = StyleMap::new();
        map.insert("endArrow", "none");
        let resolved = StyleResolver::new().resolve(&map);
        assert_eq!(resolved.end_arrow, Some("none".to_owned()));
    }

    #[test]
    fn resolve_start_arrow_block() {
        let mut map = StyleMap::new();
        map.insert("startArrow", "block");
        let resolved = StyleResolver::new().resolve(&map);
        assert_eq!(resolved.start_arrow, Some("block".to_owned()));
    }

    #[test]
    fn resolve_no_end_arrow_yields_none() {
        let map = StyleMap::new();
        let resolved = StyleResolver::new().resolve(&map);
        assert!(resolved.end_arrow.is_none());
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
            "shadow",
            "shadowDx",
            "shadowDy",
            "shadowBlur",
            "shadowColor",
            "glass",
            "glassOpacity",
            "gradient",
            "gradientType",
            "gradientAngle",
            "gradientColor1",
            "gradientColor2",
            "gradientColor3",
            "gradientColor4",
            "gradientColor5",
            "endArrow",
            "startArrow",
        ];
        assert_eq!(keys.len(), expected.len());
        for k in expected {
            assert!(keys.contains(&k), "known_keys should contain {k}");
        }
    }
}
