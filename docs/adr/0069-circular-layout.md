# ADR-0069: Circular Layout (mxCircleLayout Port)

**Date:** 2026-06-24  
**Status:** Accepted  
**Ownership:** diagram-layout crate

## Context

The [ROADMAP](docs/ROADMAP.md) identifies "Arrange > Circle" as a needed layout engine.
Tree (ADR-0067) and Organic (ADR-0068) established the parallel-struct pattern for
non-hierarchical layouts. `mxCircleLayout.js` / `.java` is the draw.io upstream source.

## Decision

Add `CircularLayout` in `circular.rs` mirroring `OrganicLayout` exactly.
Separate `CircularLayoutConfig` (not embedded in `LayoutConfig` — matches current organic gap).
Reuse `TreeLayoutResult`. Empty page returns `Err(NoVertices)` matching organic.
Radius computed via `max(n * max_dim / π, config.radius)` to guarantee no vertex overlap.

## Key Design Decisions

1. **Output type**: Reuse `TreeLayoutResult` (no new `CircularLayoutResult` — adds
   connascence for zero benefit per ADR-0067).

2. **Config not embedded**: `CircularLayoutConfig` is a separate struct. Embedding is a
   separate cross-cutting refactor (matches organic precedent).

3. **Empty-page contract**: `Err(LayoutError::NoVertices)` — zero-radius circle is
   meaningless; matches organic, differs from tree (tree returns `Ok(empty)`).

4. **Auto-radius formula**: `max(n * max_dim / π, config.radius)` — `getRadius(n, max_dim)`
   from upstream `mxCircleLayout.js`. Guarantees no vertex overlap regardless of n.

5. **Circle center placement**: `move_circle=true` → `(x0 + r, y0 + r)`;
   `move_circle=false` → `(min_vertex_x + r, min_vertex_y + r)`.

6. **Rect.origin convention**: Center coordinates, mirroring organic (`organic.rs:144`).
   Flagged as a verify-phase check against the WASM Transaction applier — see §Open Questions.

7. **`disable_edge_style` is a v1 no-op**: Our `Edge` struct has no per-style evaluation
   path yet; deferred to routing layer (ADR-0044).

## Algorithm Details

Closed-form O(n), no iteration:

1. Collect page vertices, collect `max_dim = max(width, height)` (default `(120, 60)` for
   zero-geometry).
2. `radius = max(n * max_dim / π, config.radius)`.
3. Compute center from `move_circle` config.
4. For `i in 0..n`: `angle = 2π·i/n`; `cx = center_x + r·cos(angle)`;
   `cy = center_y + r·sin(angle)`.
5. Write `Rect { origin: (cx, cy), size: (w, h) }` per vertex.
6. Reset edge waypoints if `config.reset_edges`.
7. Call `compute_group_bboxes(store, page_id, &positions, 10.0)` (3rd caller of the
   shared utility).
8. Return `TreeLayoutResult`.

## Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `radius` | 100.0 | `mxCircleLayout.radius` |
| `move_circle` | false | `mxCircleLayout.moveCircle` |
| `x0` | 0.0 | `mxCircleLayout.x0` |
| `y0` | 0.0 | `mxCircleLayout.y0` |
| `reset_edges` | true | Clear waypoints (straight lines) |
| `disable_edge_style` | true | v1 no-op (deferred to routing) |

## Consequences

**Positive:**
- O(n) deterministic closed-form layout for circular-arrangement use cases.
  `apply_layout_kind(LayoutKind::Circular, ...)` provides single entry point.
- `compute_group_bboxes` shared utility now has 3 callers (tree, organic, circular) —
  no algorithm connascence, name-only coupling (I=1.58 bit, low).
- Zero WASM surface changes — serde auto-dispatches `"Circular"` through the existing
  `apply_layout(handle, kind_json, config_json)` export.

**Negative:**
- `CircularLayoutConfig` not yet WASM-configurable (same gap as organic — follow-up
  cross-cutting refactor).
- Single-vertex case is a degenerate circle of radius `max_dim / π` — works (finite)
  but visually uninteresting.
- Zero-geometry vertices default to `(120, 60)` size — consistent with organic /
  hierarchical but a `disable_edge_style` field in the config has no observable effect in v1.

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| Embed config in `LayoutConfig` via `#[serde(default)]` Option | Breaks pattern with organic; scope creep (Option C in explore-report) |
| New `CircularLayoutResult` type | Adds connascence with no benefit; ADR-0067 establishes `TreeLayoutResult` as the shared non-hierarchical output |
| `Ok(empty)` for empty page (tree's choice) | Zero-radius circle is meaningless; organic precedent |
| Group nesting-aware sub-circles (v2) | Out of scope per proposal; `compute_group_bboxes` already handles resulting layout correctly |

## Open Questions

1. **`disableEdgeStyle` field mapping** — v1 no-op; deferred to routing layer (ADR-0044).
   Same open question carried from ADR-0068.

2. **`CircularLayoutConfig` not embedded in `LayoutConfig`** — same as organic.
   Cross-cutting refactor deferred.

3. **`TreeLayoutResult` name is misleading for circular output** — name inherited from
   tree-layout precedent; rename to `LayoutResult` is a separate ADR-level change once
   3+ algorithms use it.

4. **Rect.origin convention: center vs top-left** — RESOLVED by ADR-0071.
   `organic.rs` and `circular.rs` now write `Rect.origin = (cx - w/2, cy - h/2)` —
   top-left coordinates. The WASM mapper consumes `origin` as top-left (unchanged).

5. **Group nesting-aware sub-circle layout** — out of scope v1; v2 future change.

## References

- `crates/diagram-layout/src/circular.rs`
- `config.rs`, `tree.rs`, `lib.rs`, `error.rs`
- ADR-0067, ADR-0068, ADR-0045, ADR-0044
- `mxCircleLayout.js` (draw.io upstream) and `mxCircleLayout.java` (jgraphx)
