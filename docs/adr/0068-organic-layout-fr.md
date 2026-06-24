# ADR-0068: Organic Layout with Fruchterman-Reingold Algorithm

**Date:** 2026-06-24
**Status:** Accepted
**Ownership:** diagram-layout crate

## Context

The diagram engine needs a force-directed layout algorithm for cyclic and disconnected graphs. The existing `TreeLayout` only handles strict trees (single root, acyclic, single-parent), and `HierarchicalLayout` produces hierarchical DAG layouts — neither handles arbitrary graph topologies.

During the grill session (Q1–Q30), we evaluated three options: reuse existing layouts with cycle-removal preprocessing, port `mxFastOrganicLayout.js` directly, or implement a new algorithm from scratch.

## Decision

Implement the **Fruchterman-Reingold (FR) force-directed algorithm** as a new `OrganicLayout` struct in `diagram-layout`, parallel to `TreeLayout` and `HierarchicalLayout`.

### Key Design Decisions

1. **`OrganicLayoutConfig` embedded in `LayoutConfig`**: Via `#[serde(default)] pub organic: Option<OrganicLayoutConfig>`. This is non-breaking — callers without config get defaults.

2. **`TreeLayoutResult` shape**: Reuses the same return type as `TreeLayout` for positions, waypoints, and group bounding boxes. The odd name for a non-tree algorithm is accepted for v1 to avoid a new type.

3. **`compute_group_bboxes` shared utility (entropy-sdd mandate)**: The group bounding-box logic was extracted from `tree::adjust_parents` into a `pub(crate)` function that both `tree` and `organic` modules call. This avoids algorithm connascence — the bounding-box logic is identical regardless of layout algorithm.

4. **`reset_edges` → clear waypoints**: When `true` (default), edge waypoints are cleared (straight lines). When `false`, waypoints are preserved (future: simple straight-line fallback in v1).

5. **`disable_edge_style` → no-op**: The FR algorithm does not modify edge styles. This is a no-op for v1, deferred to routing layer (ADR-0044).

6. **`max_iterations = 0` → auto-calc**: Formula matches mxFastOrganicLayout.js: `20 * sqrt(n)` iterations. Behavior parity gate verified in spec.

### Algorithm Details

The FR algorithm (ported from `mxFastOrganicLayout.js`) operates in 5 phases per iteration:

1. `calc_repulsion` — O(n²) pairwise repulsion: `f_r = -k² / d` where `d` is clamped to `[min_dist, max_dist]`
2. `calc_attraction` — O(E) edge attraction: `f_a = d² / k`
3. `calc_positions` — displace each vertex: clamp to `[0, temperature]`, apply in direction of combined force
4. `reduce_temperature` — linear decay: `T_new = T * (1.0 - i / max_iter)`
5. `write_back` — build `Vec<(VertexId, Rect)>` from final positions

### Constants (draw.io defaults, revisit if parity drift surfaces)

| Constant | Value | Purpose |
|----------|-------|---------|
| `force_constant` | 50.0 | Optimal inter-vertex distance `k` |
| `min_distance_limit` | 2.0 | Lower clamp for distance in repulsion |
| `max_distance_limit` | 500.0 | Upper clamp for distance in repulsion |
| `initial_temp` | 200.0 | Starting temperature for displacement |
| `max_iterations` | 0 | Auto-calc: `20 * sqrt(n)` when 0 |
| `reset_edges` | true | Clear waypoints (straight lines) |
| `disable_edge_style` | true | No-op (deferred to routing) |

## Consequences

- **Positive**: Force-directed layout for cyclic/disconnected graphs — no tree validation required.
- **Positive**: Deterministic (no Math.random()) — temperature decay is linear, initial positions come from existing geometry.
- **Positive**: `apply_layout_kind(LayoutKind::Organic, ...)` provides single entry point for all layout algorithms.
- **Positive**: `compute_group_bboxes` shared utility eliminates duplicate logic between tree and organic layouts.
- **Negative**: O(n²) repulsion limits v1 to graphs with <500 vertices. Barnes-Hut acceleration deferred to v2.
- **Negative**: Vertices at exactly the same initial position cause FR singularity (zero forces). Test fixtures use non-overlapping initial positions.

## Alternatives Considered

| Alternative | Rejected because |
|------------|------------------|
| Reuse `HierarchicalLayout` with cycle-removal | Produces hierarchical layout, not force-directed |
| Add randomization to initial positions | Violates deterministic output requirement |
| Barnes-Hut acceleration (O(n log n)) | Deferred to v2 — adds complexity, not needed for <500 nodes |
| Separate WASM entry point | `apply_layout_kind` dispatch is cleaner; single entry point |

## References

- `crates/diagram-layout/src/organic.rs` — full algorithm implementation
- `crates/diagram-layout/src/config.rs` — `OrganicLayoutConfig` struct
- `crates/diagram-layout/src/tree.rs` — `LayoutKind::Organic` dispatch, `compute_group_bboxes` shared utility
- `crates/diagram-layout/src/error.rs` — `LayoutError::NoVertices`
- `crates/diagram-wasm/src/layout.rs` — `apply_layout` WASM export
- ADR-0067: Tree Layout with Moen Algorithm
- ADR-0045: Layout Architecture
- ADR-0044: Routing Architecture (Data vs Algorithm)
