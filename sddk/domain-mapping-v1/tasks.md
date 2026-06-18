# Kernel Tasks: domain-mapping-v1

## Router Context Used

- Knowledge Coverage: sufficient (proposal + spec + design all present; ADRs 0009/0014/0020/0021/0022/0023/0024/0026/0027; ROADMAP L24; Phase-1 archive)
- Context Quality: C2
- Taxonomy: domain-modeling, boundary-seam, connascence-of-value, API-contract, testing
- Invariants Driving Tasks: ADR-0014 (format→core only); ADR-0021 (StyleMap verbatim); ADR-0022 (Label non_exhaustive); ADR-0023 (engine IDs); ADR-0026/0027 (raw-first in format crate); `Label` unchanged; `StyleMap` shape unchanged
- Recommended Effort: deepen — multi-crate redesign (core + format + testkit), `ModelStore::insert_*` signature break (bootstrap debt repayment, OCP-acceptable per entropy-sdd)

## Review Budget Forecast

- Estimated changed lines: **~550** (core: ~150, format: ~250, testkit: ~150)
- 400-line budget risk: **Medium** (proposal estimates 400–600 LOC; this change is at the upper end)
- Chained PRs recommended: **Yes** — see "Chained PR Slices" below
- Decision needed before apply: **Yes** — confirm 3-PR slice vs. single PR (proposal says "single PR" but AGENTS §3.4.5 mandates `chained-pr` skill when >400 LOC)

## Knowledge Traceability

- Work item source artifacts:
  - `sddk/domain-mapping-v1/proposal.md` (intent, scope, success criteria, 3 open questions → LOCKED in spec)
  - `sddk/domain-mapping-v1/spec.md` (6 capabilities, 18 requirements, 32 scenarios, 4 fixtures required)
  - `sddk/domain-mapping-v1/design.md` (file changes table, two-pass algorithm, File Changes list)
- Ownership source: single-author repo, `AGENTS.md` §5
- Open knowledge gaps affecting execution: **None blocking.** Style dedup is a deferred follow-up per design.

## Chained PR Slices

Because total LOC exceeds the 400-line per-PR budget (AGENTS §3.4.5), tasks are partitioned into 3 chained PR slices. **Each slice must compile and pass `cargo check -p <slice-crates>` on its own.** The signature break of `ModelStore::insert_*` happens atomically in Slice 1 — there is no way to keep both old and new APIs alive without dead code, so Slice 1 is the only non-decomposable unit.

| Slice | Tasks | Crates touched | Approx LOC | Stays green after slice? |
|-------|-------|----------------|------------|---------------------------|
| **PR 1 — Core typed payloads** | 1–6 | `diagram-core` | ~150 | `cargo check -p diagram-core` (testkit + format temporarily broken — that's the point of Slice 2) |
| **PR 2 — Format crate completion** | 7–16 | `diagram-format-drawio` | ~250 | `cargo check --workspace`; `simple-rect` still works; new fixture round-trip works |
| **PR 3 — Testkit fixtures + verification** | 17–25 | `diagram-compat-testkit` | ~150 | `cargo nextest run --workspace` green |

> **Alternative**: if the reviewer approves a single PR despite the 400-line guideline, the three slices can be merged into one; tasks 1–25 are already in dependency order.

---

## Tasks

### 1. `geometry.rs` — Add `CellGeometry` type

- [ ] 1.1 Add `CellGeometry` struct with fields `x: f64`, `y: f64`, `width: f64`, `height: f64`, `relative: bool` per design §"Interfaces / Contracts"
- [ ] 1.2 Derive `Debug`, `Clone`, `Copy`, `PartialEq`, `Serialize`, `Deserialize` on `CellGeometry` to match `Point`/`Size`/`Rect` style
- [ ] 1.3 Document field semantics in rustdoc: `relative = true` when the raw `as` attribute is missing or ≠ `"geometry"`; `relative = false` when `as == "geometry"` (per spec §"CellGeometry shape")
- [ ] 1.4 Verify: `cargo check -p diagram-core` passes (no other file references `CellGeometry` yet — expect unused-warning? No: rustc doesn't warn on unused public types in a `pub` module)

> **PR 1 starts.** No other slice compiles until this type exists because `Vertex`/`Group` will reference it.

### 2. `vertex.rs` — Add `Vertex` payload (new file)

- [ ] 2.1 Create `crates/diagram-core/src/vertex.rs` with `pub struct Vertex { pub geometry: Option<CellGeometry>, pub label: Option<Label>, pub style_id: Option<StyleId>, pub parent: Option<GroupId> }` per spec §"Vertex payload shape"
- [ ] 2.2 Derive `Debug`, `Clone`, `Default`, `PartialEq`, `Serialize`, `Deserialize` (matches `Label` style)
- [ ] 2.3 Add a doc comment referencing ADR-0020 (core model starts with pages/groups/styles/labels) and ADR-0023 (engine IDs)
- [ ] 2.4 Verify: `cargo check -p diagram-core` passes

### 3. `edge.rs` — Add `Edge` payload (new file)

- [ ] 3.1 Create `crates/diagram-core/src/edge.rs` with `pub struct Edge { pub label: Option<Label>, pub style_id: Option<StyleId>, pub source: VertexId, pub target: VertexId }` per spec §"Edge payload shape" and design decision "Edge endpoints non-optional"
- [ ] 3.2 Derive `Debug`, `Clone`, `Default`, `PartialEq`, `Serialize`, `Deserialize`
- [ ] 3.3 Add a doc comment noting that dangling `source`/`target` are dropped with a `Diagnostic` in `DrawioMapping` — the engine never produces a partial `Edge` (per design §"Entropy Constraints")
- [ ] 3.4 Verify: `cargo check -p diagram-core` passes

### 4. `group.rs` — Add `Group` payload (new file)

- [ ] 4.1 Create `crates/diagram-core/src/group.rs` with `pub struct Group { pub geometry: Option<CellGeometry>, pub label: Option<Label>, pub style_id: Option<StyleId> }` per spec §"Group payload shape"
- [ ] 4.2 Derive `Debug`, `Clone`, `Default`, `PartialEq`, `Serialize`, `Deserialize`
- [ ] 4.3 Add a doc comment explaining that children reference the group via their own `parent: Option<GroupId>` field (matches draw.io `parent` semantics, per spec §"Group payload shape")
- [ ] 4.4 Verify: `cargo check -p diagram-core` passes

### 5. `store.rs` — Redesign `ModelStore` for typed payloads

- [ ] 5.1 Remove dead `new_key_type!` block for `VertexKey` / `EdgeKey` / `GroupKey` / `StyleKey` (unused since Phase 1, per design §"Architecture Decisions")
- [ ] 5.2 Change `vertices: SlotMap<VertexId, ()>` → `vertices: SlotMap<VertexId, Vertex>`
- [ ] 5.3 Change `edges: SlotMap<EdgeId, ()>` → `edges: SlotMap<EdgeId, Edge>`
- [ ] 5.4 Change `groups: SlotMap<GroupId, ()>` → `groups: SlotMap<GroupId, Group>`
- [ ] 5.5 Change `styles: SlotMap<StyleId, ()>` → `styles: SlotMap<StyleId, StyleMap>` (locked decision #1: shared `StyleMap` per `StyleId`)
- [ ] 5.6 Change `vertex(&self, id) -> Option<()>` → `vertex(&self, id: VertexId) -> Option<&Vertex>` (and `&mut` companion if needed for tests)
- [ ] 5.7 Change `insert_vertex(&mut self) -> VertexId` → `insert_vertex(&mut self, v: Vertex) -> VertexId`
- [ ] 5.8 Change `edge(&self, id)` → `edge(&self, id: EdgeId) -> Option<&Edge>`; change `insert_edge(&mut self) -> EdgeId` → `insert_edge(&mut self, e: Edge) -> EdgeId`
- [ ] 5.9 Change `group(&self, id)` → `group(&self, id: GroupId) -> Option<&Group>`; change `insert_group(&mut self) -> GroupId` → `insert_group(&mut self, g: Group) -> GroupId`
- [ ] 5.10 Change `style(&self, id)` → `style(&self, id: StyleId) -> Option<&StyleMap>`; change `insert_style(&mut self) -> StyleId` → `insert_style(&mut self, s: StyleMap) -> StyleId`
- [ ] 5.11 Add `replace_vertex(&mut self, id: VertexId, v: Vertex) -> Option<Vertex>`, `replace_edge(...)`, `replace_group(...)` — slotmap `replace` API; needed by `DrawioMapping` two-pass algorithm (per design §"Technical Approach" step 3)
- [ ] 5.12 Add `len_vertex() -> usize`, `len_edge() -> usize`, `len_group() -> usize`, `len_style() -> usize` helpers (needed by integration tests)
- [ ] 5.13 Add an in-crate `#[cfg(test)] mod tests` with a smoke test: insert a `Vertex`, look it up, replace it, look it up again (covers spec §"Scenario: Insert and retrieve a Vertex")
- [ ] 5.14 Verify: `cargo check -p diagram-core` passes; `cargo nextest run -p diagram-core` passes the new smoke test

> **API break notice:** old `insert_vertex() -> VertexId` / `vertex(id) -> Option<()>` etc. are removed. This is the bootstrap-debt signature change flagged in entropy-sdd. Testkit + format will not compile until Slice 2 catches up.

### 6. `model.rs` + `lib.rs` — Remove `styles` field, re-export new types

- [ ] 6.1 In `crates/diagram-core/src/model.rs`: remove `pub styles: StyleMap` field from `DiagramModel` (absorbed into `ModelStore.styles` per design decision "Style registry location")
- [ ] 6.2 Remove the `use crate::style::StyleMap` import in `model.rs` (no longer used)
- [ ] 6.3 In `crates/diagram-core/src/lib.rs`: add `pub mod vertex;`, `pub mod edge;`, `pub mod group;`
- [ ] 6.4 Add `pub use geometry::CellGeometry;`, `pub use vertex::Vertex;`, `pub use edge::Edge;`, `pub use group::Group;` to satisfy the success criterion "`Vertex`/`Edge`/`Group` types exported from `diagram-core`"
- [ ] 6.5 Verify: `cargo check -p diagram-core` passes (note: testkit and format will NOT compile yet — that's expected and is what PR 2 fixes)

> **End of PR 1.** Workspace is broken between PR 1 and PR 2. Merge PR 2 quickly.

---

### 7. `raw.rs` — Add `RawDrawioGeometry` type

- [ ] 7.1 Add `pub struct RawDrawioGeometry { pub x: f64, pub y: f64, pub width: f64, pub height: f64, pub r#as: String }` per design §"Interfaces / Contracts" (note `r#as` to avoid the Rust keyword; field holds the raw `as` attribute verbatim, including `"geometry"`, `"graph"`, etc.)
- [ ] 7.2 Derive `Debug`, `Clone`, `Serialize`, `Deserialize` (parity with `RawDrawioCell`)
- [ ] 7.3 Add rustdoc explaining the `as` semantics: `"geometry"` = absolute (cell), `"graph"` = page-level, anything else or missing = relative
- [ ] 7.4 Verify: `cargo check -p diagram-format-drawio` passes (no other file references this type yet)

> **PR 2 starts.** Workspace compiles after PR 1+2 are both merged.

### 8. `raw.rs` — Extend `RawDrawioCell` with `geometry` field

- [ ] 8.1 Add `pub geometry: Option<RawDrawioGeometry>` field to `RawDrawioCell` (per design §"Architecture Decisions" — "mxGeometry capture: extend `RawDrawioCell.geometry: Option<RawDrawioGeometry>`")
- [ ] 8.2 Add `#[serde(default, skip_serializing_if = "Option::is_none")]` (or equivalent) so existing JSON-serialized fixtures (Phase 1) deserialize cleanly with the new field defaulting to `None`
- [ ] 8.3 Update any existing literal `RawDrawioCell { ... }` construction sites in `parser.rs` to include `geometry: None` (compiler will catch them)
- [ ] 8.4 Verify: `cargo check -p diagram-format-drawio` passes

### 9. `parser.rs` — Capture `mxGeometry` on `Event::Empty`

- [ ] 9.1 In the `Event::Empty(e)` arm, when `e.name().as_ref() == b"mxGeometry"`, build a `RawDrawioGeometry` from attributes `x`/`y`/`width`/`height`/`as`
- [ ] 9.2 Parse `x`/`y`/`width`/`height` as `f64` via `.parse().unwrap_or(0.0)` (missing or non-numeric → 0.0; matches Phase 1 silent-loss tolerance)
- [ ] 9.3 Read `as` attribute as `String` (default to empty string if missing)
- [ ] 9.4 If the most recently pushed `current_diagram.cells.last_mut()` is `Some` AND the `as` attribute is NOT `"graph"`, attach the geometry to that cell via `cell.geometry = Some(geo)` (per design §"mxGeometry capture in parser" — `as == "graph"` is the page geometry emitted before any cell exists; safely ignored)
- [ ] 9.5 Verify: `cargo check -p diagram-format-drawio` passes

### 10. `parser.rs` — Capture `mxGeometry` on `Event::Start` (paired form)

- [ ] 10.1 In the `Event::Start(e)` arm, add a `b"mxGeometry"` branch (currently a no-op comment per parser.rs:103-105 — this fixes the silent loss)
- [ ] 10.2 Build the `RawDrawioGeometry` from the same five attributes
- [ ] 10.3 Attach to the most recently pushed cell, with the same `as != "graph"` guard from task 9.4
- [ ] 10.4 Per spec §"Scenario: Paired mxGeometry with Array/points children", the parser does NOT need to descend into child `<Array>` / `<mxPoint>` in v1; the Start/End events for those nested elements are simply ignored (ADR-0013/0029 defer edge waypoints to the routing crate)
- [ ] 10.5 Verify: `cargo check -p diagram-format-drawio` passes

### 11. `parser.rs` — Add unit tests for `mxGeometry` capture

- [ ] 11.1 Add a `#[cfg(test)] mod tests` block in `parser.rs` covering spec §"mxGeometry Parser Capture" scenarios:
  - Self-closing `<mxGeometry ... />` inside a cell → `geometry = Some(...)`
  - Paired `<mxGeometry as="geometry">...</mxGeometry>` → `geometry = Some(RawDrawioGeometry { as_: "geometry", .. })`
  - Cell without `<mxGeometry>` → `geometry = None`
  - Page-level `<mxGeometry as="graph"/>` (the writer emits one before any cell) → no cell receives it (this verifies the `as != "graph"` guard)
- [ ] 11.2 Verify: `cargo nextest run -p diagram-format-drawio` passes the new tests (4 minimum)

### 12. `writer.rs` — Emit captured per-cell `mxGeometry` attributes

- [ ] 12.1 Add a private helper `write_geometry(writer, &RawDrawioGeometry)` that emits `Event::Empty(BytesStart::new("mxGeometry"))` with `x`/`y`/`width`/`height`/`as` attributes formatted as integer-looking strings (use `format!("{}", value)` if integer-valued, `format!("{}", value)` otherwise — match draw.io convention: integers stay integer, decimals are preserved). Simpler: always `format!("{}", geo.x)` etc.; the parser accepts both per task 9.2.
- [ ] 12.2 In `write_cell`, when `cell.vertex && cell.geometry.is_some()`: emit `Event::Start(cell_start)` → `write_geometry(...)` → `Event::End(BytesEnd::new("mxCell"))` (per spec §"Scenario: Vertex with geometry round-trip")
- [ ] 12.3 In `write_cell`, when `cell.vertex && cell.geometry.is_none()`: keep Phase 1 behavior — emit empty `<mxGeometry/>` (per spec §"Scenario: Vertex without geometry in raw model")
- [ ] 12.4 In `write_cell`, when `cell.edge && cell.geometry.is_some()`: emit the captured geometry (covers the rare edge-with-position case)
- [ ] 12.5 In `write_cell`, when `cell.edge && cell.geometry.is_none()`: do NOT emit an `<mxGeometry/>` element (per spec §"Scenario: Edge without geometry")
- [ ] 12.6 When `cell` is neither vertex nor edge (group container) AND has geometry: emit captured geometry
- [ ] 12.7 Verify: `cargo check -p diagram-format-drawio` passes

### 13. `writer.rs` — Add unit test for geometry round-trip

- [ ] 13.1 Add a `#[cfg(test)] mod tests` block in `writer.rs`: build a `RawDrawioCell` with `vertex=true, geometry=Some(RawDrawioGeometry { x:10, y:20, w:80, h:40, as_:"geometry" })`, call `write_string`, assert the output contains `<mxGeometry x="10" y="20" width="80" height="40" as="geometry"/>`
- [ ] 13.2 Verify: `cargo nextest run -p diagram-format-drawio` passes

### 14. `mapping.rs` — Implement real `to_domain` (pass 1: ID allocation)

- [ ] 14.1 In `crates/diagram-format-drawio/src/mapping.rs`, add private types: `enum CellRef { Vertex(VertexId), Edge(EdgeId), Group(GroupId) }` and `type IdMap = BTreeMap<String, CellRef>` (per design §"Interfaces / Contracts")
- [ ] 14.2 Add a private helper `parse_style_string(s: &str) -> StyleMap` that splits on `;`, then on the first `=`, and inserts `(key, StyleValue(value))` pairs into a new `StyleMap` (verbatim preservation per spec §"Style formatting divergence"; empty input → empty map; no normalization, no trimming, no reordering — `BTreeMap` already sorts by key)
- [ ] 14.3 In `DrawioMapping::to_domain` (replace the stub):
  - Create `DiagramModel::new()` and `IdMap::new()`
  - For each `RawDrawioDiagram` in document order: call `store.insert_page(Page::new(pid))` and set `page.name = diagram.name.map(Label::new)`
  - **Pass 1 (forward):** for each `RawDrawioCell` in diagram order:
    - If `cell.vertex && !cell.edge`: allocate a `Vertex` placeholder, call `store.insert_vertex(placeholder)`, record `id_map.insert(cell.id.clone(), CellRef::Vertex(vid))`
    - If `cell.edge && !cell.vertex`: allocate an `Edge` placeholder (with `source`/`target` set to dummy `VertexId::default()`), call `store.insert_edge(placeholder)`, record `id_map.insert(cell.id.clone(), CellRef::Edge(eid))`
    - If neither: it's a group container; allocate a `Group` placeholder, call `store.insert_group(placeholder)`, record `id_map.insert(cell.id.clone(), CellRef::Group(gid))`
- [ ] 14.4 Verify: `cargo check -p diagram-format-drawio` passes

### 15. `mapping.rs` — Pass 2 (resolution, materialization, styles)

- [ ] 15.1 Extend `to_domain` to perform pass 2 (backward sweep) over the same cells:
  - For each cell, look up the `CellRef` in `id_map` to find its engine ID
  - If the cell has a `style` string, call `parse_style_string` → `StyleMap` → `store.insert_style(style_map) -> StyleId`; cache style strings in a `BTreeMap<String, StyleId>` to dedupe identical styles within one mapping call (cheap local dedup; full corpus dedup is the deferred follow-up)
  - If the cell has a `geometry` and the cell kind is Vertex or Group, build a `CellGeometry { x, y, width, height, relative: geo.as_ != "geometry" }`
  - For Vertex: build real `Vertex { geometry, label: cell.value.as_ref().map(|v| Label::new(v)), style_id, parent: resolve_parent(&cell.parent, &id_map, &mut diags) }`, then `store.replace_vertex(vid, vertex)`
  - For Group: build real `Group { geometry, label, style_id }`, then `store.replace_group(gid, group)`
  - For Edge: resolve `source`/`target` via `id_map`; if both resolve to `CellRef::Vertex(...)`, build real `Edge` and `store.replace_edge(eid, edge)`; otherwise emit `Diagnostic` and **drop the edge** (do NOT insert the placeholder, or remove it via `store.edges.remove(eid)` if slotmap allows — design says "drop with Diagnostic")
- [ ] 15.2 Implement `resolve_parent(parent: &Option<String>, id_map: &IdMap, diags: &mut Vec<Diagnostic>) -> Option<GroupId>`:
  - If `parent.is_none()` → return `None`
  - Look up `parent` in `id_map`; if `Some(CellRef::Group(gid))` → return `Some(gid)`; otherwise emit `Diagnostic { location: format!("cell.parent={}", parent), message: "dangling parent reference" }` and return `None` (per spec §"Dangling parent reference produces a Diagnostic")
- [ ] 15.3 Add `to_domain_with_diagnostics(&self, raw, &mut Vec<Diagnostic>) -> FormatResult<DiagramModel>` mirroring the `parse_str_with_diagnostics` pattern (per spec §"Diagnostic channel integration")
- [ ] 15.4 `to_domain` becomes a thin wrapper that calls `to_domain_with_diagnostics(raw, &mut Vec::new())` and ignores the diagnostics
- [ ] 15.5 Add a unit test: an empty `RawDrawioDocument` → `page_count() == 0`; a `RawDrawioDocument` with one diagram and zero cells → `page_count() == 1` (per spec §"Scenario: Empty diagram yields model with one page" + §"Scenario: Empty document (no diagrams)")
- [ ] 15.6 Verify: `cargo check -p diagram-format-drawio` passes; `cargo nextest run -p diagram-format-drawio` passes

> **End of PR 2.** After PR 1+2 merge, `cargo check --workspace` should be clean. PR 3 adds fixtures and tests.

---

### 16. `mapping.rs` — Add unit tests for end-to-end mapping

- [ ] 16.1 Unit test: a hand-built `RawDrawioDocument` with one diagram, one cell `{ id: "v1", vertex: true, value: Some("Hi"), style: Some("fillColor=#ff0000") }` → `to_domain` returns a model with 1 page, 1 vertex; the vertex's `label == Some(Label { text: "Hi" })` and `style_id` resolves to a `StyleMap` containing `fillColor=#ff0000` (covers spec §"Scenario: Single vertex with label and style")
- [ ] 16.2 Unit test: two identical-style vertex cells → both vertices share the same `StyleId` (covers spec §"Scenario: Identical styles share a StyleId")
- [ ] 16.3 Unit test: dangling `parent` → `Vertex.parent == None` and `diags.len() >= 1` (covers spec §"Scenario: Parent pointing to nonexistent cell")
- [ ] 16.4 Unit test: dangling edge `source` → edge is dropped, `diags.len() >= 1`, `len_edge() == 0` (covers spec §"Scenario: Edge with dangling source")
- [ ] 16.5 Verify: `cargo nextest run -p diagram-format-drawio` passes all 4 new tests

> **PR 3 starts** at task 17.

### 17. `fixtures/vertex-rect.drawio` — Single vertex with label, style, and geometry

- [ ] 17.1 Create `crates/diagram-compat-testkit/fixtures/vertex-rect.drawio` with the body:
      ```xml
      <mxfile>
        <diagram name="Page-1">
          <mxGraphModel>
            <root>
              <mxCell id="2" value="MyVertex" style="rounded=1;fillColor=#dae8fc" vertex="1">
                <mxGeometry x="10" y="20" width="120" height="60" as="geometry"/>
              </mxCell>
            </root>
          </mxGraphModel>
        </diagram>
      </mxfile>
      ```
- [ ] 17.2 Verify: `parse_drawio(include_str!(".../vertex-rect.drawio")).is_ok()`; first cell has `value == Some("MyVertex")` and `style` contains `fillColor=#dae8fc` (per spec §"Scenario: vertex-rect fixture")

### 18. `fixtures/edge-connect.drawio` — Two vertices + one edge

- [ ] 18.1 Create `crates/diagram-compat-testkit/fixtures/edge-connect.drawio` with two vertex cells (`id="A"`, `id="B"`, both with `vertex="1"` and minimal geometry) and one edge cell (`id="e1"`, `edge="1"`, `source="A"`, `target="B"`, `value="connects"`)
- [ ] 18.2 Verify: `parse_drawio(...)` succeeds; after round-trip, edge's `source == "A"` and `target == "B"` and both vertices remain present (per spec §"Scenario: edge-connect fixture")

### 19. `fixtures/group-nested.drawio` — Group + child vertex with `parent`

- [ ] 19.1 Create `crates/diagram-compat-testkit/fixtures/group-nested.drawio` with a group container `id="g1"` (no `vertex`/`edge` flag) and a child vertex `id="v1" vertex="1" parent="g1"`, both with geometry
- [ ] 19.2 Verify: `parse_drawio(...)` succeeds; after round-trip, the child cell has `parent == Some("g1")` and the group cell is still present (per spec §"Scenario: group-nested fixture")

### 20. `fixtures/two-pages.drawio` — Two `<diagram>` elements

- [ ] 20.1 Create `crates/diagram-compat-testkit/fixtures/two-pages.drawio` with two `<diagram>` elements named `"Page-1"` and `"Page-2"`, each containing one vertex cell with a distinct `id`
- [ ] 20.2 Verify: `parse_drawio(...)` succeeds; the reparsed document has two diagrams with the expected names, each with one cell (per spec §"Scenario: two-pages fixture")

### 21. `fixtures/dangling-edge.drawio` — Edge referencing a missing source

- [ ] 21.1 Create `crates/diagram-compat-testkit/fixtures/dangling-edge.drawio` with one valid vertex and one edge whose `source` references a nonexistent `id="ghost"`
- [ ] 21.2 Verify: `parse_drawio(...)` succeeds (raw parse is structural only, not semantic); `to_domain_with_diagnostics(...)` returns `Ok(model)` with `len_edge() == 0` and `diags.len() >= 1` (per spec §"Scenario: Edge with dangling source" + §"Scenario: Dangling refs do not abort mapping")

### 22. `roundtrip.rs` — Strengthen `simple-rect` round-trip test

- [ ] 22.1 In `roundtrip.rs::roundtrip_simple_rect`: after the second parse, assert that `second.diagrams[0].cells[0].geometry` is `Some(RawDrawioGeometry { width: 80.0, height: 40.0, .. })` (per spec §"Requirement: simple-rect geometry preserved" — this is the Phase 1 silent-loss fix)
- [ ] 22.2 Verify: `cargo nextest run -p diagram-compat-testkit` passes the strengthened test

### 23. `roundtrip.rs` — Add fixture-driven round-trip tests

- [ ] 23.1 Add `roundtrip_vertex_rect`: parse → write → reparse; assert `value == Some("MyVertex")` and `style` contains `fillColor=#dae8fc` on the first cell of the first diagram
- [ ] 23.2 Add `roundtrip_edge_connect`: parse → write → reparse; assert the edge's `source == Some("A")` and `target == Some("B")`, and both vertex cells remain
- [ ] 23.3 Add `roundtrip_group_nested`: parse → write → reparse; assert child cell has `parent == Some("g1")` and the group cell is present
- [ ] 23.4 Add `roundtrip_two_pages`: parse → write → reparse; assert `diagrams.len() == 2` and each diagram's name matches `"Page-1"` / `"Page-2"`
- [ ] 23.5 Verify: `cargo nextest run -p diagram-compat-testkit` passes all 4 new tests

### 24. `roundtrip.rs` — Add domain-mapping integration tests

- [ ] 24.1 Add `map_vertex_rect_preserves_label_and_style`: call `DrawioMapping::new().to_domain(&raw)`; assert `len_vertex() == 1`; the vertex's `label == Some(Label { text: "MyVertex" })` and `style_id` resolves to a `StyleMap` containing `fillColor=#dae8fc`
- [ ] 24.2 Add `map_edge_connect_resolves_endpoints`: call `to_domain` on `edge-connect` raw; assert `len_vertex() == 2`, `len_edge() == 1`; the edge's `source` and `target` equal the `VertexId`s for `"A"` and `"B"` respectively (resolved via `id_map` — tested indirectly by walking the model)
- [ ] 24.3 Add `map_group_nested_links_parent`: call `to_domain` on `group-nested` raw; assert `len_group() == 1`, `len_vertex() == 1`; the vertex's `parent` equals the `GroupId` for `"g1"`
- [ ] 24.4 Add `map_two_pages_partitions`: call `to_domain` on `two-pages` raw; assert `page_count() == 2`, and the names are `"Page-1"` / `"Page-2"`
- [ ] 24.5 Add `map_dangling_edge_emits_diagnostic`: call `to_domain_with_diagnostics(&raw, &mut diags)` on `dangling-edge` raw; assert `Ok(_)`; `len_edge() == 0`; `diags.len() >= 1`; the diagnostic's message mentions the dangling `source`
- [ ] 24.6 Verify: `cargo nextest run -p diagram-compat-testkit` passes all 5 new mapping tests

### 25. Workspace verification

- [ ] 25.1 `cargo fmt --all` — clean
- [ ] 25.2 `cargo clippy --workspace --all-targets -- -D warnings` — zero warnings
- [ ] 25.3 `cargo check --workspace` — zero errors
- [ ] 25.4 `cargo nextest run --workspace` — all tests pass (≥8 new tests in testkit, ≥4 new in format, ≥1 new in core → 13+ new tests, plus 3 existing)
- [ ] 25.5 `cargo tree -p diagram-format-drawio` — confirms `diagram-format-drawio` depends only on `diagram-core` (ADR-0014 invariant, spec §"Invariants Covered")

> **End of PR 3.** All success criteria from the proposal are met.

---

## Verification (final, per PR slice)

### After PR 1
```bash
cargo check -p diagram-core
cargo nextest run -p diagram-core
```
Expected: green. Workspace overall WILL be red (testkit + format still use the old `()`-payload API). That's acceptable for chained-PR workflow.

### After PR 2
```bash
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo nextest run -p diagram-core
cargo nextest run -p diagram-format-drawio
cargo tree -p diagram-format-drawio
```
Expected: green on all. Testkit may still fail on existing roundtrip test if Phase 1's `simple-rect` was depending on `()` payload — that test is fixed in PR 3 task 22.

### After PR 3
```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo check --workspace
cargo nextest run --workspace
cargo tree -p diagram-format-drawio
```
Expected: fully green. ≥13 new tests passing. All 5 success criteria from the proposal satisfied.

---

## Rollback Notes

- **PR 1 rollback**: revert commits 1–6. Old `()`-payload `ModelStore` is restored. Testkit and format still compile against the old API.
- **PR 2 rollback**: revert commits 7–15. Parser/writer keep Phase 1 behavior (silent `mxGeometry` loss returns; mapping returns `DiagramModel::new()`). `cargo check` should remain green because PR 1's typed payloads are still in place — but no consumer uses them. testkit continues to work.
- **PR 3 rollback**: revert commits 16–25. Fixtures and integration tests removed; no production code affected. `cargo nextest run` returns to PR 2 state.

If only the chained-PR approach is used, each slice is independently revertible without breaking the others. The critical invariant: **never merge PR 1 in isolation** (the workspace stays broken until PR 2 lands). The team should use a feature branch stacking strategy or merge PR 2 within minutes of PR 1.
