# ADR-0083: Scene Projection Emits Perimeter-Inclusive `PathElement.points`

**Date:** 2026-07-21
**Status:** Accepted
**Owners:** diagram-scene, web-shell

## Context

`diagram-scene::builder::project_edge` (since v0.50.0) emits
`PathElement.points = edge.waypoints.to_vec()`. A code-level comment at
`builder.rs:546-548` states:

> Waypoints from the routing engine already start at the source perimeter
> and end at the target perimeter. Do NOT prepend/append vertex centers.

**No routing engine exists in the codebase.** `diagram-routing` provides
`insert_orthogonal_bend` and pure helpers, but no engine that materialises
perimeter-inclusive paths. Waypoints come from two sources, both interior-only
by construction:

1. draw.io import (`diagram-format-drawio/src/mapping.rs`) — copies
   `<Array as="points">` verbatim. draw.io's XML convention is interior-only;
   perimeter points are computed at render time from `exitX/entryY` anchors.
2. `insert_bend`/`move_bend`/`remove_bend` (`diagram-wasm/src/layout.rs`) —
   build a full path, mutate, then strip endpoints before committing via
   `set_edge_waypoints`.

The r110 explore-report empirically confirmed (Playwright scene dump) that a
2-bend edge produces `PathElement.points = [{150,250}, {250,80}]` — interior
only. The SVG renderer then draws `M 150 250 L 250 80`, a disconnected floating
segment that does not touch source (100,100) or target (300,200). The bend
overlay's `for (i=1; i < pts.length - 1; i++)` yields zero iterations when
`pts.length === 2`, so no `.bend-handle` elements are created. BEND-001 and
EDGE-014 were marked `test.fixme` in r109 pending this fix.

The v0.50.0 decision was code-level only — no formal ADR file exists. This
ADR records the corrected semantic and the rationale for overturning it.

## Decision

`project_edge` materialises perimeter-inclusive paths:

```rust
let mut points = Vec::with_capacity(edge.waypoints.len() + 2);
points.push(from);                              // source vertex center
points.extend(edge.waypoints.iter().copied());  // interior bends
points.push(to);                                // target vertex center
```

**Storage remains interior-only.** `Edge.waypoints` in `diagram-core` is
unchanged (preserves draw.io round-trip fidelity per ADR-0044). Only the
projection layer adds endpoints.

**v1 uses vertex centers** as source/target points. Anchor-aware perimeter
projection (honoring `exitX/entryY` styles → perimeter intersection point)
is deferred to r111+.

## Consequences

### Positive

- SVG renderer draws connected paths by construction — the "floating segment"
  rendering bug is resolved as a side effect, no renderer change needed.
- Bend overlay's `for (i=1; i < pts.length - 1; i++)` iteration is correct
  without any TS change.
- Future WebGPU renderer (ADR-0076) inherits the correct contract.
- Hit-testing on `PathElement` (element.rs) becomes accurate.
- Aligns with the canonical draw.io reference (AGENTS.md §14): perimeter
  points are a render-time projection, not stored data.

### Negative

- 3 existing Rust tests encode the v0.50.0 wrong assumption and must be
  inverted (verified count; not the explore's initial "7-8" estimate):
  - `integration_path_element.rs:135 edge_path_does_not_prepend_append_centers`
    → `edge_path_prepends_from_center_appends_to_center`
  - `integration_path_element.rs:196 edge_with_single_waypoint_produces_path_element`
    → `edge_with_single_waypoint_produces_3_point_path`
  - `builder.rs:1199 build_edge_with_waypoints_produces_path_element`
    → `build_edge_with_waypoints_produces_perimeter_inclusive_path`
- Any external consumer that depends on the old projection shape (interior-
  only `points`) must update. Internal audit found none beyond the 3 tests.

## Supersedes

v0.50.0 code-level decision at `builder.rs:546-548` + test name
`edge_path_does_not_prepend_append_centers`. No formal ADR-0050 file exists;
this is the first formal ADR on `PathElement.points` shape.

## References

- ADR-0044 — routing architecture (data vs algorithm); names `diagram-scene`
  as the waypoint consumer.
- ADR-0072 — edge routing UI v1 (orthogonal bend editing).
- ADR-0076 — deferred WebGPU renderer (future beneficiary).
- r109 verify-report — deferred BEND-001/EDGE-014 with wrong "engine
  limitation" hypothesis.
- r110 explore-report — empirical Playwright dump that refuted r109.
- r110 proposal — Approach A selected, B and C rejected with rationale.
