//! XML text and attribute escaping utilities.

#![allow(dead_code)]

/// Escapes a string for use in XML text content.
///
/// Replaces `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`.
/// The `&` replacement is done first to avoid double-escaping.
pub(crate) fn escape_text(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => result.push_str("&amp;"),
            '<' => result.push_str("&lt;"),
            '>' => result.push_str("&gt;"),
            _ => result.push(c),
        }
    }
    result
}

/// Escapes a string for use in an XML attribute value.
///
/// Extends [`escape_text`] with `"` → `&quot;`.
pub(crate) fn escape_attr(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => result.push_str("&amp;"),
            '<' => result.push_str("&lt;"),
            '>' => result.push_str("&gt;"),
            '"' => result.push_str("&quot;"),
            _ => result.push(c),
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_text_empty() {
        assert_eq!(escape_text(""), "");
    }

    #[test]
    fn escape_text_clean() {
        assert_eq!(escape_text("hello"), "hello");
    }

    #[test]
    fn escape_text_operators() {
        assert_eq!(
            escape_text("if x < 5 && y > 3"),
            "if x &lt; 5 &amp;&amp; y &gt; 3"
        );
    }

    #[test]
    fn escape_text_entity_itself() {
        assert_eq!(escape_text("&amp;"), "&amp;amp;");
    }

    #[test]
    fn escape_text_angle_brackets() {
        assert_eq!(escape_text("<>"), "&lt;&gt;");
    }

    #[test]
    fn escape_attr_quote() {
        assert_eq!(escape_attr("a\"b"), "a&quot;b");
    }

    #[test]
    fn escape_attr_all_special() {
        assert_eq!(escape_attr("<>\"&"), "&lt;&gt;&quot;&amp;");
    }

    #[test]
    fn escape_text_utf8_preserved() {
        assert_eq!(escape_text("ñ<>"), "ñ&lt;&gt;");
    }
}
