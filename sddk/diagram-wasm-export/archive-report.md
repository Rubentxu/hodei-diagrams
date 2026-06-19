# Kernel Archive Report: diagram-wasm-export

## Status
**success** — change fully implemented, verified, and archived.

## Executive Summary

Closed the round-trip by persisting the import-time `IdMap` in `Editor` and exposing `export_drawio()` across the WASM bridge. The web-shell now has a functional "Save .drawio" button that exports the current diagram via `to_raw()` → `write_drawio()`. All 9 tasks (30 sub-tasks) completed. 245 Rust tests, 83 Vitest tests, 4 new E2E tests all pass. ADR-0043 documents the `commands → format` dependency. Version bumped to v0.5.3.

## Final Verdict

**PASS WITH WARNINGS** — functionally complete, all invariants upheld.

| Area | Result |
|------|--------|
| Spec compliance (33 scenarios) | ✅ All covered |
| Design coherence | ✅ Option A (concrete IdMap in Editor), thin-adapter mirror |
| Task completion | ✅ 9/9 tasks, 30/30 sub-tasks |
| Test quality | ✅ 245 Rust + 83 Vitest + 4 E2E all passing |
| Architecture/connascence | ✅ No cycles, clean DAG commands→format→core |
| Regression/security/ops | ⚠️ ESLint `no-undef` on `Buffer` in Playwright test (non-functional) |

## Final Router Context

Persisted for reuse by future kernel runs:

- **Context Quality**: C3 — write chain existed and was tested; IdMap lifecycle across `format↔commands` seam verified; all resolved
- **Problem Taxonomy**: boundary/seam (IdMap across format↔commands, XML across WASM↔JS), coupling/connascence (CoT `IdMap` type, CoL `ExportFailed:` prefix), API contract (12th wasm export), testing (native round-trip + Playwright E2E)
- **Domain Language**: `export_drawio`, `IdMap`, `to_raw`, `write_drawio`, `replace_model`, `DownloadDrawio` — all resolved in code and docs
- **Invariants**: thin WASM adapter (ADR-0017), `unsafe_code = "forbid"`, 11 existing exports unchanged, `ExportFailed:` error prefix, no cycle in dep graph — all verified
- **Recommended Effort**: deepen — correct (engine-side Editor change + WASM wrapper + web-shell surface)

## Archived Artifacts

| Artifact | Location | Action |
|----------|----------|--------|
| Archive report | `sddk/diagram-wasm-export/archive-report.md` | **CREATED** |
| Explore report | `sddk/diagram-wasm-export/explore-report.md` | Preserved |
| Proposal | `sddk/diagram-wasm-export/proposal.md` | Preserved |
| Spec | `sddk/diagram-wasm-export/spec.md` | Preserved |
| Design | `sddk/diagram-wasm-export/design.md` | Preserved |
| Tasks | `sddk/diagram-wasm-export/tasks.md` | Preserved |
| Apply progress | `sddk/diagram-wasm-export/apply-progress.md` | Preserved |
| Verify report | `sddk/diagram-wasm-export/verify-report.md` | Preserved |
| ADR-0043 | `docs/adr/0043-commands-depends-on-format-for-idmap-storage.md` | Created (apply phase) |
| ROADMAP | `docs/ROADMAP.md` | Updated (v0.5.3, export_drawio ✅) |

## Knowledge Updates

| Knowledge | Action | Notes |
|-----------|--------|-------|
| ADR-0014 (format → core only) | ✅ Confirmed | Not violated — governs outgoing deps, not incoming |
| ADR-0017 (thin WASM adapter) | ✅ Confirmed | `export.rs` mirrors `import.rs`, no format logic in wasm |
| ADR-0023 (engine-owned stable IDs) | ✅ Confirmed | IdMap stored in Editor (engine side) |
| ADR-0024 (preserve-unknown) | ✅ Confirmed | Import path preserved; domain→raw lossy (v1 scope) |
| ADR-0040 (WASM dep clarification) | ⚠️ Superseded (clause) | L36-37 "revisit with ADR" clause → ADR-0043 is that revisit |
| ADR-0043 (commands→format for IdMap) | ✅ Promoted to durable | New decision documented and code-verified |
| IdMap discard in import.rs | ✅ Fixed | Now passes `Some(id_map)` to `replace_model` |
| ESLint `Buffer` no-undef | 🔲 Deferred | Non-functional; fix in follow-up chore commit |
| IdMap staleness (U3) | 🔲 V2 scope | Entities added via commands after import get synthetic IDs or diagnostics |

## Entropy Trend

| Metric | Value | Trend |
|--------|-------|-------|
| Existing change entropy | **Low** → **Low** | Additive `Option<IdMap>` field, mirror of import pattern |
| New connascence | 1 edge `commands→format` | **STABLE** — CoT data struct, not behavior; ADR-0043 bounds it |
| Connascence of Type (IdMap) | **Low** | Pure data (BTreeMaps); concrete dep acceptable |
| Connascence of Literal (`ExportFailed:`) | **Low** | Matches existing `ImportFailed:` pattern |
| Connascence of Value (IdMap staleness) | **Scoped v1** | Documented limitation; entities get diagnostics, not failures |
| DQS (Design Quality Score) | **~0.85 🟢 GOOD** | High — existing write chain complete, small surface, no breaking changes |
| SOLID entropy | **Clean** | SRP ✅ OCP ✅ DIP ⚠️ (acceptable concrete data dep) ISP ✅ |

## Risks

| Risk | Status | Mitigation |
|------|--------|------------|
| `commands → format` dep | ✅ RESOLVED | ADR-0043 justifies; clean DAG; no cycle |
| IdMap staleness after edits | 🔲 ACCEPTED (v1) | v2 scope — entities skipped with diagnostics |
| ESLint `no-undef` on `Buffer` | ⚠️ OPEN | Fix ESLint config for e2e test files (follow-up) |
| `Box::leak` on error strings | ✅ ACCEPTED | Existing pattern; ~100 bytes per error |

## Next Recommended

**new change** — proceed to `diagram-routing` (connector routing) or `diagram-layout` (layout algorithms) as the next chained milestone per ROADMAP. Both require upstream study (ADR-0029).

Alternatively, address the ESLint `Buffer` warning as a follow-up chore before starting the next feature.

## PR Details

| Field | Value |
|-------|-------|
| Branch | `feat/diagram-wasm-export` |
| Base | `main` |
| Title | `feat(wasm): add export_drawio to WASM bridge, Save .drawio button` |
| Commits | 7 atomic commits covering Editor IdMap, WASM export, TS session, UI button, tests, ADR, and polish |
| Test count | 245 Rust + 83 Vitest + 5 E2E (4 new export + 1 lint fix) |

---
*Archived by `sdd-kernel-archive` on 2026-06-19*
