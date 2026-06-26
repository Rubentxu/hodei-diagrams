//! Structural invariants for `Label`.
//!
//! MATH-010 / spec scenario: the engine models labels as a single owned
//! `String` field (no `Label::Math` variant — math-ness is a page-level
//! flag, not a structural property of the label). These tests lock the
//! invariants so a future refactor that, e.g., introduces a `Math`
//! variant or wraps the text in a richer content enum must consciously
//! update this file rather than silently drift.

#[test]
fn label_text_preserves_owned_string_verbatim() {
    let label = diagram_core::Label::new("foo");
    assert_eq!(label.text, "foo");
    assert_eq!(label.as_str(), "foo");
}

#[test]
fn label_text_preserves_special_chars_verbatim() {
    // MATH-bearing expressions include LaTeX syntax with backslashes and
    // braces; the label must not normalize, escape, or strip them.
    let raw = r"$\int_0^1 x\,dx$";
    let label = diagram_core::Label::new(raw);
    assert_eq!(label.text, raw);
    assert_eq!(label.as_str(), raw);
}

#[test]
fn label_default_is_empty_string() {
    let label = diagram_core::Label::default();
    assert_eq!(label.text, "");
    assert!(label.is_empty());
    assert_eq!(label.as_str(), "");
}

#[test]
fn label_from_str_and_string_match() {
    let from_str: diagram_core::Label = "bar".into();
    let from_string: diagram_core::Label = String::from("bar").into();
    assert_eq!(from_str, from_string);
    assert_eq!(from_str.text, "bar");
}