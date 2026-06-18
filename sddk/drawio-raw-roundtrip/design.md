# Kernel Design: drawio-raw-roundtrip

## Context Reuse Check

| Input | Status | Notes |
|-------|--------|-------|
| Knowledge coverage | present | ADRs 0024/0025/0026/0027 + explore findings |
| Exploration | present | RawDrawioDocument/Cell well-shaped; 6 stub methods |
| Proposal/spec alignment | ok | spec covers 3 capabilities, 8 reqs, 12 scenarios |
| Code verification | ok | parser.rs stub, writer.rs stub, roundtrip.rs stub, raw.rs reviewed |
| Context quality | C2 | sufficient for direct design |
| Problem taxonomy | present | parse/write symmetry, preserve-unknown |
| Domain language | present | decisions from grill-with-docs applied |
| Recommended effort | deepen | focused technical decisions needed |

## Technical Approach

### parse_drawio implementation

Use `quick-xml` streaming reader (`quick-xml::Reader`) over the input string. Traverse events (`Event` enum) and build `RawDrawioDocument` manually — no deserialization dependency on `serde_xml`.

**Event flow:**
```
Bytes → Reader → Event::EStart("mxfile") → descend
  → Event::EStart("diagram") → collect cells
    → Event::EStart("mxCell") → parse attrs (id, value, style, vertex, edge, parent, source, target)
      → remaining attrs → RawDrawioCell.extra
  → Event::EEnd → cell complete
  → Event::EEnd("diagram") → diagram complete
  → Event::EEnd("mxfile") → done
```

**Strip logic**: when `id == "0"` or `id == "1"`, skip storing the cell but continue parsing (don't error).

**Diagnostics accumulation**: `parse_drawio` takes `&mut Vec<Diagnostic>` as an optional second parameter. Callers can pass `&mut Vec::new()` to collect without seeing them unless they inspect the vector. Critical errors (malformed XML, missing structure) still return `Err(FormatError)` immediately.

### write_drawio implementation

Use `quick-xml` writer (`quick-xml::Writer`) with a `Vec<u8>` target. Manually emit the full document structure:

```
<mxfile>
  <diagram name="...">
    <mxGraphModel>
      <root>
        <mxGeometry width="827" height="1169" as="graph"/>
        {for each cell}
        <mxCell id="{cell.id}" value="..." style="..." vertex="{if cell.vertex {1} else {0}}"...>
          <mxGeometry .../>
        </mxCell>
        {endfor}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

**Page size**: hardcoded as `width="827" height="1169"` (A4 portrait in draw.io point units). Enclosed in `<mxGeometry as="graph"/>` inside `<root>`.

**No id=0/1**: writer iterates `RawDrawioDocument` as-is; caller is responsible for not passing cells with those ids.

### Shim functions

```rust
// diagram-format-drawio/src/lib.rs
pub fn parse_drawio(xml: &str) -> Result<RawDrawioDocument, FormatError> {
    let mut diagnostics = Vec::new();
    parse_drawio_with_diagnostics(xml, &mut diagnostics)
}

pub fn parse_drawio_with_diagnostics(
    xml: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Result<RawDrawioDocument, FormatError> { ... }

pub fn write_drawio(doc: &RawDrawioDocument) -> Result<String, FormatError> { ... }
```

## Knowledge Impact

- Durable artifacts reused: proposal, spec, raw.rs, parser.rs, writer.rs
- Artifacts that may become stale: ModelStore redesign (Phase 2 precondition — not this change)
- Memory-only learnings consulted: none — all in proposal/spec

## Applied Lenses

| Lens | Delegation | Status | Why Applied | Design Impact |
|------|------------|--------|-------------|---------------|
| base-discipline | kernel | applied | always active | quick-xml streaming, diagnostics channel |
| entropy-sdd | kernel | skipped | low-risk, focused impl | N/A |
| cognicode-sdd | kernel | skipped | no refactoring | N/A |

## Invariants And Constraints

| Invariant / Constraint | Enforcement Point | Verification |
|------------------------|-------------------|--------------|
| `diagram-format-drawio` dep-free | Cargo.toml review | `cargo tree -p diagram-format-drawio` |
| XML round-trippable | write_drawio test + roundtrip_simple_rect | cargo test |
| No id=0/1 in output | write_drawio impl + scenario | unit test |
| preserve-unknown | raw.rs `extra` field + write path | roundtrip test |

## Architecture Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|-------------------------|-----------|
| Streaming parser | quick-xml Reader | serde_xml, custom lexer | Already a dep; streaming avoids full DOM; aligns with preserve-unknown |
| Diagnostics channel | `&mut Vec<Diagnostic>` param | single-error return, error accumulation | Non-breaking; callers opt-in; no FormatError restructure |
| Page size | 827×1169 (A4 portrait) | A4 landscape, Letter, configurable | draw.io default; matches draw.io editor canvas |
| Compression support | de-scoped, returns `Err(Deflate)` | gzip detection + fallback | Not in Phase 1 scope; Error variant already exists |
| Shim over instance API | free functions | DrawioParser instance | Simpler for testkit callers; matches AGENTS.md §11.2 |

## Data Flow

```
Input XML (str)
    │
    ▼
parse_drawio()
    │ quick-xml Reader streaming
    ▼
RawDrawioDocument
    │ (cells with id≠0/1, extra preserved)
    ▼
write_drawio()
    │ quick-xml Writer
    ▼
Output XML (String)
    │
    ▼
parse_drawio() again  ← round-trip verification
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `crates/diagram-format-drawio/src/lib.rs` | modify | add public shim functions |
| `crates/diagram-format-drawio/src/parser.rs` | modify | implement real parse with quick-xml |
| `crates/diagram-format-drawio/src/writer.rs` | modify | implement real write with quick-xml |
| `crates/diagram-format-drawio/src/error.rs` | modify | add `Diagnostic` type + `FormatError` variant |
| `crates/diagram-compat-testkit/src/lib.rs` | modify | export roundtrip test module |
| `crates/diagram-compat-testkit/src/roundtrip.rs` | modify | real test calling parse_drawio/write_drawio |
| `crates/diagram-compat-testkit/fixtures/simple-rect.drawio` | add | minimal rectangle fixture |

## Interfaces / Contracts

```rust
// Public API — diagram-format-drawio
pub fn parse_drawio(xml: &str) -> Result<RawDrawioDocument, FormatError>;
pub fn write_drawio(doc: &RawDrawioDocument) -> Result<String, FormatError>;

// Internal diagnostic collection
pub fn parse_drawio_with_diagnostics(
    xml: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Result<RawDrawioDocument, FormatError>;

// Diagnostic type (new)
pub struct Diagnostic {
    pub location: String,   // e.g. "mxfile/diagram[0]/mxCell[2]"
    pub message: String,    // e.g. "unsupported element: mxPoint"
}
```

## Entropy Constraints

| Interface/Module | Risk | Constraint |
|-----------------|------|------------|
| parser.rs | low | quick-xml Event-driven; no regex |
| writer.rs | low | deterministic XML order |
| error.rs | low | additive only (new variant + Diagnostic struct) |

## Testing Strategy

| Layer | What To Test | Approach |
|-------|--------------|----------|
| Unit | parse_drawio scenarios | table-driven tests in parser.rs |
| Unit | write_drawio scenarios | table-driven tests in writer.rs |
| Integration | roundtrip_simple_rect | testkit test with fixture |
| Round-trip | cell count preservation | roundtrip.rs harness |

## Migration / Rollout

No migration required — bootstrap workspace with no prior behavior.

## Open Questions

- **none** — all 3 spec open questions resolved in this design:
  1. Diagnostics channel: `&mut Vec<Diagnostic>` optional param
  2. Page dimensions: 827×1169 (A4 portrait)
  3. Compression: de-scoped, `Err(Deflate(...))` for Phase 1
