# Kernel Proposal: domain-mapping-v1

## Intent
Phase 1 (`drawio-raw-roundtrip`) shipped a stub `DrawioMapping::to_domain` returning an empty model and placeholder `ModelStore` slotmaps with `()` payloads. Phase 2 makes the Semantic Port real: it defines `Vertex`/`Edge`/`Group` payload types, fixes the silent `mxGeometry` data loss in the parser, and implements the actual raw→domain mapping. Without this, the engine cannot represent a single vertex with coordinates, which is the entire reason `Vertex` exists.

## Context Gate
| Knowledge Coverage | Quality | Taxonomy | Extra Effort |
|--------------------|---------|----------|--------------|
| sufficient | C2 | domain-modeling, boundary-seam, connascence-of-value, API-contract, testing | deepen |

## Knowledge Alignment
- Roadmap / Backlog: `docs/ROADMAP.md:24` "Domain mapping bootstrap (Vertex, Edge, Group payload types + DrawioMapping)"
- Work Items / Specs: `sddk/drawio-raw-roundtrip/archive-report.md:46-47` direct handoff
- ADR / Architecture Sources: 0009, 0014, 0020, 0021, 0022, 0023, 0024, 0026, 0027
- Ownership Source: single-author repo, `AGENTS.md` §5
- Prior Learnings: Engram `sddk/drawio-raw-roundtrip` archive; inline parser learnings (quick-xml `Attributes` is `Result`, `id=0/1` stripped, `saw_mxgraph_model` flag)

## Knowledge Decisions
- Stays memory-only: parser internals recap from Phase 1 (already in Engram)
- Promote to durable knowledge: **Vertex/Edge/Group payload shape** → new ADR candidate pending grill-with-docs outcome on style attribution (ADR-0021 addendum or new ADR-0030)

## Lens Routing
| Lens | Delegation | Status | Proposal Impact |
|------|------------|--------|-----------------|
| base-discipline | kernel | applied | Scope bounded to format→core seam; ADRs lock direction |
| entropy-sdd | skill | verified | Connascence-of-value on `parent`/`source`/`target` strings contained inside `DrawioMapping`; `ModelStore::insert_*` signature change is bootstrap debt repayment (OCP-acceptable) |
| cognicode-sdd | — | skipped | No CogniCode available; heuristic entropy used |
| chronos-sdd | — | skipped | No runtime bug; pure modeling work |

## Scope
### In Scope
- `Vertex`, `Edge`, `Group` payload structs in `diagram-core`
- `CellGeometry { x, y, width, height, relative }` type
- `ModelStore` redesign: typed payloads, `insert_vertex(Vertex) -> VertexId` (etc.)
- `RawDrawioGeometry` + `RawDrawioCell.geometry` + parser/writer `mxGeometry` capture (fixes silent loss)
- Real `DrawioMapping::to_domain` with `IdMap` for string→ID resolution and Diagnostic channel for dangling refs
- New fixtures: `vertex-rect`, `edge-connect`, `group-nested`, `two-pages`
- New round-trip tests asserting cell counts, geometry, parent, endpoints

### Out Of Scope
- `DrawioMapping::to_raw(&DiagramModel, &IdMap)` — follow-up milestone per ROADMAP "Round-trip completo en testkit"
- Edge waypoints / routing geometry — ADR-0013, ADR-0029 defer to routing crate
- Commands crate, scene, render — separate milestones
- Corpus expansion beyond the 4 new fixtures

## Invariants
- `diagram-format-drawio` depends only on `diagram-core` — `cargo tree -p diagram-format-drawio`
- Engine owns IDs; format crate owns the `IdMap` bridge — `VertexId` never appears with a raw `.drawio` string
- Unknown attributes preserved via `extra` and surface as `Diagnostic` (ADR-0024)
- `Label` stays `#[non_exhaustive]`; `StyleMap<String, StyleValue>` shape stays (ADR-0021/0022)
- Workspace passes `cargo fmt + clippy + check` clean

## Domain Language
- Resolved Terms: Vertex, Edge, Group, CellGeometry, DrawioMapping, IdMap, Engine ID, External ID, mxGeometry, preserve-unknown
- Unresolved Ambiguities: see Open Questions (3) below

## Capabilities
### New Capabilities
- `vertex-payload`: represent a node-shape cell with geometry, label, style ref, optional parent
- `edge-payload`: represent a connector with endpoints, label, style ref
- `group-payload`: represent a container; children point at it via `parent: Option<GroupId>`
- `raw-geometry-capture`: `mxGeometry` x/y/width/height survive parse→map→write
- `id-resolution`: `.drawio` string IDs resolve to engine IDs at the boundary; dangling refs emit Diagnostic

### Modified Capabilities
- `ModelStore::insert_*`: signature changes from `() -> VertexId` to `(Vertex) -> VertexId` — bootstrap debt repaid
- `DrawioMapping::to_domain`: from stub to real mapping

## Approach
Option A (recommended in explore): add typed payloads in core, extend raw model with `RawDrawioGeometry`, fix parser/writer, implement `to_domain` walking cells in insertion order, allocating engine IDs deterministically and resolving cross-cell refs via an inline `IdMap: BTreeMap<String, CellId>`. Style strings map into the shared `StyleMap`, returning a `StyleId` per cell. `to_raw` deferred.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `diagram-core/src/{store,model,lib}.rs` + new `vertex/edge/group.rs` | high | Add types, redesign `ModelStore`, re-export |
| `diagram-format-drawio/src/{raw,parser,writer,mapping}.rs` | high | Geometry capture, real mapping |
| `diagram-compat-testkit/{fixtures,roundtrip.rs}` | medium | 4 fixtures + mapping-preservation tests |
| `CONTEXT.md` | low | Add Vertex/Edge/Group definitions inline |
| `docs/adr/` | low | Possible ADR-0030 if style shape is contested |

## Entropy Budget
| Metric | Estimate | Status |
|--------|----------|--------|
| Existing change entropy | low — Phase 1 stubs make change additive | OK |
| New connascence | 1 seam (format→core) + 1 value-resolution inside `DrawioMapping` | OK |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `ModelStore::insert_*` signature breakage cascades | low | Phase 1 only has 3 tests; full workspace passes clean today |
| Shared `StyleId` forces borrow-vs-clone tradeoff | medium | Decide in grill-with-docs; default to owned `StyleMap` entries keyed by `StyleId` |
| `mxGeometry` as `Start`/`End` (non-empty) variant mishandled | medium | Cover both `Event::Empty` and paired events in parser + fixture |

## Rollback Plan
Revert the single PR. Phase 1 stubs remain intact in git history; `cargo test --workspace` returns to 3 passing tests.

## Success Criteria
- [ ] `cargo fmt && cargo clippy --workspace --all-targets -- -D warnings && cargo check --workspace` clean
- [ ] `cargo nextest run --workspace` green, including ≥4 new mapping tests
- [ ] `simple-rect.drawio` round-trip now preserves `width=80 height=40`
- [ ] `Vertex`/`Edge`/`Group` types exported from `diagram-core`
- [ ] `DrawioMapping::to_domain` returns non-empty model for any non-empty `.drawio` input
- [ ] Dangling `parent`/`source`/`target` refs produce `Diagnostic`, not panic or silent drop
- [ ] No new crate dependencies added

## Open Questions (max 3 — for grill-with-docs)
1. **Style attribution shape**: shared model-level `StyleMap` + per-cell `Option<StyleId>` (recommended, DRY) vs per-cell inline `StyleMap` clone? Affects `SlotMap<StyleId, StyleMap>` payload and whether ADR-0021 needs an addendum.
2. **IdMap location**: inline field on `DrawioMapping` (recommended — pure-function friendly, threads cleanly into a future `to_raw`) vs separate `IdMap` struct returned alongside `DiagramModel`?
3. **mxGeometry capture**: extend `RawDrawioCell` with `geometry: Option<RawDrawioGeometry>` (recommended — clean, ADR-0026 "raw first") vs decode lazily during mapping?

## Effort Estimate
~400–600 LOC across 3 crates (core: ~150, format: ~250, testkit: ~150), single PR.
