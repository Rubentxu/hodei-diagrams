# ADR-0058: Layer/Ordering Model

**Date:** 2026-06-20
**Status:** Accepted
**Context:** Plan de paridad funcional con draw.io (Fase 5)

## Decision

The engine uses an **explicit z-order field** rather than relying on
insertion order:

### Data shape

```rust
pub struct Vertex {
    pub geometry: Option<CellGeometry>,
    pub label: Option<Label>,
    pub page_id: Option<PageId>,
    pub style_id: Option<StyleId>,
    pub z_order: i32,        // new, default 0
    pub locked: bool,        // new, default false
    pub visible: bool,       // new, default true
}
```

Same fields added to `Edge` and `Group` for consistency.

### Z-order semantics

- Higher `z_order` renders on top
- Ties broken by `id` (stable order)
- New shapes get `z_order = max(all) + 1` automatically

### Commands

- `BringToFrontCommand { id }` — sets `z_order = max + 1`
- `SendToBackCommand { id }` — sets `z_order = min - 1`
- `BringForwardCommand { id }` — swap with next-higher
- `SendBackwardCommand { id }` — swap with next-lower

### Lock and visibility

- `locked`: editor cannot select or modify the shape. Rendering unchanged.
- `visible`: shape is excluded from the scene entirely. Pure display.

### Display list ordering

The scene builder sorts the display list by `(z_order, id)` before
rendering. The scene exposes a stable order; the renderer does not need
to know about z-order.

## Rationale

- draw.io uses explicit z-order, not insertion order. Z-order is more
  predictable and survives undo/redo.
- `locked` and `visible` are essential for protecting layout during
  presentations and for hiding guides/backgrounds.
- Keeping these on the shape itself (vs a separate layer table) avoids
  a new aggregate and keeps the model simple.

## Consequences

- **Positive**: Predictable z-order; no surprise re-ordering on undo.
- **Positive**: Locked shapes cannot be accidentally moved.
- **Positive**: Hidden shapes are cheap to exclude (skip in scene).
- **Negative**: Three new fields on every shape increases memory per
  shape by ~16 bytes. Negligible.
- **Negative**: Inspector tab "Behavior" needs UI for lock/visibility.
  Deferred if needed.
- **Negative**: Bottom panels (layers panel) is a separate UI surface.
  Deferred if not prioritized.

## References

- `crates/diagram-core/src/vertex.rs` (existing `Vertex`)
- `crates/diagram-core/src/edge.rs` (existing `Edge`)
- `crates/diagram-core/src/group.rs` (existing `Group`)
- `crates/diagram-scene/src/builder.rs` (existing projection order)
