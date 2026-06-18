# Kernel Exploration: domain-mapping-v1

> Topic: map `RawDrawioDocument` → `DiagramModel` (Vertex / Edge / Group payload
> types + working `DrawioMapping` + `ModelStore` redesign).

## Current State

### What's already built (Phase 1 — `drawio-raw-roundtrip`, completed 2026-06-18)

| Area | Evidence | Status |
|------|----------|--------|
| `RawDrawioDocument` / `Diagram` / `Cell` | `crates/diagram-format-drawio/src/raw.rs` | stable |
| `parse_drawio` / `write_drawio` shims | `crates/diagram-format-drawio/src/lib.rs:31-50` | stable, public API |
| `DrawioParser` (streaming, quick-xml) | `crates/diagram-format-drawio/src/parser.rs` | stable |
| `DrawioWriter` (hardcoded A4 827×1169 page size) | `crates/diagram-format-drawio/src/writer.rs:69-74` | stable |
| Diagnostic channel `&mut Vec<Diagnostic>` | `crates/diagram-format-drawio/src/parser.rs:29-44` | stable |
| `id=0/1` strip in parser, never emitted by writer | `parser.rs:95-97`, `writer.rs:89-132` | stable, verified |
| `simple-rect.drawio` fixture + 3 passing tests | `crates/diagram-compat-testkit/src/roundtrip.rs:99-141` | stable |
| `DrawioMapping` (stub) | `crates/diagram-format-drawio/src/mapping.rs:19-36` | **STUB — returns `Ok(DiagramModel::new())`** |

### What's in `diagram-core` today (bootstrap cut)

| Type | File | Shape | Notes |
|------|------|-------|-------|
| `DiagramModel` | `crates/diagram-core/src/model.rs:18-24` | `{ store: ModelStore, styles: StyleMap }` | top-level wrapper |
| `ModelStore` | `crates/diagram-core/src/store.rs:26-33` | `SlotMap<PageId, Page>` + 4 placeholder slotmaps (`<VertexId, ()>`, `<EdgeId, ()>`, `<GroupId, ()>`, `<StyleId, ()>`) | **payload is `()` — no `Vertex`/`Edge`/`Group` types defined yet** |
| `Page` | `crates/diagram-core/src/page.rs:13-21` | `{ id: PageId, name: Option<Label>, size: Size }` | exists with `Size` |
| `Label` | `crates/diagram-core/src/label.rs:18-22` | `{ text: String }`, `#[non_exhaustive]` | rich-content-ready |
| `Geometry` (`Point`, `Size`, `Rect`) | `crates/diagram-core/src/geometry.rs` | plain structs | exists, no `mxGeometry` capture |
| `StyleMap` / `StyleValue` | `crates/diagram-core/src/style.rs` | `BTreeMap<String, StyleValue>` (String→String) | flexible-map ADR-0021 |
| `CoreError` | `crates/diagram-core/src/error.rs` | typed with NotFound variants per ID | ready |
| Stable IDs | `crates/diagram-core/src/id.rs:11-22` | slotmap `VertexId`, `EdgeId`, `GroupId`, `PageId`, `StyleId` + `Display` | engine-owned ADR-0023 |

### What's NOT in `diagram-core` yet (Phase 2 must add)

- **`Vertex` struct** — does not exist
- **`Edge` struct** — does not exist
- **`Group` struct** — does not exist
- **Cell-level payload fields**: per-cell geometry ref, label, style ref, parent (for Group), source/target (for Edge)
- **External ID mapping** (e.g., `BTreeMap<String, VertexId>` from `.drawio` `id="2"` → engine `VertexId`)
- **Edge endpoint resolution** (`.drawio` `source="A"` / `target="B"` strings → `VertexId`)
- **Style attribution** (per-cell `StyleId` ref into the shared `StyleMap`, or inline `StyleMap`?)
- **Group membership** (how `parent="g1"` resolves to `GroupId`)

### What `DrawioMapping` currently does

`crates/diagram-format-drawio/src/mapping.rs`:

```rust
pub fn to_domain(&self, _raw: &RawDrawioDocument) -> FormatResult<DiagramModel> {
    Ok(DiagramModel::new())  // bootstrap stub
}
```

The signature and ownership are right (stateless struct, lives in format crate per
ADR-0014, ADR-0009). What it lacks is the real mapping logic and a path back
(`to_raw`) for full round-trip via the domain model.

### Critical bug discovered during exploration (Phase 1 silent data loss)

`crates/diagram-format-drawio/src/parser.rs:103-105`:

```rust
b"mxGeometry" => {
    // Geometry is handled as part of the cell in our simple model
}
```

The `mxGeometry` element attributes (`x`, `y`, `width`, `height`, `as`) are
**not captured anywhere** in `RawDrawioCell`. The comment is misleading — they
are silently dropped. The writer then emits `<mxGeometry/>` empty inside each
vertex and a fixed 827×1169 page element.

The `simple-rect.drawio` fixture `<mxGeometry width="80" height="40" as="geometry"/>`
loses `80` and `40` on parse. This is fine for Phase 1 (cell-count round-trip)
but **must be fixed in Phase 2** for any meaningful domain mapping: Vertex
geometry is the entire reason Vertex exists.

### Phase 1 archive report's own verdict

`sddk/drawio-raw-roundtrip/archive-report.md:46-47` flags:

> Phase 2 (domain mapping) will require ModelStore redesign but is cleanly
> separated.

`verify-report.md:60`: `Test coverage | Low | 3 tests for Phase 1 scope`.

### Workspace state

- `cargo check --workspace` — clean (0 errors)
- `cargo test --workspace` — 3 tests pass (roundtrip_simple_rect + 2 error-path)
- No external ID mapping, no Vertex/Edge/Group types, no per-cell payload.

## Context Quality

- **Level**: C2 (durable artifacts present, code reviewed, previous change archived)
- **Evidence Present**:
  - All relevant ADRs (0009, 0014, 0020, 0021, 0022, 0023, 0024, 0025, 0026, 0027, 0028)
  - `drawio-raw-roundtrip` complete artifact set (proposal, spec, design, tasks, verify, archive)
  - `diagram-core` source fully read (8 modules)
  - `diagram-format-drawio` source fully read (6 modules)
  - `diagram-compat-testkit` source fully read (4 modules + fixture)
  - `simple-rect.drawio` fixture and 3 passing tests
  - `cargo check --workspace` green
- **Missing Context**:
  - No corpus data yet — deferred to ROADMAP post-domain-mapping
  - No upstream `mxGraph` reference (correctly deferred per ADR-0029)
  - No ADR for "Vertex/Edge/Group payload shape" (lives in this explore's domain-language section)
- **Recommended Effort**: **deepen** — multi-file redesign across 2 crates (core + format); must align with existing ADRs without contradicting them; silent `mxGeometry` loss is a known Phase 1 trade-off that becomes a Phase 2 hard requirement.

## Knowledge Coverage

| Class | Status | Evidence | Gap Impact |
|------|--------|----------|------------|
| Roadmap/Backlog | present | `docs/ROADMAP.md:24` "Domain mapping bootstrap (Vertex, Edge, Group payload types + DrawioMapping)" listed as next milestone | none — clearly in scope |
| Work Items | present | `drawio-raw-roundtrip/archive-report.md:46-47` "Next Recommended: **New change: domain-mapping-v1**" + 2026-06-18 ROADMAP note | none — direct handoff |
| Architecture/ADRs | present | ADR-0009 (Rust-native + mapping), ADR-0014 (format-dep-only), ADR-0020 (core has pages/vertices/edges/groups/geometry/styles/labels), ADR-0021 (styles flexible map), ADR-0022 (labels rich content), ADR-0023 (engine-owned IDs + external mapping), ADR-0024 (preserve unknown), ADR-0026 (raw-first), ADR-0027 (raw in format crate), ADR-0028 (separated pieces before facade) | none — all foundational ADRs aligned with this change |
| Ownership | present | Single-author repo, AGENTS.md §5 SDDK workflow | none |
| Learnings | present | Engram: previous change `sddk/drawio-raw-roundtrip/proposal` exists. Inline: quick-xml 0.40 Eof-before-End(mxfile), Attributes iterator returns `Result`, saw_mxgraph_model flag needed, parser strips id=0/1 | none — easy to extend |

## Problem Taxonomy

| Axis | Applies | Evidence |
|------|---------|----------|
| Domain modeling | **Yes** | Core has slotmap keys but no `Vertex`/`Edge`/`Group` payload structs. Need to define them. |
| Boundary/seam | **Yes** | `DrawioMapping` is the exact format→core boundary. ADR-0014 locks the dep direction. |
| Coupling/connascence | **Yes** | `RawDrawioCell` carries `parent`/`source`/`target` as strings. Mapping must resolve them. Cross-cell resolution is connascence-of-value across the boundary. |
| API contract | **Yes** | Public surface: `parse_drawio`, `write_drawio`, `DrawioMapping::to_domain` (and we need `to_raw` for true round-trip via domain). |
| Refactor/legacy | **No** | No legacy to refactor — Phase 1 is the only code. |
| Event/CQRS | **No** | Commands crate is out of scope (future milestone). |
| Testing | **Yes** | Need fixtures that exercise vertex + edge + group + multiple pages + style + label + parent. |
| Security/operations | **No** | Local model construction, no I/O paths beyond already-tested parse/write. |

## Domain Language And Invariants

### Domain Language (resolved from ADR + CONTEXT.md)

- **`Vertex`**: a node-shape cell. Has `geometry` (x, y, width, height), `label`, `style_ref`, optional `parent: GroupId`.
- **`Edge`**: a connector cell. Has `label`, `style_ref`, `source: VertexId`, `target: VertexId`. Geometry is degenerate in v1 (draw.io edge geometry is a list of waypoints; v1 stores endpoints only per ADR-0029 deferral).
- **`Group`**: a container cell. Has `geometry`, `label`, `style_ref`. Children point at it via `parent: Option<GroupId>` from the child side (matching draw.io `parent` semantics).
- **`DrawioMapping`**: stateless mapper (struct shape) converting `RawDrawioDocument` ↔ `DiagramModel`. Lives in format crate per ADR-0014.
- **External ID mapping**: per ADR-0023 the format crate owns `BTreeMap<String, VertexId>` (etc.) for `.drawio` `id="..."` → engine ID. The engine never sees raw strings.
- **Engine ID**: slotmap key, engine-owned, opaque to external callers.
- **`mxGeometry`**: the draw.io geometry element carrying `x`, `y`, `width`, `height`, `as` (relative/absolute). Currently DROPPED by parser (silent loss).
- **preserve-unknown**: per ADR-0024, raw `extra` attributes must survive a parse → map → write cycle. In the domain model this means the mapping preserves them somewhere accessible — natural location is the shared `StyleMap` or a per-cell `extra` blob (TBD in design).
- **id=0/1 strip**: parser discards these; writer never emits. Mapping must not assume their presence.

### Invariants (binding)

| Invariant | Source | Verification |
|-----------|--------|--------------|
| `diagram-format-drawio` depends only on `diagram-core` | ADR-0014 | `cargo tree -p diagram-format-drawio` |
| Engine owns IDs; external IDs mapped at boundary | ADR-0023 | `VertexId` etc. never expose raw strings; `DrawioMapping` holds the bridge table |
| Styles are a flexible map | ADR-0021 | `StyleMap<String, StyleValue>` stays |
| Labels are potentially rich | ADR-0022 | `Label` stays `#[non_exhaustive]` |
| Preserve unknown data, degrade explicitly | ADR-0024 | raw `extra` survives round-trip; unknown elements emit Diagnostic |
| Raw model lives in format crate | ADR-0027 | no separate raw crate |
| Layout and routing are out of `diagram-core` | ADR-0013 | edge waypoints not in core for v1 |
| Workspace passes `cargo fmt + clippy + check` clean | AGENTS.md §2.3 | `cargo fmt && cargo clippy --workspace --all-targets -- -D warnings && cargo check --workspace` |

### Unresolved ambiguities (require grill-with-docs in proposal phase)

1. **Style attribution shape**: per-cell inline `StyleMap` clone vs shared model-level `StyleMap` + per-cell `StyleId`? ADR-0021 says flexible map; doesn't say whether it's shared or duplicated. Shared is more memory-efficient; per-cell is more local. Likely answer: shared `StyleMap` keyed by stable `StyleId`, but the current `SlotMap<StyleId, ()>` must be redesigned to carry values (probably `Arc<StyleMap>` or owned `String` style-string).
2. **External ID mapping location**: inside `DrawioMapping` (allocated per call) vs a separate `IdMap` struct held by callers? For pure function, inline is fine. For two-way `to_domain` / `to_raw` the ID map must be threaded through (so `to_raw` knows which engine ID to write back as `id="..."`).
3. **mxGeometry capture**: extend `RawDrawioCell` with `geometry: Option<RawDrawioGeometry>` (preferred — clean, no parser rework beyond extending `Event::Empty(mxGeometry)`) vs decode during mapping (uglier — re-parsing XML state). Recommendation: extend the raw model.

## Knowledge Gaps

- **No corpus coverage yet**: `simple-rect.drawio` is the only fixture. Multi-page, edges, groups, styles, labels will all be new fixtures. This is expected per ROADMAP "after domain mapping" for the corpus milestone — not a Phase 2 blocker but it constrains confidence in attribute coverage.
- **No existing ADR for "Vertex payload shape"**: this is the first concrete shape. If the proposal reveals a hard trade-off (e.g., shared style store forces a borrow vs owned `StyleMap`), it may justify a new ADR or an inline addendum to ADR-0021.
- **No two-way mapping spec yet**: Phase 1 only proves raw→raw round-trip. Phase 2 must decide whether `to_raw(&DiagramModel, &IdMap) -> RawDrawioDocument` is in scope. ROADMAP says "Round-trip completo en testkit" is a follow-up milestone, so technically out of scope for `domain-mapping-v1`, but the shape of `to_domain` should not preclude `to_raw`.

## Affected Areas

- `crates/diagram-core/src/store.rs` — replace `SlotMap<VertexId, ()>` (etc.) with typed payloads; redesign `insert_*` to take value structs.
- `crates/diagram-core/src/lib.rs` — re-export new types (`Vertex`, `Edge`, `Group`, maybe `CellGeometry`).
- `crates/diagram-core/src/model.rs` — `DiagramModel` already wraps `ModelStore`; should stay unchanged in shape.
- `crates/diagram-format-drawio/src/raw.rs` — add `RawDrawioGeometry` struct; extend `RawDrawioCell` with `geometry: Option<RawDrawioGeometry>` (resolves the silent `mxGeometry` loss).
- `crates/diagram-format-drawio/src/parser.rs` — capture `mxGeometry` attributes during `Event::Empty(mxGeometry)` or paired `Start`/`End` events inside a cell.
- `crates/diagram-format-drawio/src/mapping.rs` — implement real `to_domain`; introduce `DrawioMapping::to_domain_with_diagnostics` if needed for the diagnostic channel.
- `crates/diagram-format-drawio/src/writer.rs` — emit `mxGeometry` with captured x/y/width/height (currently always empty).
- `crates/diagram-compat-testkit/fixtures/` — new fixtures: `vertex-rect.drawio`, `edge-connect.drawio`, `group-nested.drawio`, `two-pages.drawio` (one per new domain shape).
- `crates/diagram-compat-testkit/src/roundtrip.rs` — new tests asserting mapping preserves cell counts, parent relationships, edge endpoints, geometry.
- `docs/adr/` — possibly a new ADR if style-attribution shape warrants one; otherwise piggy-back on existing ADRs.
- `CONTEXT.md` — extend with `Vertex`/`Edge`/`Group`/`DrawioMapping` definitions (grill-with-docs inline).

## Options

| Option | Pros | Cons | Effort |
|--------|------|------|--------|
| **A. Add typed payloads + per-cell geometry + style ref + parent ref; extend raw model with geometry; implement `to_domain`; ID mapping inside `DrawioMapping`** | Clean separation; preserves `mxGeometry`; ADR-0023 satisfied with format-owned ID map; style shared via `StyleId`; `non_exhaustive` Label keeps door open for ADR-0022 | Touches core + format + testkit; one new fixture per cell shape | ~400-600 lines, 1 PR |
| B. Per-cell inline `StyleMap` (no shared style store) | Simple; no cross-cell dedup; easier mental model | Duplicates style strings; ADR-0021 "shared" reading violated; wasted memory | ~350-500 lines, 1 PR |
| C. Decode `mxGeometry` in mapping layer (not in raw) | Avoids raw model change | Re-parses XML-like state inside mapper; violates ADR-0026 "raw first"; ugly | ~500-700 lines, 1 PR (rejected on ADR grounds) |
| D. Skip ID mapping (use raw strings as IDs) | Trivial | Contradicts ADR-0023 directly | (rejected) |

**Recommended**: Option A.

## Entropy Envelope

- **Method**: heuristic (no CogniCode quantitative)
- **Coupling risk**: **medium** — `DrawioMapping` is the exact format/core seam; ADRs lock the direction but not the shape of cross-cell resolution (string → typed ID). Connascence-of-value across the boundary is the main risk; mitigated by the external-ID map being owned by the format crate.
- **Connascence notes**:
  - **Connascence of value** (raw `parent`/`source`/`target` strings must resolve to typed IDs): contained inside `DrawioMapping::to_domain`; not leaked upward.
  - **Connascence of algorithm** (style attribution — per-cell or shared): decision pending grill-with-docs. Shared `StyleId` is preferred to keep styles DRY and let `StyleMap` act as the engine's style registry.
  - **OCP risk**: `ModelStore` slotmap signature change is unavoidable (it currently exposes `pub fn insert_vertex(&mut self) -> VertexId`). Phase 2 changes the signature to `insert_vertex(Vertex) -> VertexId`. This is the bootstrap cut paying its deferred debt.
- **New dependencies**: none. All needed crates (`slotmap`, `serde`, `thiserror`) already in workspace.

## Recommendation

Implement **Option A** with this shape:

1. **`diagram-core` adds**:
   - `Vertex { geometry: Option<CellGeometry>, label: Option<Label>, style_id: Option<StyleId>, parent: Option<GroupId> }`
   - `Edge { label: Option<Label>, style_id: Option<StyleId>, source: VertexId, target: VertexId }`
   - `Group { geometry: Option<CellGeometry>, label: Option<Label>, style_id: Option<StyleId> }`
   - `CellGeometry { x: f64, y: f64, width: f64, height: f64, relative: bool }` (the `as="geometry"` flag)
   - `ModelStore` redesign: typed payloads; `insert_vertex(Vertex) -> VertexId`, etc.
   - Style store holds values: `SlotMap<StyleId, StyleMap>` (or equivalent so styles can be referenced by ID).

2. **`diagram-format-drawio` extends**:
   - `RawDrawioGeometry { x: f64, y: f64, width: f64, height: f64, as: String }` in `raw.rs`.
   - `RawDrawioCell` gains `geometry: Option<RawDrawioGeometry>`.
   - Parser captures `mxGeometry` attributes (both `Event::Empty` and `Start`/`End` inside a `mxCell`).
   - Writer emits `<mxGeometry x="..." y="..." width="..." height="..." as="geometry"/>` per cell.
   - `DrawioMapping::to_domain` becomes real:
     - Allocates one `Page` per `RawDrawioDiagram` (with name from `diagram.name`).
     - Walks cells in order; assigns engine IDs deterministically (insertion order).
     - Builds `IdMap: BTreeMap<String, (VertexId|EdgeId|GroupId)>` for two-way lookup.
     - Resolves `parent`/`source`/`target` against the IdMap; emits Diagnostic on dangling refs.
     - Maps style string into shared `StyleMap`, returning `StyleId` per cell.
     - Maps `mxGeometry` into `CellGeometry`.
   - Decide `to_raw` is **out of scope** for this change (follow-up milestone per ROADMAP "Round-trip completo en testkit").

3. **`diagram-compat-testkit` adds**:
   - New fixtures: `vertex-rect.drawio` (one vertex with geometry), `edge-connect.drawio` (one edge between two vertices), `group-nested.drawio` (group containing a vertex), `two-pages.drawio` (multi-diagram).
   - New tests in `roundtrip.rs`: cell count + geometry + label + style key preserved through parse → map → re-serialize-as-raw → re-parse.

4. **Decisions to lock at grill-with-docs** (max 3):
   - Style attribution: shared `StyleId` (recommended) vs inline clone
   - ID mapping location: inside `DrawioMapping` (recommended) vs separate `IdMap` type
   - `mxGeometry` capture: extend `RawDrawioCell` (recommended) vs defer to follow-up

## Ready For Proposal

**Yes** — context quality C2, all foundational ADRs aligned, previous change cleanly archived, scope is bounded (one well-defined layer: format→core mapping with ModelStore redesign), open questions are small (3 grill-with-docs decisions, not blockers).

Ready for `sddk-propose domain-mapping-v1`.
