# ADR-0056: Inline Text Editing UX

**Date:** 2026-06-20
**Status:** Accepted
**Context:** Plan de paridad funcional con draw.io (Fase 3)

## Decision

Inline label editing uses a **DOM overlay input** that replaces the visible
label during editing.

### Trigger

- Double-click on a shape enters label edit mode
- Double-click on a label (TextElement) directly enters edit mode for that
  label
- Pressing `F2` on a single selected shape enters label edit mode
- Pressing `Enter` while a shape is single-selected enters label edit mode

### Edit behavior

| Event | Action |
|---|---|
| Initial focus | Select all current text |
| `Enter` (no Shift) | Commit and exit |
| `Shift+Enter` | Insert newline, stay in edit mode |
| `Escape` | Cancel and restore previous text |
| Blur (click outside) | Commit and exit |
| Empty text committed | Engine allows empty label (no-op visual) |
| `200ms` debounce | Send `EditVertexLabel` command (prevents spam) |

### Visual

- `<input>` overlay positioned absolutely over the shape, sized to the
  shape's bounds
- Uses the same font and color as the shape's resolved style
- Border and background indicate edit mode

### Engine contract

The engine already has `EditVertexLabel` command. No new command needed.

## Rationale

- Double-click is the universal pattern (draw.io, Figma, every diagram
  tool). Reusing it minimizes cognitive load.
- DOM overlay input keeps the editor free of text-editing complexity in
  the SVG; native input handles IME, paste, undo, etc.
- Debounced dispatch avoids one command per keystroke, which would
  pollute the undo stack.

## Consequences

- **Positive**: 6 currently-skipped E2E tests can run.
- **Positive**: Native input handles IME correctly.
- **Positive**: No engine changes required.
- **Negative**: Overlay input must be positioned precisely over the shape;
  requires careful coordinate mapping.
- **Negative**: Multi-line editing requires either height-grow input or
  separate dialog. v1 supports `Shift+Enter` for newlines; full multi-line
  editing is deferred.

## References

- `crates/diagram-commands/src/command.rs` (existing `EditVertexLabel`)
- `web-shell/tests/e2e/text-editing.spec.ts` (skipped tests to enable)
- ADR-0042: Web Shell Editor Surface
