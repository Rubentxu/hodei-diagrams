# Kernel Specs: drawio-raw-roundtrip

## Router Context Used
- Knowledge Coverage: sufficient (ADR-0024/0025/0026/0027/0029, sddk-explore findings)
- Context Quality: C2
- Taxonomy: parse/write symmetry, preserve-unknown, domain-model-gaps
- Domain Language: raw round-trip, simple-rect fixture, page size (hardcoded), id=0/1 strip
- Recommended Effort: deepen

## Knowledge Provenance
- Scope source: sddk/drawio-raw-roundtrip/proposal.md
- Invariant source: sddk/drawio-raw-roundtrip/proposal.md (Invariants section); ADR-0014 (format crate dep); ADR-0024 (preserve unknown); ADR-0025 (diagnostics); ADR-0026 (raw model first)
- Memory-only hints excluded from spec truth: None — all decisions recorded in proposal after grill-with-docs 2026-06-18

## Capability: parse_drawio

Public shim `fn parse_drawio(xml: &str) -> Result<RawDrawioDocument, FormatError>` in `diagram-format-drawio`.

### Requirement: Parse valid .drawio XML into RawDrawioDocument
The system SHALL parse a valid `.drawio` XML string into a `RawDrawioDocument` containing one diagram per `<diagram>` element, each with its cells.

#### Scenario: Minimal rectangle document
- GIVEN XML with `<mxfile>` → `<diagram>` → `<mxGraphModel>` → `<root>` containing `<mxCell id="2" vertex="1"><mxGeometry/></mxCell>`
- WHEN `parse_drawio(xml)` is called
- THEN it returns `Ok(RawDrawioDocument)` with one diagram containing one cell where `id="2"` and `vertex=true`

#### Scenario: Multi-diagram document
- GIVEN XML with two `<diagram>` elements each containing cells
- WHEN `parse_drawio(xml)` is called
- THEN the result has two entries in `RawDrawioDocument.diagrams`, each with its own cells

### Requirement: Strip structural cells id=0 and id=1
The system SHALL exclude cells with `id="0"` or `id="1"` from the parsed result.

#### Scenario: Root and layer cells stripped
- GIVEN XML containing `<mxCell id="0"/>`, `<mxCell id="1" parent="0"/>`, and `<mxCell id="2" vertex="1"/>`
- WHEN `parse_drawio(xml)` is called
- THEN only the cell with `id="2"` appears in `RawDrawioDiagram.cells`

### Requirement: Reject malformed or structurally invalid input
The system SHALL return `Err(FormatError)` for input that is not parseable or lacks required `.drawio` structure.

#### Scenario: Malformed XML
- GIVEN a string that is not well-formed XML
- WHEN `parse_drawio(xml)` is called
- THEN it returns `Err(FormatError::MalformedXml(...))`

#### Scenario: Missing mxGraphModel
- GIVEN well-formed XML without `<mxGraphModel>` element
- WHEN `parse_drawio(xml)` is called
- THEN it returns `Err(FormatError::InvalidStructure(...))`

### Requirement: Preserve unknown attributes
The system SHALL populate `RawDrawioCell.extra: BTreeMap<String, String>` with any attributes not explicitly modeled.

#### Scenario: Custom cell attribute preserved
- GIVEN a cell with `<mxCell id="2" customAttr="foo" vertex="1"/>`
- WHEN parsed
- THEN `cell.extra` contains `("customAttr", "foo")` and `vertex=true` is set on the struct field

### Requirement: Compatibility diagnostics for unsupported elements
The system SHALL produce diagnostics when encountering well-formed `.drawio` elements not yet supported, surfacing element location and description.

#### Scenario: Unsupported element flagged
- GIVEN a `.drawio` document containing an element outside the recognized schema
- WHEN `parse_drawio(xml)` is called
- THEN a diagnostic is produced with the element's location and a message describing the gap

## Capability: write_drawio

Public shim `fn write_drawio(doc: &RawDrawioDocument) -> Result<String, FormatError>` in `diagram-format-drawio`.

### Requirement: Serialize RawDrawioDocument to valid .drawio XML
The system SHALL produce a `.drawio` XML string that is structurally valid and parseable by `parse_drawio`.

#### Scenario: Round-trip write → parse succeeds
- GIVEN a `RawDrawioDocument` with at least one diagram containing at least one content cell
- WHEN `write_drawio(doc)` is called
- THEN the output string can be parsed by `parse_drawio` and cell count is preserved

#### Scenario: Empty document produces valid output
- GIVEN a `RawDrawioDocument` with zero diagrams
- WHEN `write_drawio(doc)` is called
- THEN the output is valid XML with an empty `<mxfile>` element

### Requirement: Writer never generates id=0 or id=1
The system SHALL NOT emit cells with `id="0"` or `id="1"` in the output XML.

#### Scenario: id=0 and id=1 absent from output
- GIVEN any `RawDrawioDocument`
- WHEN `write_drawio(doc)` is called
- THEN the output XML contains no `<mxCell>` element with `id="0"` or `id="1"`

### Requirement: Hardcoded page size
The system SHALL include a hardcoded page dimensions element (A4-ish: width and height) in every written document.

#### Scenario: Page size element present
- GIVEN any `RawDrawioDocument`
- WHEN `write_drawio(doc)` is called
- THEN the output XML includes a page width and height (e.g., A4 portrait dimensions)

### Requirement: Preserve extra attributes in output
The system SHALL emit all entries from `RawDrawioCell.extra` as XML attributes on the corresponding `<mxCell>` element.

#### Scenario: Extra attribute round-trips
- GIVEN a cell with `extra` containing `("custom", "val")`
- WHEN written and then parsed
- THEN the parsed cell's `extra` still contains `("custom", "val")`

## Capability: roundtrip_simple_rect

Test in `diagram-compat-testkit` using the `simple-rect.drawio` fixture.

### Requirement: Round-trip cell count preservation
The system SHALL preserve the number of content `mxCell` elements through a parse → write → parse cycle on the fixture.

#### Scenario: simple-rect fixture round-trip
- GIVEN the contents of `fixtures/simple-rect.drawio`
- WHEN parsed with `parse_drawio`, written with `write_drawio`, and parsed again
- THEN the number of cells in `RawDrawioDiagram.cells` matches between first and second parse

## Invariants Covered
| Invariant | Coverage |
|-----------|----------|
| XML escrito debe parsearse de nuevo sin errores | write_drawio "Round-trip write → parse succeeds" scenario; roundtrip_simple_rect scenario |
| diagram-format-drawio solo depende de diagram-core (ADR-0014) | Architectural constraint — verified by `cargo tree -p diagram-format-drawio` (no scenario) |
| Stubs reemplazados, no agregados al lado | Verification note — code review; stubs removed during apply |
| preserve-unknown (ADR-0024) | parse_drawio "Custom cell attribute preserved" + write_drawio "Extra attribute round-trips" |

## Open Questions
- **Diagnostics channel**: `parse_drawio` returns `Result<T, FormatError>` — a single error. If multiple compatibility diagnostics are collected, the channel is unresolved. Options: (a) separate `&mut Vec<Diagnostic>` parameter, (b) error accumulation inside `FormatError` variant, (c) diagnostic stream. Resolve at design phase.
- **Hardcoded page dimensions exact values**: A4 portrait is 827×1169 points. Confirm this exact value or pick a different default at design phase.
- **Compressed .drawio support**: `.drawio` files may be gzip/deflate-compressed with base64 encoding. Phase 1 de-scopes this; the `FormatError::Deflate` and `FormatError::Base64` variants exist but have no behavior spec yet.
