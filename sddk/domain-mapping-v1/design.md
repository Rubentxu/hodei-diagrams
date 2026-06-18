# Kernel Design: domain-mapping-v1

## Context Reuse Check

| Input | Status | Notes |
|-------|--------|-------|
| Knowledge coverage | present | ADRs 0009/0014/0020/0021/0022/0023/0024/0026/0027; ROADMAP L24; Phase-1 archive |
| Exploration | present | `explore-report.md` fully read; silent `mxGeometry` loss confirmed at `parser.rs:103-105` |
| Proposal/spec alignment | ok | 3 open questions resolved by locked decisions (style shared, IdMap inline, raw-capture) |
| Code verification | ok | `store.rs`, `id.rs`, `style.rs`, `geometry.rs`, `raw.rs`, `mapping.rs`, `parser.rs`, `writer.rs`, `model.rs`, `page.rs`, `label.rs`, `error.rs` (both), `lib.rs` (both) reviewed |
| Context quality | C2 | durable artifacts + code review; no re-exploration needed |
| Problem taxonomy | present | domain-modeling + boundary-seam + connascence-of-value + API-contract + testing |
| Domain language | present | Vertex/Edge/Group/CellGeometry/DrawioMapping/IdMap resolved in explore |
| Recommended effort | deepen | multi-file redesign across core + format + testkit |

## Technical Approach

Two-crate additive change. Phase-1 stubs make the surface area mostly additive; the only true break is `ModelStore::insert_*` signatures (bootstrap debt repayment) and `DiagramModel.styles` removal (collapse into `ModelStore`).

**Algorithm — `DrawioMapping::to_domain`:** single function, two logical passes per diagram.
1. **Page pass**: one `Page` per `RawDrawioDiagram` (name → `Label`, A4 827×1169 default `Size`).
2. **Cell pass, forward sweep**: walk `diagram.cells` in order; for each cell allocate an engine ID via `store.insert_vertex(Vertex::placeholder())` / `insert_edge` / `insert_group` and record `id_map.insert(cell.id.clone(), CellRef::...)`. `Edge` is *not* inserted here — endpoints unknown yet.
3. **Cell pass, backward sweep**: walk cells again, resolve `parent`/`source`/`target` via `id_map`, materialize real payloads, replace placeholder slotmap entries via `store.replace_vertex(id, real_vertex)` (slotmap-supported). For edges, only insert once both endpoints resolve; otherwise push a `Diagnostic` and skip.
4. **Style attribution**: per cell with a non-empty `style` string, parse `;`/`=`-separated pairs into a `StyleMap`, `insert_style(style_map) -> StyleId`, set `cell.style_id = Some(style_id)`. No dedup in v1 (corpus too small); dedup is a follow-up.

**`mxGeometry` capture in parser:** track last-pushed cell via `current_diagram.cells.last_mut()`. When `Event::Empty(mxGeometry)` or `Event::Start(mxGeometry)` fires **and** `as` attribute ≠ `"graph"`, parse `x/y/width/height/as` into `RawDrawioGeometry` and attach. The page-level `<mxGeometry as="graph"/>` emitted by the writer *before* any cell stays safely ignored (no "last cell" exists yet).

## Knowledge Impact

- Durable artifacts reused: ADR-0020/0021/0022/0023/0024/0026/0027; explore-report; Phase-1 design (format reference).
- Artifacts that may become stale: Phase-1 archive's "ModelStore placeholder" note (corrected by this change); `store.rs` doc on external IDs (still valid).
- Memory-only learnings consulted: quick-xml `Attributes` is `Result`, `id=0/1` strip, `saw_mxgraph_model` flag (all from Engram Phase-1).

## Applied Lenses

| Lens | Delegation | Status | Why Applied | Design Impact |
|------|------------|--------|-------------|---------------|
| base-discipline | kernel | applied | always active | scoped to format→core seam; no upstream leak |
| entropy-sdd | kernel | applied | connascence-of-value on `parent/source/target` strings; `insert_*` signature break is OCP-acceptable bootstrap debt | Two-pass mapping isolates string→ID resolution inside `DrawioMapping`; dangling refs become Diagnostics, not panics |
| cognicode-sdd | — | skipped | not available | heuristic entropy only |
| chronos-sdd | — | skipped | no runtime bug | pure modeling |

## Invariants And Constraints

| Invariant / Constraint | Enforcement Point | Verification |
|------------------------|-------------------|--------------|
| `diagram-format-drawio` depends only on `diagram-core` | `Cargo.toml` | `cargo tree -p diagram-format-drawio` |
| Engine IDs never exposed as raw strings | `DrawioMapping` owns `IdMap` internally | code review; no `String` in `Vertex`/`Edge`/`Group` |
| `Label` stays `#[non_exhaustive]` | `label.rs` unchanged | grep |
| Preserve-unknown via `extra` + Diagnostic | raw model unchanged; mapping emits Diagnostic | round-trip test |
| Workspace fmt + clippy + check clean | AGENTS.md §2.3 | CI gate |
| `as="graph"` page geometry never captured as cell geometry | parser rule | fixture test |

## Architecture Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|-------------------------|-----------|
| Payload types per cell kind | `Vertex`/`Edge`/`Group` distinct structs | single `enum CellPayload` | Keeps slotmaps typed; `CellGeometry` reused by Vertex + Group; matches ADR-0020 |
| `Edge` endpoints non-optional | `source: VertexId, target: VertexId` | `Option<VertexId>` | A dangling edge has no semantic value; drop + Diagnostic is cleaner than a partial Edge |
| Style registry location | `ModelStore.styles: SlotMap<StyleId, StyleMap>`; remove `DiagramModel.styles` | keep both; per-cell inline clone | Locked decision #1; eliminates redundant field; `ModelStore` becomes single owner of all slotmaps |
| IdMap location | inline `BTreeMap<String, CellRef>` inside `to_domain` | separate returned struct | Locked decision #2; pure-function friendly; not exposed publicly (YAGNI until `to_raw`) |
| `mxGeometry` capture | extend `RawDrawioCell.geometry: Option<RawDrawioGeometry>` | decode in mapping | Locked decision #3; ADR-0026 "raw first"; parser-only XML state |
| Mapping strategy | two-pass forward/backward over cells | single pass with deferred edges; build graph first | Deterministic insertion order (ADR-0023); minimal state; slotmap `replace` keeps IDs stable |
| Dead `*Key` types in `store.rs` | remove `VertexKey/EdgeKey/GroupKey/StyleKey` | keep | Unused since Phase 1; clippy-clean |
| Edge waypoint geometry | out of scope (v1 endpoints only) | store `Vec<Point>` | ADR-0013/0029 defer to routing crate |

## Data Flow

```
RawDrawioDocument
   │
   ▼  DrawioMapping::to_domain
   │  ┌──────────────────────────────────────────┐
   │  │ Pass 1 (forward):  cells → engine IDs    │
   │  │   id_map: BTreeMap<String, CellRef>      │
   │  │   Vertex/Group placeholders inserted      │
   │  ├──────────────────────────────────────────┤
   │  │ Pass 2 (backward): resolve cross-refs    │
   │  │   parent/source/target via id_map        │
   │  │   style string → StyleMap → StyleId      │
   │  │   mxGeometry → CellGeometry              │
   │  │   dangling refs → Diagnostic, skip edge  │
   │  └──────────────────────────────────────────┘
   ▼
DiagramModel { store: ModelStore { pages, vertices, edges, groups, styles } }
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `crates/diagram-core/src/vertex.rs` | add | `Vertex` struct |
| `crates/diagram-core/src/edge.rs` | add | `Edge` struct |
| `crates/diagram-core/src/group.rs` | add | `Group` struct |
| `crates/diagram-core/src/geometry.rs` | modify | add `CellGeometry { x, y, width, height, relative }` |
| `crates/diagram-core/src/store.rs` | modify | typed payloads; remove dead `*Key`; add `insert_vertex(Vertex)`, `replace_*`, `vertex(id) -> Option<&Vertex>`; styles slotmap carries `StyleMap` |
| `crates/diagram-core/src/model.rs` | modify | remove `styles` field (absorbed into `ModelStore`) |
| `crates/diagram-core/src/lib.rs` | modify | re-export `Vertex`, `Edge`, `Group`, `CellGeometry` |
| `crates/diagram-format-drawio/src/raw.rs` | modify | add `RawDrawioGeometry`; extend `RawDrawioCell.geometry` |
| `crates/diagram-format-drawio/src/parser.rs` | modify | capture `mxGeometry` (Empty + Start) onto last cell when `as != "graph"` |
| `crates/diagram-format-drawio/src/writer.rs` | modify | emit captured per-cell `x/y/width/height/as`; empty `<mxGeometry/>` when `None` |
| `crates/diagram-format-drawio/src/mapping.rs` | modify | real `to_domain`; inline `IdMap`; `CellRef` enum |
| `crates/diagram-compat-testkit/fixtures/vertex-rect.drawio` | add | one vertex, geometry |
| `crates/diagram-compat-testkit/fixtures/edge-connect.drawio` | add | two vertices + one edge |
| `crates/diagram-compat-testkit/fixtures/group-nested.drawio` | add | group + child vertex |
| `crates/diagram-compat-testkit/fixtures/two-pages.drawio` | add | two diagrams |
| `crates/diagram-compat-testkit/fixtures/dangling-edge.drawio` | add | edge referencing missing source |
| `crates/diagram-compat-testkit/src/roundtrip.rs` | modify | mapping-preservation tests + dangling-ref test |

## Interfaces / Contracts

```rust
// diagram-core
pub struct CellGeometry { pub x: f64, pub y: f64, pub width: f64, pub height: f64, pub relative: bool }

pub struct Vertex {
    pub geometry: Option<CellGeometry>,
    pub label: Option<Label>,
    pub style_id: Option<StyleId>,
    pub parent: Option<GroupId>,
}
pub struct Edge {
    pub label: Option<Label>,
    pub style_id: Option<StyleId>,
    pub source: VertexId,
    pub target: VertexId,
}
pub struct Group {
    pub geometry: Option<CellGeometry>,
    pub label: Option<Label>,
    pub style_id: Option<StyleId>,
}

// ModelStore — typed payloads
impl ModelStore {
    pub fn insert_vertex(&mut self, v: Vertex) -> VertexId;
    pub fn insert_edge(&mut self, e: Edge) -> EdgeId;
    pub fn insert_group(&mut self, g: Group) -> GroupId;
    pub fn insert_style(&mut self, s: StyleMap) -> StyleId;
    pub fn vertex(&self, id: VertexId) -> Option<&Vertex>;
    pub fn replace_vertex(&mut self, id: VertexId, v: Vertex) -> Option<Vertex>;
    // …equivalents for edge/group/style…
}

// diagram-format-drawio
pub struct RawDrawioGeometry { pub x: f64, pub y: f64, pub width: f64, pub height: f64, pub r#as: String }

pub struct RawDrawioCell { /* existing fields… */ pub geometry: Option<RawDrawioGeometry> }

impl DrawioMapping {
    pub fn to_domain(&self, raw: &RawDrawioDocument) -> FormatResult<DiagramModel>;
    pub fn to_domain_with_diagnostics(&self, raw: &RawDrawioDocument, diag: &mut Vec<Diagnostic>) -> FormatResult<DiagramModel>;
}

// Internal (not re-exported)
enum CellRef { Vertex(VertexId), Edge(EdgeId), Group(GroupId) }
type IdMap = BTreeMap<String, CellRef>;
```

## Entropy Constraints

| Interface/Module | Risk | Constraint |
|------------------|------|------------|
| `DrawioMapping::to_domain` | medium (format→core seam) | All connascence-of-value (`parent`/`source`/`target` strings) resolved internally; `IdMap` never escapes |
| `ModelStore::insert_*` signatures | low (bootstrap break) | Phase-1 has 3 tests; full workspace passes clean today |
| `parser.rs` mxGeometry attach | medium (stateful: "last cell") | Rule gated on `as != "graph"`; covered by `simple-rect` regression + new `vertex-rect` |
| `CellGeometry` duplication with `Rect`/`Point` | low | `CellGeometry` adds `relative` flag and matches `.drawio` field names; conversion helpers deferred |

## Testing Strategy

| Layer | What To Test | Approach |
|-------|--------------|----------|
| Unit (core) | `ModelStore` typed insert/lookup/replace | in-crate `#[cfg(test)]` |
| Unit (format) | `RawDrawioGeometry` parse (Empty + Start variants) | table-driven on XML strings |
| Unit (format) | `to_domain` empty doc → empty model | direct call |
| Integration | `vertex-rect` → 1 page, 1 vertex, `width=80 height=40` preserved through map | fixture + assertions |
| Integration | `edge-connect` → 2 vertices + 1 edge; `source`/`target` resolve to `VertexId` | fixture + assertions |
| Integration | `group-nested` → 1 group + 1 child; child `parent == group_id` | fixture + assertions |
| Integration | `two-pages` → 2 pages, cell partitioning correct | fixture + assertions |
| Integration | `dangling-edge` → edge dropped, ≥1 Diagnostic emitted | fixture + diag capture |
| Regression | `simple-rect.drawio` round-trip now preserves geometry (was silent loss in Phase 1) | existing test, strengthened assertions |

## Migration / Rollout

No migration. Single PR; revert restores Phase-1 stubs. Three existing tests may need assertion updates (signature change only — behavior is additive).

## Open Questions

- **None blocking.** Style dedup (same style string → same `StyleId`) is deliberately deferred to a corpus-driven follow-up; current per-cell `insert_style` is correct but verbose. ROADMAP notes this under "Round-trip completo en testkit".
