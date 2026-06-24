# ADR-0070: Grid Layout (Hodei-Original Algorithm)

**Date:** 2026-06-24  
**Status:** Accepted  
**Ownership:** diagram-layout crate

## Context

The [ROADMAP](docs/ROADMAP.md) identifies "Grid / Table Layout" as a layout engine to implement.
Tree (ADR-0067), Organic (ADR-0068), and Circular (ADR-0069) established the parallel-struct
pattern for non-hierarchical layouts.

**Critical finding (per explore-report):** `mxGridLayout.js` does NOT exist in jgraph/draw.io
or jgraph/jgraphx. The Arrange > Grid menu entry does not exist in draw.io. This is a
**Hodei-original algorithm**, not a port.

## Decision

Add `GridLayout` in `grid.rs` mirroring `CircularLayout` pattern.
Cumulative-offset two-pass placement. `Rect.origin` = top-left.
Reuse `TreeLayoutResult`. Empty page returns `Err(NoVertices)` matching circular.
`num_columns = 0` clamped to 1.

## Key Design Decisions

1. **Output type**: Reuse `TreeLayoutResult` (no new `GridLayoutResult` — adds
   connascence for zero benefit per ADR-0067).

2. **Config not embedded**: `GridLayoutConfig` is a separate struct. Embedding is a
   separate cross-cutting refactor (matches organic/circular precedent).

3. **Empty-page contract**: `Err(LayoutError::NoVertices)` — matches circular.

4. **Auto-calc formula**: `cols = ceil(sqrt(n))` — Hodei-original convention, not from
   draw.io (which has no grid layout).

5. **Cumulative-offset sizing**: `col_x_offset[c] = margin_x + Σ_{c'<c}(col_max_w[c'] + spacing_x)`;
   avoids overlap for heterogeneous column widths. Rejects the naive per-vertex formula
   (`col * (cell_w + spacing_x)`) which would cause overlap.

6. **`Rect.origin` convention: top-left**. Deliberate Hodei-original choice. Correct for
   the WASM `result_to_transaction` mapper. Differs from circular/organic (which store
   center coords and trigger W1 latent bug). **Grid is correct; fix for circular/organic
   is a follow-up.**

7. **Config defaults**: `spacing_x/y = 20.0`, `margin_x/y = 10.0` (tighter than the
   spec's 30/30, 0/0 — user decision).

8. **No `reset_edges` / `disable_edge_style` in v1**: Deferred; v2 can add.

9. **Defensive clamp**: `num_columns = Some(0)` → `cols = 1`.

## Algorithm Details

Two-pass cumulative-offset placement:

1. Collect page vertices, collect `(width, height)` (default `(120, 60)` for
   zero-geometry).
2. Compute `cols`: if `num_columns == Some(k)` → `max(1, k)`; else → `ceil(sqrt(n))`.
3. Compute `rows = ceil(n / cols)`.
4. Build `col_max_w[cols]` and `row_max_h[rows]`: for vertex i, `col = i % cols`,
   `row = i / cols`; update `col_max_w[col].max(w)` and `row_max_h[row].max(h)`.
5. Cumulative offsets:
   - `col_x_offset[0] = margin_x`
   - `col_x_offset[c] = col_x_offset[c-1] + col_max_w[c-1] + spacing_x`
   - `row_y_offset[0] = margin_y`
   - `row_y_offset[r] = row_y_offset[r-1] + row_max_h[r-1] + spacing_y`
6. For vertex i: `col = i % cols`, `row = i / cols`;
   `Rect { origin: (col_x_offset[col], row_y_offset[row]), size: (w, h) }`.
7. Reset edge waypoints to empty.
8. Call `compute_group_bboxes(store, page_id, &positions, 10.0)` (4th caller of the
   shared utility).
9. Return `TreeLayoutResult`.

## Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `num_columns` | `None` | Auto-calc `ceil(sqrt(n))` |
| `spacing_x` | 20.0 | Horizontal gap between columns |
| `spacing_y` | 20.0 | Vertical gap between rows |
| `margin_x` | 10.0 | Left margin |
| `margin_y` | 10.0 | Top margin |
| `GROUP_PADDING` | 10.0 | Group bbox padding |

## Consequences

**Positive:**
- Deterministic O(n) grid layout with no vertex overlap (even with heterogeneous sizes).
  `apply_layout_kind(LayoutKind::Grid, ...)` provides single entry point.
- `compute_group_bboxes` shared utility now has 4 callers (tree, organic, circular, grid) —
  no algorithm connascence, name-only coupling.
- Top-left `Rect.origin` is correct for WASM mapper — avoids W1 latent bug present in
  circular/organic.
- Zero WASM surface changes — serde auto-dispatches `"Grid"` through the existing
  `apply_layout(handle, kind_json, config_json)` export.

**Negative:**
- `GridLayoutConfig` not yet WASM-configurable (same gap as organic/circular — follow-up
  cross-cutting refactor).
- `compute_group_bboxes` receives top-left coords but treats them as centers internally —
  group bboxes are offset by `(-w/2, -h/2)` from visually-correct location. Deferred to
  follow-up affecting all 4 callers.

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| Uniform cell size per vertex | Overkill for v1; Hodei-original uses max-per-col/row |
| Per-vertex cell formula (`col * (cell_w + spacing_x)`) | Causes overlap when column widths differ; the cumulative-offset approach is necessary |
| `Ok(empty)` for empty page | Matches circular/organic error convention; `Err(NoVertices)` is more explicit |
| New `GridLayoutResult` type | Adds connascence with no benefit; `TreeLayoutResult` is the shared non-hierarchical output |

## Open Questions

1. **`compute_group_bboxes` coord semantics** — Grid passes top-left, utility expects centers,
   bbox offset by `(-w/2, -h/2)`. Deferred to follow-up affecting all 4 callers.

2. **W1 latent bug** — RESOLVED by ADR-0071. Grid is correct (top-left origin);
   circular and organic now write top-left after the fix.

3. **`GridLayoutConfig` not embedded in `LayoutConfig`** — cross-cutting refactor deferred
   (matches organic/circular precedent).

4. **Fixed uniform cell size mode** — v2 enhancement.

5. **Sub-grid awareness for groups** — v2 enhancement.

## References

- `crates/diagram-layout/src/grid.rs`
- `config.rs`, `tree.rs`, `lib.rs`, `error.rs`
- ADR-0067, ADR-0068, ADR-0069, ADR-0045
- Hodei-original (no draw.io upstream)
