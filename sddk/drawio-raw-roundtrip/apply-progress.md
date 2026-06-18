# Apply Progress: drawio-raw-roundtrip

## Status: COMPLETED

## Tasks Completed

- [x] 1.1 error.rs: Added `Diagnostic` struct with `location` and `message` fields
- [x] 1.2 `cargo check -p diagram-format-drawio` passed
- [x] 2.1 Added `parse_drawio_with_diagnostics` to lib.rs
- [x] 2.2 Added `parse_drawio` shim to lib.rs
- [x] 2.3 Added `write_drawio` shim to lib.rs
- [x] 2.4 `cargo check -p diagram-format-drawio` passed
- [x] 3.1 Added quick-xml Reader imports
- [x] 3.2 Implemented streaming parser with event loop
- [x] 3.3 Strip id=0/id=1 cells
- [x] 3.4 Populate RawDrawioCell.extra with unrecognized attrs
- [x] 3.5 Return FormatError::MalformedXml on parse error
- [x] 3.6 Return FormatError::InvalidStructure when mxGraphModel missing
- [x] 3.7 `cargo check -p diagram-format-drawio` passed
- [x] 4.1 Added quick-xml Writer imports
- [x] 4.2 Implemented real write_string serialization
- [x] 4.3 Emit mxfile/diagram/mxGraphModel/root wrapper
- [x] 4.4 Emit hardcoded A4 page size (827×1169) in mxGeometry
- [x] 4.5 Emit mxCell with all explicit fields + extra attrs
- [x] 4.6 Writer operates on clean model (no id=0/1 to worry about)
- [x] 4.7 Return InvalidStructure if no diagrams
- [x] 4.8 `cargo check -p diagram-format-drawio` passed
- [x] 5.1 Created fixtures/ directory
- [x] 5.2 Created simple-rect.drawio with one vertex cell (id=2)
- [x] 5.3 Fixture parses correctly
- [x] 6.1 Updated roundtrip.rs to use parse_drawio/write_drawio
- [x] 6.2 Added roundtrip_simple_rect test
- [x] 6.3 `cargo nextest run --workspace` — 3 tests passing
- [x] 7.1 cargo check --workspace — zero errors
- [x] 7.2 cargo clippy --workspace --all-targets -- -D warnings — zero warnings
- [x] 7.3 cargo test --workspace — 3 tests passing
- [x] 7.4 cargo fmt --all — formatted

## Files Changed

- `crates/diagram-format-drawio/src/error.rs` — added Diagnostic struct, From<std::io::Error>
- `crates/diagram-format-drawio/src/lib.rs` — added parse_drawio, write_drawio, parse_drawio_with_diagnostics
- `crates/diagram-format-drawio/src/parser.rs` — implemented real quick-xml streaming parser
- `crates/diagram-format-drawio/src/writer.rs` — implemented real quick-xml writer
- `crates/diagram-compat-testkit/src/roundtrip.rs` — real round-trip test + 2 error-path tests
- `crates/diagram-compat-testkit/fixtures/simple-rect.drawio` — new fixture

## Verification Run

```
cargo check --workspace  ✅
cargo clippy --workspace --all-targets -- -D warnings  ✅
cargo test --workspace  ✅ 3 tests passing
cargo fmt --all  ✅
```

## Issues Found & Resolved

1. `Attributes` private in quick-xml 0.40 — used iterator API directly
2. `Cow<str>` vs `String` in extra BTreeMap — added `.to_string()`
3. `FormatError` didn't implement `From<std::io::Error>` — added impl
4. Event enum exhaustive — added missing event arms
5. Eof handler check before End(mxfile) break — moved check to End(mxfile) handler

## Notes

- Parser validates mxGraphModel presence via `saw_mxgraph_model` flag checked on End(mxfile)
- Writer uses io::Result internally with FormatError conversion via From impl
- All 3 tests pass: roundtrip_simple_rect, parse_drawio_rejects_empty_document, parse_drawio_rejects_missing_mxgraphmodel
