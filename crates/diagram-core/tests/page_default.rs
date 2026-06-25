//! Regression test: Page.math_enabled defaults to false when absent.

#[test]
fn math_003_default_math_false_when_absent() {
    let page = diagram_core::Page::default();
    assert!(
        !page.math_enabled,
        "Page::default() should have math_enabled=false (MATH-003)"
    );
}
