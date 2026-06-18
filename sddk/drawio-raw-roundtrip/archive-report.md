# Kernel Archive Report: drawio-raw-roundtrip

## Status: COMPLETED

## Archived Artifacts

- `sddk/drawio-raw-roundtrip/proposal.md` — kernel proposal
- `sddk/drawio-raw-roundtrip/spec.md` — behavior spec
- `sddk/drawio-raw-roundtrip/design.md` — technical design
- `sddk/drawio-raw-roundtrip/tasks.md` — implementation tasks
- `sddk/drawio-raw-roundtrip/apply-progress.md` — apply progress
- `sddk/drawio-raw-roundtrip/verify-report.md` — verify report

## Final Verdict

**PASS** — all 3 tests passing, cargo check/clippy/fmt clean.

## Final Router Context

- Context Quality: C2
- Taxonomy: parse/write symmetry, preserve-unknown
- Domain Language: resolved (shims, page size, id=0/1 strip)
- Invariants: all preserved
- Recommended Effort: deepen

## Knowledge Updates

| Artifact / Claim | Impact | Action |
|----------------|--------|--------|
| parse_drawio / write_drawio shims | stable | documented in lib.rs docs |
| Diagnostic type | stable | added to error.rs |
| quick-xml streaming approach | stable | documented in parser.rs comments |
| A4 page size (827×1169) | stable | hardcoded in writer.rs |

## Entropy Trend

Phase 1 (raw round-trip) delivered low-entropy change with clear boundaries. Parser and writer are isolated within the format crate. No cross-crate coupling introduced. Phase 2 (domain mapping) will require ModelStore redesign but is cleanly separated.

## What Was Learned

- quick-xml 0.40 event API details: End(mxfile) breaks before Eof, requiring validation there
- quick-xml Attributes iterator returns `Result<Attribute, AttrError>` — must handle error case
- `saw_mxgraph_model` flag needed because draw.io allows diagram without mxGraphModel
- `#[allow(unused_imports)]` needed in testkit roundtrip.rs for lib-level test imports

## Next Recommended

**New change: domain-mapping-v1** — redesign ModelStore to retain Vertex types and wire DrawioMapping to domain model. Precondition documented.
