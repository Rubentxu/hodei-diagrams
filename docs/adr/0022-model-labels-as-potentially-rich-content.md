# Model Labels as Potentially Rich Content

The initial core model will treat labels as potentially rich content rather than as a permanently plain string, even if v1.0 only supports a narrower subset of that capability. The decision is to keep the Rust-native model open to line breaks, formatted content, HTML-like label variants, and future visual metadata without forcing an early structural rewrite when `.drawio` compatibility exposes richer label semantics.
