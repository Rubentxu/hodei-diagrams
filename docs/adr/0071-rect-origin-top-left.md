# ADR-0071: Rect.origin Top-Left Convention

**Date:** 2026-06-24
**Status:** Accepted
**Ownership:** diagram-layout crate

## Context

`Rect.origin` is documented as "top-left corner" in `crates/diagram-core/src/geometry.rs:74`. The WASM Transaction applier (`crates/diagram-wasm/src/layout.rs:16-27`) treats `origin` as top-left and passes it directly to `CellGeometry.x/y`. The scene builder consumes `CellGeometry` as top-left coordinates.

Two layout algorithms (`OrganicLayout` and `CircularLayout`) were storing center coordinates `(cx, cy)` directly into `Rect.origin`, violating the documented contract.

## Decision

**`Rect.origin` is ALWAYS top-left.** No exceptions. All layout algorithms MUST write top-left coordinates into `Rect.origin`.

### Conversion Rule

When a layout algorithm computes vertex positions as center coordinates `(cx, cy)` with size `(w, h)`:

```
Rect.origin.x = cx - w / 2.0
Rect.origin.y = cy - h / 2.0
```

### Algorithm Compliance

| Algorithm | Rect.origin used | Status |
|-----------|----------------|--------|
| `HierarchicalLayout` | top-left | ✅ Correct |
| `TreeLayout` | top-left | ✅ Correct |
| `GridLayout` | top-left | ✅ Correct |
| `OrganicLayout` | ~~center~~ → top-left | ✅ Fixed (this ADR) |
| `CircularLayout` | ~~center~~ → top-left | ✅ Fixed (this ADR) |

## Key Design Decisions

1. **Consumer contract is correct**: `layout.rs` (`rect_to_cell_geometry`) maps `origin.x, origin.y` to `CellGeometry.x, .y` as top-left. No changes needed there.

2. **Producers fixed, not consumers**: The fix is in `organic.rs:144` and `circular.rs:161` — they now write `(cx - w/2, cy - h/2)` instead of `(cx, cy)`.

3. **`compute_group_bboxes` utility**: Receives a `&positions: HashMap<VertexId, (cx, cy)>` — center coordinates — from all callers. Internally does center-to-top-left math for bounding box computation. This is a separate internal contract (not `Rect.origin`). Deferred to ADR-0072.

## Consequences

- **Positive**: `Rect.origin` contract is now clean and uniform across all layout algorithms.
- **Positive**: Organic and Circular vertex positions will appear at the correct visual coordinates (previously offset by `(+w/2, +h/2)`).
- **Negative**: None — this is a pure bug fix with no behavioral trade-off.

## References

- `crates/diagram-core/src/geometry.rs:74` — `Rect.origin` top-left documentation
- `crates/diagram-wasm/src/layout.rs:16-27` — WASM mapper (consumer, unchanged)
- `crates/diagram-layout/src/organic.rs:144` — fixed
- `crates/diagram-layout/src/circular.rs:161` — fixed
- ADR-0067, ADR-0068, ADR-0069, ADR-0070
