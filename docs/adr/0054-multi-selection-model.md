# ADR-0054: Multi-Selection Model

**Date:** 2026-06-20
**Status:** Accepted
**Context:** Plan de paridad funcional con draw.io (Fase 2)

## Decision

The web-shell selection model changes from `SlotmapId | null` to
`Set<SlotmapId>`, with these rules:

### Model

```ts
class Editor {
  #selection: Set<SlotmapId> = new Set();
  // Single selection is just a Set of size 1 (or 0)
}
```

### Selection interactions

| Action | Effect |
|---|---|
| Click shape | Replace selection with that shape |
| Shift+click shape | Toggle shape in selection |
| Cmd/Ctrl+click shape | Add shape to selection |
| Click empty area (no modifier) | Clear selection |
| Marquee drag on empty area | Select all shapes intersecting the rect |
| Escape | Clear selection |
| Delete | Remove all selected (in one transaction) |

### Move semantics

A `moveSelection(dx, dy)` action generates one `MoveVertex` command **per
selected shape** and groups them in a single `Transaction` so undo reverts
the whole move atomically.

### Render

- Each selected shape gets the `class="selected"` attribute.
- A marquee selection rectangle is rendered as an SVG `<rect>` overlay
  during the drag, with `class="marquee"`.

### Engine contract

The engine **does not know about selection**. The shell computes the
batch of `MoveVertex` commands and wraps them in a `Transaction`. This
keeps the engine selection-agnostic and undo atomicity in one place.

## Rationale

- `Set<SlotmapId>` subsumes the current `SlotmapId | null` (a Set of size
  0 or 1 behaves the same way). The change is additive.
- Per-shape commands + transaction = atomic undo, no new engine state.
- Selection lives entirely in the shell, matching the existing rule that
  the engine never owns client-side state.

## Consequences

- **Positive**: User can move/delete/align/copy many shapes at once.
- **Positive**: Undo/redo of batch operations is atomic.
- **Positive**: Engine surface stays small — no selection concept added.
- **Negative**: Web-shell `Editor` class grows in complexity.
- **Negative**: Need to be careful about race conditions (race between
  selection and incoming command result).
- **Negative**: Performance: 100+ selected shapes → 100 commands per
  drag. Mitigated by future batch command `MoveVerticesCommand`.

## References

- ADR-0042: Web Shell Editor Surface
- `web-shell/src/editor.ts` (current `selectedId` field)
- `crates/diagram-commands/src/history.rs` (existing Transaction)
