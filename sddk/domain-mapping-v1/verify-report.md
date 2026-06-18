# Kernel Verify Report: domain-mapping-v1

## Verdict

**PASS**

## Router Context Verified

- Knowledge Coverage: sufficient (ADRs 0009/0014/0020/0021/0022/0023/0024/0026/0027, spec, design, tasks)
- Context Quality: C2
- Taxonomy: domain-modeling, boundary-seam, connascence-of-value, API-contract, testing
- Domain Language: Vertex, Edge, Group, CellGeometry, DrawioMapping, IdMap, mxGeometry, preserve-unknown
- Recommended Effort: deepen — multi-crate redesign, 25 tasks, 3 PR slices

## Knowledge Traceability

| Claim | Backing Artifact | Result |
|-------|-----------------|--------|
| CellGeometry in geometry.rs | Task 1 | ✅ implemented |
| Vertex/Edge/Group new types | Tasks 2-4 | ✅ implemented |
| ModelStore typed payloads | Task 5 | ✅ slotmaps hold typed values |
| DiagramModel.styles removed | Task 6 | ✅ absorbed into ModelStore |
| RawDrawioGeometry in raw.rs | Task 7 | ✅ implemented |
| RawDrawioCell extended | Task 8 | ✅ geometry field added |
| mxGeometry parser capture | Tasks 9-11 | ✅ 5 parser tests passing |
| mxGeometry writer emission | Tasks 12-13 | ✅ writer test passing |
| to_domain two-pass algorithm | Tasks 14-16 | ✅ 6 mapping tests passing |
| Page name set from diagram.name | Slice 3 bug fix | ✅ fixed during apply |
| 5 new fixtures | Tasks 17-21 | ✅ created |
| simple-rect geometry assert | Task 22 | ✅ Phase 1 silent-loss FIXED |
| 4 roundtrip tests | Task 23 | ✅ passing |
| 5 mapping integration tests | Task 24 | ✅ passing |

## Compliance Matrix

| Area | Result | Evidence |
|------|--------|----------|
| parse_drawio | PASS | 12 format tests passing |
| write_drawio | PASS | writer test passing |
| DrawioMapping::to_domain | PASS | 6 mapping tests passing |
| mxGeometry capture | PASS | 5 parser tests + strengthened simple-rect |
| RawDrawioCell.geometry | PASS | extend verified |
| cargo check | PASS | 0 errors |
| cargo clippy | PASS | 0 warnings |
| cargo test | PASS | 25 tests (12 testkit + 12 format + 1 core) |
| cargo fmt | PASS | formatted |
| cargo tree -p diagram-format-drawio | PASS | only diagram-core + pure data crates |

## Invariant Verification

| Invariant | Result | Evidence |
|-----------|--------|----------|
| diagram-format-drawio depends only on diagram-core | PASS | cargo tree confirmed |
| Engine owns IDs; external IDs mapped at boundary | PASS | IdMap inside DrawioMapping |
| Styles are flexible map (verbatim) | PASS | parse_style_string preserves semicolon-delimited format |
| Labels non_exhaustive | PASS | Label unchanged |
| preserve-unknown | PASS | extra BTreeMap on RawDrawioCell preserved |
| layout/routing out of diagram-core | PASS | edge waypoints not captured, diagnostic emitted |
| cargo fmt+clippy+check clean | PASS | verified |

## Entropy / Architecture Check

| Check | Result | Notes |
|-------|--------|-------|
| ModelStore typed payloads | OK | () → typed, bootstrap debt repaid |
| DrawioMapping boundary | OK | connascence-of-value contained at boundary |
| No new dependencies | OK | cargo tree confirmed |
| Style dedup (local) | OK | BTreeMap<String, StyleId> per call |
| Dangling edge strategy | OK | edge dropped with Diagnostic, not partial |

## Test Count Summary

| Crate | Before | After | New |
|-------|--------|-------|-----|
| diagram-core | 0 | 1 | 1 (store smoke test) |
| diagram-format-drawio | 0 | 12 | 12 (parser + writer + mapping) |
| diagram-compat-testkit | 3 | 12 | 9 (5 roundtrip + 4 mapping) |
| **Total** | **3** | **25** | **22** |

## Findings

- Page name assignment bug found and fixed during Slice 3: `diagram.name` was never being set on `Page` — fixed with second pass over pages
- Phase 1 silent mxGeometry data loss: FIXED — simple-rect.drawio now preserves width=80, height=40

## Next Recommended

**archive** — all success criteria met, 25 tests passing, ADR-0014 preserved, ready to close.
