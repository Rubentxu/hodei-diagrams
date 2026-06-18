# Kernel Specs: domain-mapping-v1

## Router Context Used
- Knowledge Coverage: sufficient (ADRs 0009/0014/0020/0021/0022/0023/0024/0026/0027, ROADMAP §24, drawio-raw-roundtrip archive handoff, explore-report covering full workspace)
- Context Quality: C2
- Taxonomy: domain-modeling, boundary-seam, connascence-of-value, API-contract, testing
- Domain Language: Vertex (node-shape with geometry/label/style_ref/parent), Edge (connector with source/target/label/style_ref), Group (container with geometry/label/style_ref), CellGeometry (x/y/w/h/relative), DrawioMapping (stateless format→core mapper), IdMap (BTreeMap<String, …Id> owned by format crate), mxGeometry (draw.io geometry element), preserve-unknown, round-trip
- Recommended Effort: deepen (multi-crate redesign, core + format + testkit; 3 open questions resolved to LOCKED decisions in proposal)

## Knowledge Provenance
- Scope source: `sddk/domain-mapping-v1/proposal.md`
- Invariant source: `sddk/domain-mapping-v1/proposal.md` (Invariants section); `sddk/domain-mapping-v1/explore-report.md` (Invariants table §148-159); ADR-0009 (Rust-native model + mapping), ADR-0014 (format depends only on core), ADR-0020 (core has pages/vertices/edges/groups/geometry/styles/labels), ADR-0021 (styles flexible map), ADR-0022 (labels rich content, non_exhaustive), ADR-0023 (engine-owned IDs + external ID mapping at boundary), ADR-0024 (preserve unknown, degrade explicitly), ADR-0026 (raw model first, map later), ADR-0027 (raw model stays in format crate)
- Memory-only hints excluded from spec truth:
  - Phase 1 parser internals recap (already in Engram)
  - CogniCode/Chronos analysis (both skipped for this change — pure modeling, no runtime or codebase-quantitative analysis available)

---

## LOCKED Design Decisions (from proposal — not open questions)

These three decisions were resolved during proposal and are spec truth. The design phase SHALL implement them as stated; the spec's requirements assume these decisions:

1. **Style attribution**: shared model-level `StyleMap` with per-cell `Option<StyleId>` (DRY). The engine's style slotmap carries `StyleMap` values. Cells reference styles by `StyleId`, not by inline copy.
2. **IdMap location**: inline `BTreeMap<String, ...Id>` field(s) on `DrawioMapping`, allocated per `to_domain` call. Pure-function friendly; threads cleanly into a future `to_raw`.
3. **mxGeometry capture**: `RawDrawioCell` extended with `geometry: Option<RawDrawioGeometry>`. Parser fills it; writer emits it. No lazy decode during mapping.

---

## Capability: Domain Payload Types

`diagram-core` SHALL define `Vertex`, `Edge`, `Group`, and `CellGeometry` types and re-export them from its public API.

### Requirement: Vertex payload shape
The system SHALL represent a node-shape cell as a `Vertex` struct with optional `geometry`, `label`, `style_id`, and `parent` fields, where `parent` is `Option<GroupId>`.

#### Scenario: Vertex with all fields populated
- GIVEN a raw cell with `vertex="1"`, an `mxGeometry`, a `value` attribute, a `style` attribute, and a `parent="g5"` reference
- WHEN the cell is mapped to a `Vertex`
- THEN the resulting `Vertex` has `geometry: Some(CellGeometry { x, y, width, height, relative })`, `label: Some(Label { text })`, `style_id: Some(StyleId)`, and `parent: Some(GroupId)`

#### Scenario: Vertex with minimal fields
- GIVEN a raw cell with `vertex="1"` but no geometry, no value, no style, and no parent
- WHEN the cell is mapped to a `Vertex`
- THEN the resulting `Vertex` has `geometry: None`, `label: None`, `style_id: None`, and `parent: None`

### Requirement: Edge payload shape
The system SHALL represent a connector cell as an `Edge` struct with `label`, `style_id`, `source: VertexId`, and `target: VertexId` fields.

#### Scenario: Edge with both endpoints
- GIVEN a raw cell with `edge="1"`, `source="v2"`, `target="v3"`, and a label
- WHEN the cell is mapped to an `Edge` and the IdMap has resolved `"v2"` → `VertexId(A)` and `"v3"` → `VertexId(B)`
- THEN the resulting `Edge` has `source: A`, `target: B`, `label: Some(Label { text })`

#### Scenario: Edge with no label
- GIVEN a raw cell with `edge="1"`, `source="v2"`, `target="v3"`, but no `value` attribute
- WHEN mapped to an `Edge`
- THEN the resulting `Edge` has `label: None`

### Requirement: Group payload shape
The system SHALL represent a container cell as a `Group` struct with `geometry`, `label`, and `style_id` fields. Children reference the group via their own `parent: Option<GroupId>` field, matching draw.io `parent` semantics.

#### Scenario: Group with geometry and children
- GIVEN a raw cell with `vertex="1"` and `parent="g1"` (implying a group container), and another raw cell that is the group itself (no `vertex`/`edge` flag on `mxCell` acts as group in draw.io)
- WHEN the group cell is mapped to a `Group` and the child cell is mapped to a `Vertex` with `parent: Some(GroupId)`
- THEN the `Vertex.parent` field references the `Group`'s engine ID

### Requirement: CellGeometry shape
The system SHALL define `CellGeometry` with `x: f64`, `y: f64`, `width: f64`, `height: f64`, and `relative: bool` (capturing the draw.io `as` attribute semantics where `as="geometry"` means absolute positioning).

#### Scenario: Absolute geometry
- GIVEN a raw `<mxGeometry x="10" y="20" width="80" height="40" as="geometry"/>`
- WHEN mapped to `CellGeometry`
- THEN `CellGeometry { x: 10.0, y: 20.0, width: 80.0, height: 40.0, relative: false }`

#### Scenario: Relative geometry
- GIVEN a raw `<mxGeometry x="5" y="10" width="100" height="50"/>` (no `as` attribute, or `as` != `"geometry"`)
- WHEN mapped to `CellGeometry`
- THEN `CellGeometry { x: 5.0, y: 10.0, width: 100.0, height: 50.0, relative: true }`

---

## Capability: ModelStore Redesign

`ModelStore` SHALL hold typed payloads in its slotmaps instead of `()` placeholders.

### Requirement: insert_vertex accepts and stores a Vertex
The system SHALL replace `insert_vertex(&mut self) -> VertexId` with `insert_vertex(&mut self, vertex: Vertex) -> VertexId` and SHALL provide a method to retrieve the stored `Vertex` by `VertexId`.

#### Scenario: Insert and retrieve a Vertex
- GIVEN an empty `ModelStore`
- WHEN `store.insert_vertex(Vertex { geometry: Some(geo), .. })` is called and returns `vid`
- THEN `store.vertex(vid)` returns `Some(&Vertex)` with the same geometry

#### Scenario: Vertex not found
- GIVEN a `ModelStore` that does not contain the given `VertexId`
- WHEN `store.vertex(vid)` is called
- THEN it returns `None`

### Requirement: insert_edge accepts and stores an Edge
The system SHALL replace `insert_edge(&mut self) -> EdgeId` with `insert_edge(&mut self, edge: Edge) -> EdgeId` and SHALL provide retrieval by `EdgeId`.

#### Scenario: Insert and retrieve an Edge
- GIVEN an empty `ModelStore`
- WHEN `store.insert_edge(Edge { source: vid_a, target: vid_b, .. })` is called and returns `eid`
- THEN `store.edge(eid)` returns `Some(&Edge)` with `source == vid_a` and `target == vid_b`

### Requirement: insert_group accepts and stores a Group
The system SHALL replace `insert_group(&mut self) -> GroupId` with `insert_group(&mut self, group: Group) -> GroupId` and SHALL provide retrieval by `GroupId`.

### Requirement: Style slotmap carries StyleMap values
The system SHALL replace the `SlotMap<StyleId, ()>` for styles with a slotmap holding `StyleMap` values, and SHALL replace `insert_style(&mut self) -> StyleId` with `insert_style(&mut self, style_map: StyleMap) -> StyleId`.

#### Scenario: Insert and retrieve a shared style
- GIVEN an empty `ModelStore`
- WHEN `store.insert_style(StyleMap::from([("fillColor", "#ff0000")]))` is called and returns `sid`
- THEN `store.style(sid)` returns `Some(&StyleMap)` containing `fillColor: #ff0000`

---

## Capability: mxGeometry Parser Capture

The `.drawio` parser SHALL capture `mxGeometry` element attributes into `RawDrawioCell.geometry` instead of silently discarding them.

### Requirement: RawDrawioGeometry type
The system SHALL define `RawDrawioGeometry` with fields `x: f64`, `y: f64`, `width: f64`, `height: f64`, and `as_: String` (for the `as` attribute).

### Requirement: Parser captures mxGeometry on Empty event
The system SHALL capture `mxGeometry` attributes when the element appears as an `<mxGeometry .../>` self-closing tag inside a cell.

#### Scenario: Self-closing mxGeometry inside a cell
- GIVEN XML `<mxCell id="2" vertex="1"><mxGeometry x="10" y="20" width="80" height="40" as="geometry"/></mxCell>`
- WHEN parsed
- THEN the resulting `RawDrawioCell` has `geometry = Some(RawDrawioGeometry { x: 10.0, y: 20.0, width: 80.0, height: 40.0, as_: "geometry" })`

### Requirement: Parser captures mxGeometry on Start/End pair
The system SHALL capture `mxGeometry` attributes when the element appears as `<mxGeometry ...>` with child content `</mxGeometry>` (Start/End pair).

#### Scenario: Paired mxGeometry with Array/points children
- GIVEN XML `<mxCell id="5" edge="1"><mxGeometry as="geometry"><Array as="points"><mxPoint x="100" y="200"/></Array></mxGeometry></mxCell>`
- WHEN parsed
- THEN the resulting `RawDrawioCell` has `geometry.as_` = `"geometry"` (the child `<Array>` content is not captured in v1, per ADR-0029 edge-waypoint deferral; a Diagnostic is emitted for the unsupported child element)

### Requirement: Parser handles cells without mxGeometry
The system SHALL produce `RawDrawioCell.geometry = None` when a cell has no `<mxGeometry>` child element.

#### Scenario: Cell without geometry
- GIVEN XML `<mxCell id="2" vertex="1"/>` (no child elements)
- WHEN parsed
- THEN the resulting `RawDrawioCell` has `geometry = None`

---

## Capability: mxGeometry Writer Emission

The `.drawio` writer SHALL emit captured `mxGeometry` attributes per cell instead of always writing an empty `<mxGeometry/>`.

### Requirement: Writer emits geometry attributes when present
The system SHALL emit `<mxGeometry x="..." y="..." width="..." height="..." as="..."/>` as a child of `<mxCell>` when `RawDrawioCell.geometry` is `Some`.

#### Scenario: Vertex with geometry round-trip
- GIVEN a `RawDrawioCell` with `vertex = true` and `geometry = Some(RawDrawioGeometry { x: 10.0, y: 20.0, width: 80.0, height: 40.0, as_: "geometry" })`
- WHEN written via `write_drawio`
- THEN the output XML contains `<mxGeometry x="10" y="20" width="80" height="40" as="geometry"/>` as a child of the `<mxCell>` element

### Requirement: Writer emits empty mxGeometry only for vertices without captured geometry
The system SHALL emit an empty `<mxGeometry/>` inside a vertex `<mxCell>` only when `geometry` is `None`, preserving Phase 1 backward compatibility.

#### Scenario: Vertex without geometry in raw model
- GIVEN a `RawDrawioCell` with `vertex = true` and `geometry = None`
- WHEN written
- THEN the output XML contains `<mxCell ...><mxGeometry/></mxCell>` (empty geometry, matching Phase 1 behavior)

### Requirement: Writer skips mxGeometry for edges and groups without geometry
The system SHALL NOT emit an `<mxGeometry/>` element for edge or group cells when their `geometry` is `None`.

#### Scenario: Edge without geometry
- GIVEN a `RawDrawioCell` with `edge = true` and `geometry = None`
- WHEN written
- THEN the output XML contains `<mxCell .../>` or `<mxCell ...></mxCell>` with NO `<mxGeometry/>` child

### Requirement: Hardcoded page geometry preserved
The system SHALL preserve the hardcoded page `<mxGeometry width="827" height="1169" as="graph"/>` in the `<root>` element, independent of per-cell geometry changes.

---

## Capability: DrawioMapping — to_domain (Real Implementation)

`DrawioMapping::to_domain` SHALL convert `RawDrawioDocument` into a non-empty `DiagramModel` with real pages, vertices, edges, groups, and styles.

### Requirement: One Page per RawDrawioDiagram
The system SHALL allocate one `Page` per `RawDrawioDiagram` in the document, preserving document order.

#### Scenario: Multi-diagram document
- GIVEN a `RawDrawioDocument` with two diagrams named `"Page-1"` and `"Page-2"`
- WHEN `DrawioMapping::to_domain(raw)` is called
- THEN the resulting `DiagramModel` has `page_count() == 2` and the pages' names are `Page-1` and `Page-2` in order

#### Scenario: Diagram without a name
- GIVEN a `RawDrawioDiagram` with `name = None`
- WHEN mapped to a `Page`
- THEN the resulting `Page.name` is `None`

### Requirement: Vertex creation from raw cells
The system SHALL create a `Vertex` for each `RawDrawioCell` with `vertex = true` and `edge = false`, inserting it into the model store.

#### Scenario: Single vertex with label and style
- GIVEN a diagram with one cell: `id="2" vertex="1" value="Hello" style="rounded=1;fillColor=#dae8fc"`
- WHEN mapped
- THEN the model has one Vertex with `label = Some(Label { text: "Hello" })` and `style_id` pointing to a `StyleMap` containing `fillColor: #dae8fc`

### Requirement: Edge creation from raw cells
The system SHALL create an `Edge` for each `RawDrawioCell` with `edge = true`, resolving `source`/`target` against the `IdMap`.

#### Scenario: Edge between two vertices
- GIVEN two vertex cells with raw ids `"2"` and `"3"`, and an edge cell with `edge="1" source="2" target="3" value="connects"`
- WHEN mapped in insertion order (vertices first, then edge)
- THEN the model has one Edge with `source == <VertexId for "2">`, `target == <VertexId for "3">`, and `label == Some(Label { text: "connects" })`

### Requirement: Group creation from container cells
The system SHALL create a `Group` for each `RawDrawioCell` that has neither `vertex` nor `edge` (a container cell in draw.io semantics), and children referencing it via `parent` SHALL resolve through the `IdMap`.

#### Scenario: Group with a child vertex
- GIVEN a raw cell `id="g1"` (no vertex/edge flag — acts as container) and a raw cell `id="2" vertex="1" parent="g1"`
- WHEN mapped in insertion order
- THEN the model has one Group and one Vertex where `Vertex.parent == Some(<GroupId for "g1">)`

### Requirement: Non-empty model for any non-empty input
The system SHALL return a `DiagramModel` with at least one page for any `RawDrawioDocument` containing at least one diagram.

#### Scenario: Empty diagram yields model with one page
- GIVEN a `RawDrawioDocument` with one diagram containing zero cells
- WHEN `to_domain` is called
- THEN the result is `Ok(DiagramModel)` with `page_count() == 1` and zero vertices/edges/groups

#### Scenario: Empty document (no diagrams)
- GIVEN a `RawDrawioDocument` with zero diagrams
- WHEN `to_domain` is called
- THEN the result is `Ok(DiagramModel)` with `page_count() == 0`

---

## Capability: External ID Resolution (IdMap)

`DrawioMapping::to_domain` SHALL resolve `.drawio` string IDs to engine-owned typed IDs via an inline `IdMap` (one `BTreeMap` per cell type: `vertex_ids: BTreeMap<String, VertexId>`, etc.).

### Requirement: IDs assigned deterministically in insertion order
The system SHALL assign engine IDs in the order cells are walked (document order within each page), such that the same input always produces the same engine IDs.

#### Scenario: Deterministic ID assignment
- GIVEN two identical `.drawio` inputs with cells `id="A"` and `id="B"` in that order
- WHEN `to_domain` is called on each
- THEN `IdMap["A"]` maps to the same `KeyData` value both times (slotmap insertion-order determinism)

### Requirement: Cross-cell reference resolution
The system SHALL resolve `parent`, `source`, and `target` string references through the `IdMap` built during the mapping pass.

#### Scenario: Edge references vertices inserted before it
- GIVEN cells in order: vertex `id="A"`, vertex `id="B"`, edge `source="A" target="B"`
- WHEN mapped
- THEN the edge's `source` and `target` are the engine IDs for `"A"` and `"B"` respectively

#### Scenario: Forward reference (edge before its vertex)
- GIVEN cells in order: edge `source="A" target="B"`, vertex `id="A"`, vertex `id="B"`
- WHEN mapped
- THEN the edge's `source` and `target` resolve correctly (the IdMap is populated in two passes or populated lazily; the spec only requires the final model to be correct)

### Requirement: No raw strings leak into the domain
The system SHALL NOT expose raw `.drawio` strings through any engine-owned type. `VertexId`, `EdgeId`, `GroupId`, and `StyleId` are the only identifiers visible to the domain.

#### Scenario: VertexId has no raw string accessor
- GIVEN a `VertexId` obtained from mapping
- WHEN inspected by consumer code in `diagram-core` or above
- THEN there is no method to retrieve the original `.drawio` `id="..."` string from the `VertexId`

---

## Capability: Style Mapping

`DrawioMapping::to_domain` SHALL map raw cell `style` strings into the shared engine `StyleMap`, deduplicating identical styles via a single `StyleId` per unique style string.

### Requirement: Style string → StyleMap → StyleId
The system SHALL parse each raw `style` attribute string (semicolon-delimited key=value pairs) into a `StyleMap`, insert the `StyleMap` into the engine's style store if not already present, and return a `StyleId` referencing it.

#### Scenario: Identical styles share a StyleId
- GIVEN two vertex cells with identical `style="rounded=1;fillColor=#dae8fc"`
- WHEN mapped
- THEN both vertices have `style_id: Some(sid)` pointing to the SAME `StyleId`, and `store.style(sid)` returns one `StyleMap`

#### Scenario: Different styles get different StyleIds
- GIVEN two vertex cells with `style="fillColor=#ff0000"` and `style="fillColor=#00ff00"`
- WHEN mapped
- THEN their `style_id` values are different `StyleId`s, and the style store contains both `StyleMap`s

#### Scenario: Cell with no style
- GIVEN a raw cell with no `style` attribute
- WHEN mapped
- THEN the resulting `Vertex`/`Edge`/`Group` has `style_id: None`

### Requirement: Style formatting divergence
The system SHALL preserve exact style strings through the mapping. The `StyleMap` key-value pairs SHALL match the parsed semicolon-delimited content exactly, without normalization, trimming, or reordering.

#### Scenario: Style string preserved verbatim as StyleMap entries
- GIVEN `style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf"`
- WHEN parsed into a `StyleMap`
- THEN `style_map.get("rounded")` returns `Some(&StyleValue("1"))`, `style_map.get("fillColor")` returns `Some(&StyleValue("#dae8fc"))`, and there are exactly 5 entries

---

## Capability: Diagnostic Channel for Dangling References

`DrawioMapping::to_domain` SHALL emit diagnostics (not errors) when resolving `parent`, `source`, or `target` references that point to IDs not found in the `IdMap`.

### Requirement: Dangling parent reference produces a Diagnostic
The system SHALL produce a `Diagnostic` when a cell's `parent` attribute references an ID not present among the cells in any page.

#### Scenario: Parent pointing to nonexistent cell
- GIVEN a cell with `parent="nonexistent"` and no cell with `id="nonexistent"` exists
- WHEN mapped
- THEN a `Diagnostic` is emitted with `location` indicating the cell and `message` describing the dangling `parent` reference, and the `Vertex.parent` field is `None`

### Requirement: Dangling source/target reference produces a Diagnostic
The system SHALL produce a `Diagnostic` when an edge's `source` or `target` attribute references an ID not found in the `IdMap`.

#### Scenario: Edge with dangling source
- GIVEN an edge with `source="missing"` and no vertex with `id="missing"`
- WHEN mapped
- THEN a `Diagnostic` is emitted for the dangling `source`, and the edge's `source` field contains a best-effort `VertexId` (e.g., a sentinel or the next available ID — design-phase detail)

#### Scenario: Dangling refs do not abort mapping
- GIVEN a document with one valid cell and one cell with a dangling `parent`
- WHEN `to_domain` is called
- THEN the result is `Ok(DiagramModel)` with the valid cell present and diagnostics collected for the dangling ref

### Requirement: Diagnostic channel integration
The system SHALL integrate diagnostics into the `to_domain` call via a `&mut Vec<Diagnostic>` parameter, matching the existing `parse_str_with_diagnostics` pattern.

#### Scenario: Diagnostics collected alongside success
- GIVEN a document with both valid and dangling-ref cells
- WHEN `DrawioMapping::new().to_domain_with_diagnostics(raw, &mut diagnostics)` is called
- THEN the result is `Ok(DiagramModel)`, `diagnostics.len() > 0`, and each `Diagnostic.location` identifies the problematic cell

---

## Capability: Round-Trip Preservation Through Domain Mapping

The compatibility testkit SHALL verify that domain-level information (geometry, label, style, parent, source, target, page names) survives a parse → map → re-serialize-as-raw → re-parse cycle.

V1 round-trip path: `RawDrawioDocument → DiagramModel → RawDrawioDocument` (no `to_raw` yet; re-serialization goes through the raw model path established in Phase 1). The raw→raw path must preserve everything the parser now captures.

### Requirement: simple-rect geometry preserved
The system SHALL preserve `mxGeometry` width and height through the full parse → write cycle, fixing the Phase 1 silent loss.

#### Scenario: simple-rect round-trip preserves geometry
- GIVEN `fixtures/simple-rect.drawio` containing `<mxGeometry width="80" height="40" as="geometry"/>`
- WHEN parsed, written, and reparsed
- THEN the second parse's `RawDrawioCell.geometry` has `width: 80.0` and `height: 40.0`

### Requirement: Vertex with label and style survives round-trip
The system SHALL preserve vertex labels and style strings through the raw parse → write → reparse cycle.

#### Scenario: vertex-rect fixture
- GIVEN a fixture with a vertex cell containing `value="MyVertex"` and `style="rounded=1;fillColor=#dae8fc"`
- WHEN round-tripped (parse → write → reparse)
- THEN the reparsed cell has `value == Some("MyVertex")` and `style` containing `fillColor=#dae8fc`

### Requirement: Edge endpoints survive round-trip
The system SHALL preserve edge `source` and `target` attributes through the raw round-trip cycle.

#### Scenario: edge-connect fixture
- GIVEN a fixture with two vertices `id="A"` and `id="B"` and an edge `source="A" target="B"`
- WHEN round-tripped
- THEN the reparsed edge has `source == "A"` and `target == "B"`, and both vertex cells remain present

### Requirement: Group nesting survives round-trip
The system SHALL preserve group membership (`parent` attribute) through the raw round-trip cycle.

#### Scenario: group-nested fixture
- GIVEN a fixture with a group container `id="g1"` and a child vertex `id="v1" parent="g1"`
- WHEN round-tripped
- THEN the reparsed child cell has `parent == Some("g1")` and the group cell is still present

### Requirement: Multi-page document survives round-trip
The system SHALL preserve multiple pages with their names and cells through the raw round-trip cycle.

#### Scenario: two-pages fixture
- GIVEN a fixture with two `<diagram>` elements named `"First"` and `"Second"`, each with one cell
- WHEN round-tripped
- THEN the reparsed document has two diagrams with names `"First"` and `"Second"`, each containing one cell

---

## Invariants Covered

| Invariant | Source | Coverage |
|-----------|--------|----------|
| `diagram-format-drawio` depends only on `diagram-core` | ADR-0014 | Architectural constraint — verified by `cargo tree -p diagram-format-drawio` (verification note, no spec scenario) |
| Engine owns IDs; external IDs mapped at boundary | ADR-0023 | "No raw strings leak into the domain" scenario; IdMap owned by `DrawioMapping` (format crate) |
| Styles are a flexible map | ADR-0021 | "Style formatting divergence" scenario — `StyleMap` preserves raw key=value pairs verbatim |
| Labels are potentially rich | ADR-0022 | `Label` type unchanged (`#[non_exhaustive]`) — Vertex/Edge/Group hold `Option<Label>` |
| Preserve unknown data, degrade explicitly | ADR-0024 | `RawDrawioCell.extra` unchanged; Compatibility diagnostics for unsupported elements preserved from Phase 1 |
| Raw model lives in format crate | ADR-0027 | `RawDrawioGeometry` added inside `diagram-format-drawio/src/raw.rs` (verification note) |
| Layout and routing are out of `diagram-core` | ADR-0013 | Edge waypoints not captured in v1; `mxGeometry` with child `<Array>` emits Diagnostic (verification note) |
| Workspace passes `cargo fmt + clippy + check` clean | AGENTS.md §2.3 | Success criterion — verification gate, no spec scenario |
| No new crate dependencies added | Proposal | Success criterion — verification gate, no spec scenario |
| `Vertex`/`Edge`/`Group` re-exported from `diagram-core` | Proposal | "Domain Payload Types" capability — all three types SHALL appear in `lib.rs` re-exports |
| `ModelStore::insert_*` signature change is additive | Proposal | "ModelStore Redesign" capability — old `()`-payload signatures removed; new typed-payload signatures added |

---

## New Test Fixtures Required

Test fixtures live in `crates/diagram-compat-testkit/fixtures/`. These are part of the spec — each fixture exercises at least one scenario above:

| Fixture | Exercises |
|---------|-----------|
| `simple-rect.drawio` (existing, updated assertion) | Geometry preservation: width=80, height=40 survives round-trip |
| `vertex-rect.drawio` | Single vertex with label + style + geometry: `value="MyVertex" style="rounded=1;fillColor=#dae8fc"` + `<mxGeometry x="10" y="20" width="120" height="60" as="geometry"/>` |
| `edge-connect.drawio` | Two vertices (`id="A"`, `id="B"`) + one edge (`source="A" target="B" value="connects"`) |
| `group-nested.drawio` | Group container + child vertex with `parent`: group `id="g1"` with geometry; vertex `id="v1" vertex="1" parent="g1"` |
| `two-pages.drawio` | Two `<diagram>` elements named `"Page-1"` and `"Page-2"`, each with one cell |

---

## Open Questions

- **`to_raw` deferred**: The reverse mapping `to_raw(&DiagramModel, &IdMap) -> RawDrawioDocument` is explicitly out of scope for this change (per ROADMAP "Round-trip completo en testkit" follow-up milestone). The `IdMap` shape chosen here (inline `BTreeMap`s on `DrawioMapping`) is designed to support `to_raw` without rework.
- **Edge waypoints / routing geometry**: `<Array as="points"><mxPoint/></Array>` inside `<mxGeometry>` is not captured in v1. Per ADR-0013 and ADR-0029, edge routing is deferred to `diagram-routing` crate. The parser SHALL emit a `Diagnostic` for these elements; the `RawDrawioGeometry` captures only `x/y/width/height/as` attributes.
- **Style string parsing edge cases**: The semicolon-delimited `key=value` format assumed by draw.io may have edge cases (empty values, semicolons inside values, keys without values, repeated keys). The spec mandates verbatim preservation in `StyleMap`. Which edge cases produce `Diagnostic` vs silent preservation is a design-phase detail.
- **Dangling ref resolution strategy**: The spec requires best-effort handling (no panic, no abort). Whether dangling `source`/`target` edges get a sentinel `VertexId`, are skipped, or hold `Option<VertexId>` is a design-phase decision. The spec only requires diagnostics + success.
