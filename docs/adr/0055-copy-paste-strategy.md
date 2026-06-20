# ADR-0055: Copy/Paste Strategy

**Date:** 2026-06-20
**Status:** Accepted
**Context:** Plan de paridad funcional con draw.io (Fase 2)

## Decision

Copy/paste uses a **two-layer strategy**:

### Internal clipboard (always works)

The web-shell keeps an internal `Clipboard` object that holds serialized
copies of `Vertex` and `Edge` payloads.

```ts
class Clipboard {
  vertices: Vertex[];   // deep-cloned from the source model
  edges: Edge[];        // with remapped IDs
  // ... future: groups, styles
}
```

Paste generates **new** `VertexId`/`EdgeId` values via the engine and
re-creates the shapes with a 20px offset to make the paste visible.

### System clipboard (v2)

Phase 2 adds a system-clipboard integration via the browser's Clipboard API:

```ts
navigator.clipboard.writeText(JSON.stringify(clipboard));
navigator.clipboard.readText();
```

This makes paste work across browser tabs and enables integration with
external tools (Excel rows → shapes, etc.).

## Rationale

- Internal clipboard ships first because it requires zero browser
  permission and works in all contexts.
- System clipboard is a v2 enhancement because the browser API has
  quirks (Safari iOS requires user gesture, Firefox permissions vary).
- ID remapping on paste is mandatory: pasting the same payload twice must
  produce two distinct sets of shapes.

## Consequences

- **Positive**: Copy/paste works in v1 with no browser dependencies.
- **Positive**: Engine surface stays unchanged — paste reuses
  `AddVertex`/`AddEdge` with cloned payloads.
- **Positive**: Pasting across browser tabs works in v2.
- **Negative**: Style references need care: pasted shapes share style
  IDs by default; the engine must deep-copy or remap.
- **Negative**: Edge references need care: pasted edges must reference
  pasted vertex IDs, not the originals.

## References

- ADR-0054: Multi-Selection Model
- ADR-0005: Command-Driven Engine
- `crates/diagram-commands/src/payload.rs` (`AddVertexPayload`,
  `AddEdgePayload`)
