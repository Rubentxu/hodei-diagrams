# Kernel Tasks: drawio-raw-roundtrip

## Router Context Used

- Knowledge Coverage: sufficient (proposal + spec + design all present)
- Context Quality: C2
- Taxonomy: parse/write symmetry, preserve-unknown, quick-xml streaming
- Invariants: ADR-0014 dep-free, preserve-unknown, no id=0/1
- Recommended Effort: deepen — focused impl, low risk

## Review Budget Forecast

- Estimated changed lines: ~300-400
- 400-line budget risk: Low
- Chained PRs recommended: No
- Decision needed before apply: No — all decisions resolved in design

## Knowledge Traceability

- Work item source: sddk/drawio-raw-roundtrip/spec.md (3 capabilities, 8 reqs, 12 scenarios)
- Ownership source: single-author
- Open knowledge gaps: None

## Tasks

### 1. error.rs — Add Diagnostic type

- [ ] 1.1 Add `Diagnostic` struct with `location: String` and `message: String` fields to `diagram-format-drawio/src/error.rs`
- [ ] 1.2 Verify `cargo check -p diagram-format-drawio` passes

### 2. lib.rs — Add public shim functions

- [ ] 2.1 Add `parse_drawio_with_diagnostics(xml: &str, diagnostics: &mut Vec<Diagnostic>) -> Result<RawDrawioDocument, FormatError>` to `diagram-format-drawio/src/lib.rs`
- [ ] 2.2 Add `parse_drawio(xml: &str) -> Result<RawDrawioDocument, FormatError>` that calls 2.1 with empty Vec
- [ ] 2.3 Add `write_drawio(doc: &RawDrawioDocument) -> Result<String, FormatError>` to `diagram-format-drawio/src/lib.rs`
- [ ] 2.4 Verify `cargo check -p diagram-format-drawio` passes

### 3. parser.rs — Implement real parse

- [ ] 3.1 Add `use quick_xml::Reader` and `use quick_xml::events::Event` imports
- [ ] 3.2 Replace `parse_str` stub body with streaming parser: iterate Events, build RawDrawioDocument
- [ ] 3.3 Strip cells where `id == "0"` or `id == "1"` — skip storage, don't error
- [ ] 3.4 Populate `RawDrawioCell.extra` with unrecognized attributes
- [ ] 3.5 Return `Err(FormatError::MalformedXml)` on XML parse error
- [ ] 3.6 Return `Err(FormatError::InvalidStructure)` when `mxGraphModel` is missing
- [ ] 3.7 Verify `cargo check -p diagram-format-drawio` passes
- [ ] 3.8 Run existing tests (if any) to ensure no regression

### 4. writer.rs — Implement real write

- [ ] 4.1 Add `use quick_xml::Writer` and `use quick_xml::Writer` imports
- [ ] 4.2 Replace `write_string` stub with real serialization
- [ ] 4.3 Emit `<mxfile><diagram><mxGraphModel><root>` wrapper
- [ ] 4.4 Emit `<mxGeometry width="827" height="1169" as="graph"/>` as fixed page element
- [ ] 4.5 For each cell: emit `<mxCell>` with all explicit fields + extra attrs from `RawDrawioCell.extra`
- [ ] 4.6 Never emit id=0 or id=1 (writer operates on clean model)
- [ ] 4.7 Return `Err(FormatError::InvalidStructure)` if `RawDrawioDocument` has no diagrams
- [ ] 4.8 Verify `cargo check -p diagram-format-drawio` passes

### 5. simple-rect.drawio fixture

- [ ] 5.1 Create `crates/diagram-compat-testkit/fixtures/simple-rect.drawio`
- [ ] 5.2 File must contain: `<mxfile><diagram><mxGraphModel><root>` with exactly 1 vertex cell (id="2", vertex="1") and NO id=0/id=1 cells
- [ ] 5.3 Verify the fixture parses without error: `parse_drawio(include_str!("..."))` returns Ok

### 6. roundtrip.rs — Real round-trip test

- [ ] 6.1 Update `crates/diagram-compat-testkit/src/roundtrip.rs` to use `parse_drawio` and `write_drawio` from `diagram_format_drawio`
- [ ] 6.2 Add test `roundtrip_simple_rect`: parse fixture → write → parse again → assert cell count preserved
- [ ] 6.3 Run `cargo nextest run --workspace` — all tests must pass

### 7. Workspace verification

- [ ] 7.1 `cargo check --workspace` — zero errors
- [ ] 7.2 `cargo clippy --workspace --all-targets -- -D warnings` — zero warnings
- [ ] 7.3 `cargo nextest run --workspace` — at least 1 test passing
- [ ] 7.4 `cargo fmt --all` — formatted

## Verification

```bash
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo nextest run --workspace
cargo fmt --all
```

## Rollback Notes

- Revert parser.rs / writer.rs to stubs (Err / "" ) — workspace still compiles
- Delete simple-rect.drawio fixture
- Revert lib.rs to remove shim exports
