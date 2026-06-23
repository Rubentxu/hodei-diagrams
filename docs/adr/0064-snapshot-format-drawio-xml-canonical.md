# ADR-0064: Snapshot format = drawio XML canonical (supersedes ADR-0048 §1)

**Date:** 2026-06-23
**Status:** Accepted
**Supersedes:** ADR-0048 §1 (version history snapshot serialization)
**Ownership:** Web Shell team

## Context

Version history (ADR-0048 §1) stores snapshots of `DiagramModel`. The original ADR left the serialization format open: "timestamp + model serialization + optional label". We need to make a concrete decision before building the timeline UI.

## Decision

Each version history snapshot is stored as a **canonical `.drawio` XML string** — the same format that `export_drawio` produces.

The snapshot blob is:
```
{ timestamp: ISO-8601, label: Option<String>, xml: String }
```

Where `xml` is the output of `export_drawio(engine)` using a **synthesized `IdMap`** (sequential IDs `v0`, `v1`, …, `e0`, `e1`, …, `g0`, `g1`, …). This ensures snapshots are self-contained and do not depend on any import-time ID mapping.

## Rationale

| Option | Rejected because |
|--------|-----------------|
| `serde` JSON of `DiagramModel` | Web shell would need `DiagramModel` in JS — tight coupling to engine internals; IndexedDB blob is not human-readable |
| Custom JSON schema | Extra work; not interoperable with draw.io |
| **Canonical `.drawio` XML** | Human-readable; re-importable by any draw.io-compatible tool; leverages existing `export_drawio` code path |

The synthesized `IdMap` ensures that even a fresh engine (no import context) can produce a valid export for snapshot purposes.

## Q10 Cross-Tab Synchronization — Deferred

Cross-tab synchronization (ADR-0048 §1 Q10: "restore from tab A visible in tab B") is deferred to a follow-up ADR. This ADR covers single-tab snapshot storage only.

## Consequences

- **Positive**: Snapshots are portable — copy the XML, open in draw.io, works.
- **Positive**: `export_drawio` with synthesized ID map is the only new engine primitive needed.
- **Negative**: Synthesized IDs lose the original `.drawio` ID → engine ID mapping. Snapshots taken from imported files do not preserve the original cell IDs.

## References

- ADR-0048: Deferred Innovations — Version History, Properties, Presentation Mode (superseded §1)
- ADR-0023: Use engine-owned stable IDs with external ID mapping
- ADR-0063: `<mxfile vars>` Metadata Storage Format
- `crates/diagram-format-drawio/src/mapping.rs` — `synthesize_id_map()`
- `crates/diagram-wasm/src/export.rs` — `export_with_synthesized_id_map()`
