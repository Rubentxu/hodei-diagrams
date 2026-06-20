# ADR-0060: Snap, Guides, and Alignment

**Date:** 2026-06-20
**Status:** Accepted
**Context:** Plan de paridad funcional con draw.io (Fase 7)

## Decision

Three independent helpers in the web-shell for visual precision:

### Snap to grid

- Toggle: `Ctrl+G` (already bound to grid visibility), `Ctrl+Shift+G` toggles snap
- Threshold: 8px
- Behavior: when dragging, the cursor snaps to the nearest grid line
  within the threshold; otherwise the drag is unconstrained
- No engine changes — pure shell logic

### Snap to other shapes

- Detection: while dragging, compute the X distance to every other
  shape's left/right/center and the Y distance to every other shape's
  top/bottom/center
- If the closest distance is below the threshold, snap the dragging
  shape to align
- Visual: a 1px SVG line in `accent` color shows the alignment

### Guides

- Visible only while a snap is active
- Disappear on drag end
- Up to 2 guides at a time (X + Y)

### Alignment

When 2+ shapes are selected, the right-click menu / Inspector "Arrange"
tab offers:

- Align Left | Center | Right | Top | Middle | Bottom
- Distribute Horizontally | Vertically
- Make Same Width | Same Height | Both

Each operation produces one or more `MoveVertex` / `ResizeVertex`
commands in a single transaction for atomic undo.

## Rationale

- Snap and guides are pure shell logic — the engine has no notion of
  pixels, only user-space units. Keep the concern in the shell.
- Alignment produces multiple `MoveVertex` commands, which the engine
  handles atomically via `Transaction` (already in `history.rs`).
- Visual guides match draw.io's behavior; users expect them.

## Consequences

- **Positive**: Diagrams feel precise and professional.
- **Positive**: Multi-shape alignment unlocks tidy diagrams.
- **Positive**: No engine changes for snap/guides.
- **Negative**: Engine gets a new `ResizeVertex` command for "make same
  width/height". Mitigated by reusing `MoveVertex` for translation and
  extending the geometry payload.
- **Negative**: Performance: 1000+ shapes → 1000+ distance checks per
  drag frame. Mitigated by spatial index (deferred to v2).

## References

- ADR-0054: Multi-Selection Model
- `crates/diagram-commands/src/payload.rs` (existing `MoveVertexPayload`)
- `crates/diagram-commands/src/history.rs` (existing `Transaction`)
