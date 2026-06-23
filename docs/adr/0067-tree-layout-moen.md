# ADR-0067: Tree Layout with Moen Algorithm

**Date:** 2026-06-23
**Status:** Accepted
**Ownership:** diagram-layout crate

## Context

The diagram engine needs a tree layout algorithm for hierarchical data (org charts, decision trees, file system views). The existing `HierarchicalLayout` implements Sugiyama's algorithm which is designed for general DAGs with crossing reduction — overkill for strict trees and produces different visual results than draw.io's compact tree mode.

During the grill session (Q1–Q30), we evaluated three options: reuse `HierarchicalLayout`, port `mxCompactTreeLayout.js` directly, or implement a new algorithm from scratch.

## Decision

Implement the **Moen (Compact Tree) algorithm** as a new `TreeLayout` struct in `diagram-layout`, parallel to `HierarchicalLayout`.

### Key Design Decisions

1. **Strict validation as conscious draw.io divergence**: Unlike `HierarchicalLayout` which removes cycles and handles multiple roots, `TreeLayout` returns typed errors (`MultipleRoots`, `CycleDetected`, `MultipleParents`, `NoRoot`) for invalid trees. This is intentional — tree layouts only make sense for valid trees, and surfacing typed errors enables better UI feedback than silent layout with unexpected results.

2. **`LayoutKind` enum for generic API**: A new `#[non_exhaustive] LayoutKind { Hierarchical, Tree }` enum enables future dispatch to either algorithm via `apply_layout_kind(kind, config, store, page_id)`.

3. **`TreeLayoutResult` shape**: Returns `(VertexId, Rect)` positions, `(EdgeId, Vec<Point>)` waypoints, and `(GroupId, Rect)` group bounding boxes. The store is never mutated directly — callers must map results into a `Transaction`.

4. **New reversible commands**: `MoveGroupPayload` and `SetEdgeWaypointsPayload` were added to `diagram-commands` to support group bounding-box updates and edge jetty routing respectively. Both implement apply/undo symmetry.

5. **Group bounding-box resize (`adjust_parents`)**: Groups are sized to contain all child vertices and nested groups, with `GROUP_PADDING = 10.0` hardcoded (draw.io default). Groups with no children on the page are skipped.

### Algorithm Details

The Moen algorithm (ported from `mxCompactTreeLayout.js`) operates in 7 stages:

1. `validate_tree` — strict validation (single root, acyclic, single-parent per vertex)
2. `build_tree_nodes` — DFS build of `TreeArena` following outgoing edges
3. `first_walk` — bottom-up contour merge (`layoutLeaf`, `join`, `merge`, `attachParent`)
4. `second_walk` — top-down offset accumulation
5. `apply_coordinates` — write positions based on direction
6. `local_edge_processing` — jetty routing for edge waypoints
7. `adjust_parents` — group bounding-box recalculation

### Constants (draw.io defaults, revisit if parity drift surfaces)

| Constant | Value | Purpose |
|----------|-------|---------|
| `MIN_EDGE_JETTY` | 8.0 | Minimum jetty length |
| `PREF_HOZ_EDGE_SEP` | 5.0 | Preferred horizontal separation between jetty exit points |
| `GROUP_PADDING` | 10.0 | Padding around group contents |

## Consequences

- **Positive**: Compact tree layout matching draw.io visual output for hierarchical data.
- **Positive**: Typed validation errors enable better UX than silent failure.
- **Positive**: `#[non_exhaustive]` `LayoutKind` future-proofs dispatch for future algorithms (Organic, Circular, Grid).
- **Positive**: `apply_layout_kind` WASM export provides a single entry point for all layout algorithms.
- **Negative**: New algorithm increases crate surface; `LayoutKind` dispatch must be maintained.
- **Negative**: `GROUP_PADDING = 10.0` hardcoded — may need configuration later.

## Alternatives Considered

| Alternative | Rejected because |
|------------|------------------|
| Reuse `HierarchicalLayout` | Different visual result; Sugiyama is for general DAGs, not strict trees |
| Implement from scratch | `mxCompactTreeLayout.js` is well-specified and tested in draw.io production |
| Skip group resize | Groups without explicit sizing would appear empty/collapsed |

## References

- `crates/diagram-layout/src/tree.rs` — full algorithm implementation
- `crates/diagram-layout/src/error.rs` — validation error variants
- `crates/diagram-commands/src/payload.rs` — `MoveGroupPayload`, `SetEdgeWaypointsPayload`
- `crates/diagram-wasm/src/layout.rs` — `apply_layout` WASM export
- ADR-0045: Layout Architecture (Sugiyama pipeline)
- ADR-0044: Routing Architecture (Data vs Algorithm)
