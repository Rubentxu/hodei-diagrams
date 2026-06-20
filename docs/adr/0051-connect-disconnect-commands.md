# ADR-0051: Connect/Disconnect Commands & Undo Semantics

**Date:** 2026-06-20
**Status:** Accepted
**Context:** Plan de paridad funcional con draw.io (Fase 0)

## Decision

Add two new commands to the engine to formalize edge lifecycle:

### `ConnectVerticesCommand`

```rust
pub struct ConnectVerticesCommand {
    pub from: VertexId,
    pub to: VertexId,
    pub routing_kind: RoutingKind, // default: Orthogonal
}
```

- `apply`: insert edge with the given routing kind, run router
- `undo`: remove the edge by its freshly-assigned id
- Emits a `RouteEdges` event so the scene re-projects

### `DisconnectEdgeCommand`

```rust
pub struct DisconnectEdgeCommand {
    pub edge: EdgeId,
}
```

- `apply`: remove edge from store
- `undo`: re-insert the captured edge (full state, including waypoints)

## Rationale

- The current `AddEdge` payload requires a pre-built `Edge` value. That's
  fine for programmatic creation but the UI needs to send `(from, to,
  routing_kind)` and have the engine build the rest.
- Splitting connect/disconnect from generic add/remove makes the command
  names match the user actions.
- Undo must restore edge state, including any waypoints computed by the
  router, so redo re-renders identically.

## Consequences

- **Positive**: UI sends minimal payloads. The engine owns edge construction.
- **Positive**: Undo/redo of connections is symmetric and complete.
- **Positive**: Routing happens at command time, not at render time, so
  the scene is always in sync with the routed shape.
- **Negative**: Requires changes to `diagram-commands` and `diagram-wasm`
  surface. Mitigated by adding alongside the existing `AddEdge`.

## References

- ADR-0044: Routing Architecture
- ADR-0050: Edge Creation UX Contract
- `crates/diagram-commands/src/payload.rs` (existing `AddEdgePayload`)
