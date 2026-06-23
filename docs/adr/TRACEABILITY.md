# ADR Traceability Report

Generated from OpenCode session database (`~/.local/share/opencode/opencode.db`).

## Source

**Session**: `ses_125ea882cffeN1l3yZ2GKFgDku` — "Sesión grill-with-docs sobre draw.io en Rust"
**Date**: 2026-06-18 11:35 UTC
**Parts analyzed**: 2646 text parts (user + assistant messages)
**Evidence method**: Keyword matching against decision markers, verified by manual spot-check

## Coverage

| Status | Count | ADRs |
|--------|-------|------|
| ✅ Direct conversation evidence | 11 | 0001-0007, 0010, 0020, 0023 |
| ⚠️ Inferred from broader context + code | 2 | 0008, 0009, 0012 |
| 📋 Derived from codebase/SDDK artifacts | 21 | 0011, 0013-0019, 0021-0022, 0024-0031, 0064-0066 |

## Key Decision Moments (verified)

| Timestamp | Decision | Mapped to ADR |
|-----------|----------|---------------|
| 11:37:17 | "port semántico compatible con .drawio" vs "reimplementación libre" | 0001 |
| 11:39:21 | "Behavioral Reference" as truth source | 0006 |
| 11:39:52 | "typescript minima" for web shell | 0002 |
| 11:40:31 | "SVG primero, WebGPU después" | 0003 |
| 11:45:14 | "comandos/eventos pequeños + buffers compartidos" for WASM | 0004 |
| 11:47:07 | "comandos como fuente de cambio" over "mutaciones directas" | 0005 |
| 11:49:41 | User asks about Redux in Rust → evaluated and rejected literal Redux | 0005 |
| 12:07:30 | Crate matrix with specific dependency lists | 0010 |
| 12:08:17 | "última estable" rule for crate versions | 0010 |

## ADR Cross-Reference Links

| From | To | Relationship |
|------|----|--------------|
| 0064 | 0048 | Supersedes §1 (version history snapshot serialization) |
| 0064 | 0023 | Synthesized IdMap (engine-owned stable IDs) |
| 0064 | 0063 | Snapshot metadata uses `vars` format |
| 0065 | 0047 | Amends Zone 5 placement |
| 0066 | 0041 | First runtime dependency in web-shell toolchain |

## Note on ADRs 0008, 0009, 0012

These decisions emerged from the overall architectural structure established during the session rather than explicit "choose A or B" grill questions. ADR-0008 (import-first) is implicit in the Semantic Port strategy (0001). ADR-0009 (Rust-native model) is the logical consequence of choosing Rust as the engine language. ADR-0012 (core/commands separation) emerged from the crate matrix discussion (0010) and was formalized later during SDDK cycles.

## ADRs 0011, 0013-0019, 0021-0022, 0024-0031

These are implementation-phase ADRs derived from:
- The codebase itself (`crates/` structure, source files)
- SDDK artifacts (`sddk/*/proposal.md`, `design.md`, `tasks.md`)
- Cross-references from the foundational ADRs (0001-0012)
- The AGENTS.md rules and ROADMAP.md milestones

Their content is traceable to specific files and commit history, documented in each ADR's References section.
