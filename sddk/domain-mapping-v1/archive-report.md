# Kernel Archive Report: domain-mapping-v1

## Status: COMPLETED

## Archived Artifacts

- `sddk/domain-mapping-v1/explore-report.md` — exploration findings
- `sddk/domain-mapping-v1/proposal.md` — change proposal
- `sddk/domain-mapping-v1/spec.md` — behavior spec
- `sddk/domain-mapping-v1/design.md` — technical design
- `sddk/domain-mapping-v1/tasks.md` — implementation tasks (25 tasks, 3 PR slices)
- `sddk/domain-mapping-v1/verify-report.md` — verification report

## Final Verdict

**PASS** — 25 tests passing, cargo check/clippy/fmt clean, ADR-0014 preserved.

## Final Router Context

- Context Quality: C2
- Taxonomy: domain-modeling, boundary-seam, connascence-of-value
- Domain Language: Vertex/Edge/Group/CellGeometry/DrawioMapping/IdMap/mxGeometry
- Invariants: all preserved
- Recommended Effort: deepen

## Knowledge Updates

| Artifact / Claim | Impact | Action |
|----------------|--------|--------|
| `Vertex`, `Edge`, `Group` structs | stable | added to diagram-core exports |
| `CellGeometry` in geometry.rs | stable | added |
| `ModelStore` typed payloads | stable | API changed from `()` to typed |
| `DiagramModel.styles` removed | stable | absorbed into `ModelStore` |
| `RawDrawioGeometry` in raw.rs | stable | added |
| `RawDrawioCell.geometry` field | stable | extended |
| `mxGeometry` capture in parser | stable | implemented (empty + start/end) |
| `mxGeometry` emission in writer | stable | implemented |
| `DrawioMapping::to_domain` real | stable | two-pass algorithm implemented |
| `DrawioMapping::to_domain_with_diagnostics` | stable | added |
| `parse_style_string` verbatim | stable | semicolon-delimited preserved |
| dangling edge → drop + diagnostic | stable | implemented |
| 5 new fixtures | stable | vertex-rect, edge-connect, group-nested, two-pages, dangling-edge |
| Page name assignment bug | fixed | diagram.name → Page.name via second pass |

## What Was Learned

- Page names from `<diagram name="...">` were never being set on `Page` objects — needed a second pass over pages after insertion
- Phase 1 silent data loss (mxGeometry dropped) was fixed by extending both parser capture and writer emission
- Style dedup via `BTreeMap<String, StyleId>` handles identical styles within one `to_domain` call
- Dangling edges are dropped (not partially represented) — this keeps the domain model clean

## Entropy Trend

Phase 2 delivered a clean, well-bounded layer boundary. The format→core seam is now typed and verifiable. ModelStore redesign was the main entropy source (API break), handled cleanly via chained-PR slices. No new cross-crate coupling introduced. Phase 3 (to_raw reverse mapping) is cleanly separated.

## Next Recommended

**New change: diagram-commands** — commands, undo/redo, history (separate from core per ADR-0012). Precondition: domain-mapping-v1 is merged.

## Metrics

- Tasks: 25 across 3 PR slices
- LOC: ~550 (core ~150, format ~250, testkit ~150)
- Tests: 25 total (22 new + 3 existing)
- Fixtures: 5 new (vertex-rect, edge-connect, group-nested, two-pages, dangling-edge)
- Dependencies: none added
