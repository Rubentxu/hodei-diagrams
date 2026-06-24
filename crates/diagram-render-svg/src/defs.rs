//! SVG `<defs>` registry — manages gradients, filters, patterns referenced by elements.
//!
//! All registered defs are deduplicated by ID. The registry is consumed by
//! `SvgRenderer` to emit a single `<defs>` block at render time.

use std::collections::{HashMap, HashSet};

/// A registered SVG definition ready to be emitted inside `<defs>`.
#[derive(Clone, PartialEq)]
pub(crate) enum SvgDef {
    /// `<linearGradient id="...">…</linearGradient>`
    LinearGradient {
        id: String,
        x1: f64,
        y1: f64,
        x2: f64,
        y2: f64,
        stops: Vec<GradientStop>,
    },
    /// `<radialGradient id="...">…</radialGradient>`
    RadialGradient {
        id: String,
        cx: f64,
        cy: f64,
        r: f64,
        stops: Vec<GradientStop>,
    },
    /// `<filter id="...">…</filter>`
    Filter { id: String, filter: FilterDef },
    /// `<marker id="...">…</marker>`
    Marker { id: String, svg: String },
}

/// A single gradient stop.
#[derive(Clone, PartialEq)]
pub(crate) struct GradientStop {
    /// Offset in [0.0, 1.0].
    pub offset: f64,
    /// CSS color string.
    pub color: String,
    /// Optional opacity in [0.0, 1.0].
    pub opacity: Option<f64>,
}

/// Filter primitives for `<filter>`.
#[derive(Clone, PartialEq)]
pub(crate) enum FilterDef {
    /// `<feDropShadow dx="…" dy="…" stdDeviation="…" color="…"/>`
    DropShadow {
        dx: f64,
        dy: f64,
        std_dev: f64,
        color: String,
    },
    /// `<feGaussianBlur stdDeviation="…"/>`
    #[allow(dead_code)]
    Blur { std_dev: f64 },
    // Future: glass, gradient-map, etc.
}

/// Manages deduplicated SVG definitions.
///
/// ```ignore
/// let mut defs = DefsManager::new();
/// let id = defs.add_linear_gradient(x1, y1, x2, y2, stops);
/// // later: emit defs with to_defs_markup()
/// ```
#[derive(Default)]
pub(crate) struct DefsManager {
    defs: HashMap<String, SvgDef>,
    /// Separate set for markers to allow deduplication without storing full SVG strings
    marker_ids: HashSet<String>,
}

impl DefsManager {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Registers a linear gradient and returns its SVG element ID.
    pub(crate) fn add_linear_gradient(
        &mut self,
        id: impl Into<String>,
        x1: f64,
        y1: f64,
        x2: f64,
        y2: f64,
        stops: Vec<GradientStop>,
    ) -> String {
        let id = id.into();
        self.defs.insert(
            id.clone(),
            SvgDef::LinearGradient {
                id: id.clone(),
                x1,
                y1,
                x2,
                y2,
                stops,
            },
        );
        id
    }

    /// Registers a radial gradient and returns its SVG element ID.
    pub(crate) fn add_radial_gradient(
        &mut self,
        id: impl Into<String>,
        cx: f64,
        cy: f64,
        r: f64,
        stops: Vec<GradientStop>,
    ) -> String {
        let id = id.into();
        self.defs.insert(
            id.clone(),
            SvgDef::RadialGradient {
                id: id.clone(),
                cx,
                cy,
                r,
                stops,
            },
        );
        id
    }

    /// Registers a drop-shadow filter and returns its SVG element ID.
    pub(crate) fn add_drop_shadow_filter(
        &mut self,
        id: impl Into<String>,
        dx: f64,
        dy: f64,
        std_dev: f64,
        color: String,
    ) -> String {
        let id = id.into();
        self.defs.insert(
            id.clone(),
            SvgDef::Filter {
                id: id.clone(),
                filter: FilterDef::DropShadow {
                    dx,
                    dy,
                    std_dev,
                    color,
                },
            },
        );
        id
    }

    /// Registers an SVG marker definition. Deduplicates by ID.
    pub(crate) fn add_marker(&mut self, id: &str, svg: &str) {
        if !self.marker_ids.contains(id) {
            self.marker_ids.insert(id.to_owned());
            self.defs.insert(
                id.to_owned(),
                SvgDef::Marker {
                    id: id.to_owned(),
                    svg: svg.to_owned(),
                },
            );
        }
    }

    /// Returns the number of registered defs.
    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.defs.len()
    }

    /// Returns true if no defs are registered.
    #[allow(dead_code)]
    #[cfg(test)]
    pub(crate) fn is_empty(&self) -> bool {
        self.defs.is_empty()
    }

    /// Emits the full `<defs>…</defs>` block. Idempotent (empty if no defs registered).
    pub(crate) fn to_defs_markup(&self) -> String {
        if self.defs.is_empty() {
            return String::new();
        }

        let mut out = String::from("<defs>");
        for def in self.defs.values() {
            match def {
                SvgDef::LinearGradient {
                    id,
                    x1,
                    y1,
                    x2,
                    y2,
                    stops,
                } => {
                    out.push_str("<linearGradient id=\"");
                    out.push_str(id);
                    out.push_str("\" x1=\"");
                    out.push_str(&fmt_float(*x1));
                    out.push_str("\" y1=\"");
                    out.push_str(&fmt_float(*y1));
                    out.push_str("\" x2=\"");
                    out.push_str(&fmt_float(*x2));
                    out.push_str("\" y2=\"");
                    out.push_str(&fmt_float(*y2));
                    out.push_str("\">");
                    for stop in stops {
                        out.push_str("<stop offset=\"");
                        out.push_str(&fmt_float(stop.offset * 100.0));
                        out.push_str("%\" stop-color=\"");
                        out.push_str(&stop.color);
                        if let Some(opacity) = stop.opacity {
                            out.push_str("\" stop-opacity=\"");
                            out.push_str(&fmt_float(opacity));
                        }
                        out.push_str("\"/>");
                    }
                    out.push_str("</linearGradient>");
                }
                SvgDef::RadialGradient {
                    id,
                    cx,
                    cy,
                    r,
                    stops,
                } => {
                    out.push_str("<radialGradient id=\"");
                    out.push_str(id);
                    out.push_str("\" cx=\"");
                    out.push_str(&fmt_float(*cx));
                    out.push_str("\" cy=\"");
                    out.push_str(&fmt_float(*cy));
                    out.push_str("\" r=\"");
                    out.push_str(&fmt_float(*r));
                    out.push_str("\">");
                    for stop in stops {
                        out.push_str("<stop offset=\"");
                        out.push_str(&fmt_float(stop.offset * 100.0));
                        out.push_str("%\" stop-color=\"");
                        out.push_str(&stop.color);
                        if let Some(opacity) = stop.opacity {
                            out.push_str("\" stop-opacity=\"");
                            out.push_str(&fmt_float(opacity));
                        }
                        out.push_str("\"/>");
                    }
                    out.push_str("</radialGradient>");
                }
                SvgDef::Filter { id, filter } => {
                    out.push_str("<filter id=\"");
                    out.push_str(id);
                    out.push_str("\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"200%\">");
                    match filter {
                        FilterDef::DropShadow {
                            dx,
                            dy,
                            std_dev,
                            color,
                        } => {
                            out.push_str("<feDropShadow dx=\"");
                            out.push_str(&fmt_float(*dx));
                            out.push_str("\" dy=\"");
                            out.push_str(&fmt_float(*dy));
                            out.push_str("\" stdDeviation=\"");
                            out.push_str(&fmt_float(*std_dev));
                            out.push_str("\" flood-color=\"");
                            out.push_str(color);
                            out.push_str("\"/>");
                        }
                        FilterDef::Blur { std_dev } => {
                            out.push_str("<feGaussianBlur stdDeviation=\"");
                            out.push_str(&fmt_float(*std_dev));
                            out.push_str("\"/>");
                        }
                    }
                    out.push_str("</filter>");
                }
                SvgDef::Marker { id: _, svg } => {
                    out.push_str(svg);
                }
            }
        }
        out.push_str("</defs>");
        out
    }
}

/// Formats a float for SVG attribute output without trailing zeros.
fn fmt_float(v: f64) -> String {
    let s = format!("{v}");
    // Strip trailing ".0" when whole number
    if let Some(pos) = s.find('.') {
        let after = &s[pos + 1..];
        if after.chars().all(|c| c == '0') {
            return s[..pos].to_string();
        }
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_stop(offset: f64, color: &str) -> GradientStop {
        GradientStop {
            offset,
            color: color.to_string(),
            opacity: None,
        }
    }

    #[test]
    fn linear_gradient_markup() {
        let mut defs = DefsManager::new();
        defs.add_linear_gradient(
            "grad1",
            0.0,
            0.0,
            1.0,
            0.0,
            vec![mk_stop(0.0, "#fff"), mk_stop(1.0, "#000")],
        );
        let html = defs.to_defs_markup();
        assert!(html.contains("<linearGradient id=\"grad1\""));
        assert!(html.contains("x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\""));
        assert!(html.contains("<stop offset=\"0%\" stop-color=\"#fff\"/>"));
        assert!(html.contains("<stop offset=\"100%\" stop-color=\"#000\"/>"));
    }

    #[test]
    fn radial_gradient_markup() {
        let mut defs = DefsManager::new();
        defs.add_radial_gradient(
            "rad1",
            0.5,
            0.5,
            0.5,
            vec![mk_stop(0.0, "red"), mk_stop(1.0, "blue")],
        );
        let html = defs.to_defs_markup();
        assert!(html.contains("<radialGradient id=\"rad1\""));
        assert!(html.contains("cx=\"0.5\" cy=\"0.5\" r=\"0.5\""));
    }

    #[test]
    fn drop_shadow_filter_markup() {
        let mut defs = DefsManager::new();
        defs.add_drop_shadow_filter("shadow1", 3.0, 3.0, 4.0, "#000000".to_string());
        let html = defs.to_defs_markup();
        assert!(html.contains("<filter id=\"shadow1\""));
        assert!(html.contains(
            "<feDropShadow dx=\"3\" dy=\"3\" stdDeviation=\"4\" flood-color=\"#000000\"/>"
        ));
    }

    #[test]
    fn deduplication() {
        let mut defs = DefsManager::new();
        defs.add_linear_gradient("dup", 0.0, 0.0, 1.0, 0.0, vec![mk_stop(0.0, "red")]);
        defs.add_linear_gradient("dup", 1.0, 0.0, 0.0, 0.0, vec![mk_stop(0.0, "blue")]);
        // second "dup" overwrites — only one def present
        assert_eq!(defs.len(), 1);
    }

    #[test]
    fn empty_defs_produces_nothing() {
        let defs = DefsManager::new();
        assert_eq!(defs.to_defs_markup(), "");
    }
}
