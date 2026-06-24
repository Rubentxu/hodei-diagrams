//! Integration tests for v0.45 (endArrow/startArrow extraction in ResolvedStyle).
//!
//! Tests cover:
//! - endArrow=classic → ResolvedStyle.end_arrow == Some("classic")
//! - endArrow=none → ResolvedStyle.end_arrow == Some("none")
//! - No endArrow → ResolvedStyle.end_arrow == None
//! - startArrow=block → ResolvedStyle.start_arrow == Some("block")
//! - No startArrow → ResolvedStyle.start_arrow == None
//!
//! Run with:
//!   cargo test -p diagram-scene --test integration_arrowheads

use diagram_core::style::{StyleMap, StyleValue};
use diagram_scene::{ResolvedStyle, StyleResolver};

// Helper to resolve a style map
fn resolve(style_map: StyleMap) -> ResolvedStyle {
    let resolver = StyleResolver::new();
    resolver.resolve(&style_map)
}

// ─── endArrow extraction ───────────────────────────────────────────────────────

#[test]
fn end_arrow_classic_resolved() {
    let mut style = StyleMap::new();
    style.insert("endArrow", StyleValue::from("classic"));

    let resolved = resolve(style);

    assert_eq!(
        resolved.end_arrow.as_deref(),
        Some("classic"),
        "end_arrow should be Some(\"classic\")"
    );
}

#[test]
fn end_arrow_none_resolved() {
    let mut style = StyleMap::new();
    style.insert("endArrow", StyleValue::from("none"));

    let resolved = resolve(style);

    assert_eq!(
        resolved.end_arrow.as_deref(),
        Some("none"),
        "end_arrow should be Some(\"none\")"
    );
}

#[test]
fn end_arrow_block_resolved() {
    let mut style = StyleMap::new();
    style.insert("endArrow", StyleValue::from("block"));

    let resolved = resolve(style);

    assert_eq!(
        resolved.end_arrow.as_deref(),
        Some("block"),
        "end_arrow should be Some(\"block\")"
    );
}

#[test]
fn end_arrow_open_resolved() {
    let mut style = StyleMap::new();
    style.insert("endArrow", StyleValue::from("open"));

    let resolved = resolve(style);

    assert_eq!(
        resolved.end_arrow.as_deref(),
        Some("open"),
        "end_arrow should be Some(\"open\")"
    );
}

#[test]
fn no_end_arrow_yields_none() {
    let style = StyleMap::new();

    let resolved = resolve(style);

    assert!(
        resolved.end_arrow.is_none(),
        "end_arrow should be None when not specified"
    );
}

#[test]
fn end_arrow_with_other_style_keys() {
    // endArrow should be extracted even when other style keys exist
    let mut style = StyleMap::new();
    style.insert("fillColor", StyleValue::from("#dae8fc"));
    style.insert("strokeColor", StyleValue::from("#000000"));
    style.insert("endArrow", StyleValue::from("classic"));
    style.insert("strokeWidth", StyleValue::from("2"));

    let resolved = resolve(style);

    assert_eq!(
        resolved.end_arrow.as_deref(),
        Some("classic"),
        "end_arrow should be extracted correctly"
    );
    // Other style keys should be preserved in remaining
    assert_eq!(
        resolved.fill_color.as_deref(),
        Some("#dae8fc"),
        "fill_color should be extracted"
    );
    assert_eq!(
        resolved.stroke_color.as_deref(),
        Some("#000000"),
        "stroke_color should be extracted"
    );
}

// ─── startArrow extraction ─────────────────────────────────────────────────────

#[test]
fn start_arrow_block_resolved() {
    let mut style = StyleMap::new();
    style.insert("startArrow", StyleValue::from("block"));

    let resolved = resolve(style);

    assert_eq!(
        resolved.start_arrow.as_deref(),
        Some("block"),
        "start_arrow should be Some(\"block\")"
    );
}

#[test]
fn start_arrow_classic_resolved() {
    let mut style = StyleMap::new();
    style.insert("startArrow", StyleValue::from("classic"));

    let resolved = resolve(style);

    assert_eq!(
        resolved.start_arrow.as_deref(),
        Some("classic"),
        "start_arrow should be Some(\"classic\")"
    );
}

#[test]
fn start_arrow_none_resolved() {
    let mut style = StyleMap::new();
    style.insert("startArrow", StyleValue::from("none"));

    let resolved = resolve(style);

    assert_eq!(
        resolved.start_arrow.as_deref(),
        Some("none"),
        "start_arrow should be Some(\"none\")"
    );
}

#[test]
fn start_arrow_open_resolved() {
    let mut style = StyleMap::new();
    style.insert("startArrow", StyleValue::from("open"));

    let resolved = resolve(style);

    assert_eq!(
        resolved.start_arrow.as_deref(),
        Some("open"),
        "start_arrow should be Some(\"open\")"
    );
}

#[test]
fn no_start_arrow_yields_none() {
    let style = StyleMap::new();

    let resolved = resolve(style);

    assert!(
        resolved.start_arrow.is_none(),
        "start_arrow should be None when not specified"
    );
}

#[test]
fn both_arrows_together() {
    let mut style = StyleMap::new();
    style.insert("startArrow", StyleValue::from("block"));
    style.insert("endArrow", StyleValue::from("classic"));

    let resolved = resolve(style);

    assert_eq!(
        resolved.start_arrow.as_deref(),
        Some("block"),
        "start_arrow should be Some(\"block\")"
    );
    assert_eq!(
        resolved.end_arrow.as_deref(),
        Some("classic"),
        "end_arrow should be Some(\"classic\")"
    );
}

// ─── Arrow with edgeStyle (curved) ─────────────────────────────────────────────

#[test]
fn arrow_with_curved_edge_style() {
    let mut style = StyleMap::new();
    style.insert("endArrow", StyleValue::from("classic"));
    style.insert("startArrow", StyleValue::from("none"));
    style.insert("edgeStyle", StyleValue::from("curvedEdgeStyle"));

    let resolved = resolve(style);

    assert_eq!(
        resolved.end_arrow.as_deref(),
        Some("classic"),
        "end_arrow should be preserved"
    );
    assert_eq!(
        resolved.start_arrow.as_deref(),
        Some("none"),
        "start_arrow should be preserved"
    );
    assert_eq!(
        resolved.curved,
        Some(true),
        "curved should be true when edgeStyle=curvedEdgeStyle"
    );
}

#[test]
fn arrow_with_straight_edge_style() {
    let mut style = StyleMap::new();
    style.insert("endArrow", StyleValue::from("block"));
    style.insert("edgeStyle", StyleValue::from("straightEdgeStyle"));

    let resolved = resolve(style);

    assert_eq!(
        resolved.end_arrow.as_deref(),
        Some("block"),
        "end_arrow should be preserved"
    );
    assert_eq!(
        resolved.curved,
        Some(false),
        "curved should be false for non-curvedEdgeStyle"
    );
}

// ─── Case sensitivity ──────────────────────────────────────────────────────────

#[test]
fn arrow_keys_are_case_sensitive() {
    // Verify that style keys are matched case-sensitively
    // (draw.io uses camelCase like "endArrow", not "EndArrow")
    let mut style = StyleMap::new();
    style.insert("endArrow", StyleValue::from("classic"));

    let resolved = resolve(style);

    assert!(
        resolved.end_arrow.is_some(),
        "endArrow should be found (camelCase)"
    );

    // What about different case? It stays in remaining
    let mut style2 = StyleMap::new();
    style2.insert("EndArrow", StyleValue::from("classic"));

    let resolved2 = resolve(style2);

    assert!(
        resolved2.remaining.get("EndArrow").is_some(),
        "EndArrow (wrong case) should not be extracted"
    );
    assert!(
        resolved2.remaining.get("EndArrow").is_some(),
        "wrong-case EndArrow should remain in remaining"
    );
}

// ─── Empty and whitespace values ───────────────────────────────────────────────

#[test]
fn end_arrow_empty_string() {
    let mut style = StyleMap::new();
    style.insert("endArrow", StyleValue::from(""));

    let resolved = resolve(style);

    // Empty string is still a value - it gets extracted
    assert_eq!(
        resolved.end_arrow.as_deref(),
        Some(""),
        "end_arrow with empty string should be Some(\"\")"
    );
}

#[test]
fn end_arrow_whitespace_string() {
    let mut style = StyleMap::new();
    style.insert("endArrow", StyleValue::from("   "));

    let resolved = resolve(style);

    // Whitespace is preserved as-is
    assert_eq!(
        resolved.end_arrow.as_deref(),
        Some("   "),
        "end_arrow with whitespace should preserve it"
    );
}
