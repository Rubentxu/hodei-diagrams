//! Style to SVG presentation attribute mapping.

use crate::escape::escape_attr;
use diagram_scene::ResolvedStyle;

/// The rendering context that determines which attributes are emitted.
#[derive(Clone, Copy)]
pub(crate) enum AttrContext {
    /// Shape context: emits fill, stroke, stroke-width, dash, opacity.
    Shape,
    /// Text context: emits font-*, fill (font_color), opacity.
    Text,
    /// Edge context: always emits fill="none" first, then stroke, stroke-width, dash, opacity.
    Edge,
}

/// Maps a resolved style to SVG presentation attributes.
///
/// Returns a space-prefixed string of `key="value"` pairs, or an empty string.
/// Default-omit: None fields are not emitted.
/// Edge context always emits `fill="none"` as the first attribute.
pub(crate) fn style_to_attrs(style: &ResolvedStyle, ctx: AttrContext) -> String {
    let mut attrs = String::new();

    // Edge context: always emit fill="none" first
    if matches!(ctx, AttrContext::Edge) {
        attrs.push_str(" fill=\"none\"");
    }

    // fill_color -> fill (Shape only)
    if matches!(ctx, AttrContext::Shape) {
        if let Some(ref c) = style.fill_color {
            attrs.push_str(" fill=\"");
            attrs.push_str(c);
            attrs.push('"');
        }
    }

    // font_color -> fill (Text only)
    if matches!(ctx, AttrContext::Text) {
        if let Some(ref c) = style.font_color {
            attrs.push_str(" fill=\"");
            attrs.push_str(c);
            attrs.push('"');
        }
    }

    // stroke_color -> stroke
    if matches!(ctx, AttrContext::Shape | AttrContext::Edge) {
        if let Some(ref c) = style.stroke_color {
            attrs.push_str(" stroke=\"");
            attrs.push_str(c);
            attrs.push('"');
        }
    }

    // stroke_width -> stroke-width
    if matches!(ctx, AttrContext::Shape | AttrContext::Edge) {
        if let Some(w) = style.stroke_width {
            attrs.push_str(" stroke-width=\"");
            attrs.push_str(&w.to_string());
            attrs.push('"');
        }
    }

    // dashed -> stroke-dasharray
    if matches!(ctx, AttrContext::Shape | AttrContext::Edge) && style.dashed == Some(true) {
        attrs.push_str(" stroke-dasharray=\"8 8\"");
    }

    // font_size -> font-size (Text only)
    if matches!(ctx, AttrContext::Text) {
        if let Some(s) = style.font_size {
            attrs.push_str(" font-size=\"");
            attrs.push_str(&s.to_string());
            attrs.push('"');
        }
    }

    // font_family -> font-family (Text only)
    if matches!(ctx, AttrContext::Text) {
        if let Some(ref f) = style.font_family {
            attrs.push_str(" font-family=\"");
            attrs.push_str(&escape_attr(f));
            attrs.push('"');
        }
    }

    // opacity
    if let Some(o) = style.opacity {
        attrs.push_str(" opacity=\"");
        attrs.push_str(&o.to_string());
        attrs.push('"');
    }

    // bold=true -> font-weight="bold" (text context)
    if matches!(ctx, AttrContext::Text) {
        if let Some(v) = style.remaining.get("bold") {
            if v.as_str() == "true" {
                attrs.push_str(" font-weight=\"bold\"");
            }
        }
        // italic=true -> font-style="italic" (text context)
        if let Some(v) = style.remaining.get("italic") {
            if v.as_str() == "true" {
                attrs.push_str(" font-style=\"italic\"");
            }
        }
    }

    // remaining: StyleMap -> style="k1=v1;k2=v2" (always last)
    // Filter out bold/italic since we handled them above
    if !style.remaining.is_empty() {
        let has_remaining = style
            .remaining
            .iter()
            .any(|(k, _)| k != "bold" && k != "italic");
        if has_remaining {
            attrs.push_str(" style=\"");
            let mut first = true;
            for (key, value) in style.remaining.iter() {
                if key == "bold" || key == "italic" {
                    continue;
                }
                if !first {
                    attrs.push(';');
                }
                first = false;
                attrs.push_str(key);
                attrs.push('=');
                attrs.push_str(&escape_attr(value.as_str()));
            }
            attrs.push('"');
        }
    }

    attrs
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::StyleMap;

    fn empty_style() -> ResolvedStyle {
        ResolvedStyle::default()
    }

    fn style_with_fill() -> ResolvedStyle {
        ResolvedStyle {
            fill_color: Some("#ff0000".to_owned()),
            ..Default::default()
        }
    }

    fn style_with_font_color() -> ResolvedStyle {
        ResolvedStyle {
            font_color: Some("#333333".to_owned()),
            ..Default::default()
        }
    }

    fn style_with_dashed_true() -> ResolvedStyle {
        ResolvedStyle {
            dashed: Some(true),
            stroke_color: Some("#000000".to_owned()),
            ..Default::default()
        }
    }

    fn style_with_dashed_false() -> ResolvedStyle {
        ResolvedStyle {
            dashed: Some(false),
            ..Default::default()
        }
    }

    fn style_with_dashed_none() -> ResolvedStyle {
        ResolvedStyle {
            dashed: None,
            ..Default::default()
        }
    }

    fn style_with_remaining() -> ResolvedStyle {
        let mut remaining = StyleMap::new();
        remaining.insert("a", "1");
        remaining.insert("b", "2");
        ResolvedStyle {
            remaining,
            ..Default::default()
        }
    }

    fn style_with_remaining_escaped() -> ResolvedStyle {
        let mut remaining = StyleMap::new();
        remaining.insert("x", "y&z");
        ResolvedStyle {
            remaining,
            ..Default::default()
        }
    }

    #[test]
    fn empty_style_yields_empty_attrs() {
        assert_eq!(style_to_attrs(&empty_style(), AttrContext::Shape), "");
    }

    #[test]
    fn fill_color_emits_fill_attr() {
        assert_eq!(
            style_to_attrs(&style_with_fill(), AttrContext::Shape),
            " fill=\"#ff0000\""
        );
    }

    #[test]
    fn font_color_emits_fill_attr_for_text() {
        assert_eq!(
            style_to_attrs(&style_with_font_color(), AttrContext::Text),
            " fill=\"#333333\""
        );
    }

    #[test]
    fn dashed_true_emits_stroke_dasharray() {
        let result = style_to_attrs(&style_with_dashed_true(), AttrContext::Edge);
        // stroke_color="#000000" is emitted before stroke-dasharray per design table
        assert!(result.starts_with(" fill=\"none\" stroke=\"#000000\" stroke-dasharray=\"8 8\""));
    }

    #[test]
    fn dashed_false_omits_stroke_dasharray() {
        let result = style_to_attrs(&style_with_dashed_false(), AttrContext::Edge);
        assert!(!result.contains("stroke-dasharray"));
    }

    #[test]
    fn dashed_none_omits_stroke_dasharray() {
        let result = style_to_attrs(&style_with_dashed_none(), AttrContext::Edge);
        assert!(!result.contains("stroke-dasharray"));
    }

    #[test]
    fn remaining_emits_style_attr_sorted() {
        let result = style_to_attrs(&style_with_remaining(), AttrContext::Shape);
        assert!(result.contains(" style=\"a=1;b=2\""));
    }

    #[test]
    fn remaining_escapes_values() {
        let result = style_to_attrs(&style_with_remaining_escaped(), AttrContext::Shape);
        assert!(result.contains(" style=\"x=y&amp;z\""));
    }
}
