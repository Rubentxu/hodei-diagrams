# ADR-0050: Edge Creation UX Contract

**Date:** 2026-06-20
**Status:** Accepted
**Context:** Plan de paridad funcional con draw.io (Fase 0)

## Decision

Edge creation in the web-shell follows a **two-click connect mode** with these rules:

1. **Activation**: User clicks the Connector tool in the left rail, or presses `C`
2. **Source selection**: First click selects the source shape (highlight with anchor indicator)
3. **Target selection**: Second click on another shape creates the edge
4. **Cancel**: ESC or click on empty space cancels the connect operation
5. **Preview**: A dashed line follows the cursor between clicks
6. **Self-loops**: Clicking the same shape twice is allowed (creates a loop)
7. **Routing**: Uses the default routing kind for the current page (orthogonal v1)

### Interaction state machine

```
IDLE  → (Connector tool active) → SOURCE_SELECTED
SOURCE_SELECTED  → (click target) → IDLE  (creates edge)
SOURCE_SELECTED  → (ESC) → IDLE
SOURCE_SELECTED  → (click source again) → SOURCE_SELECTED
SOURCE_SELECTED  → (click empty) → IDLE
```

### Routing kind on creation

Edges are created with `routing_kind: "orthogonal"` by default. The engine
already supports `straight` and `orthogonal` (ADR-0044). Future: detect port
constraints from the source/target shapes to refine the connection point.

## Rationale

- draw.io uses two-click connect. Matching it is the lowest-friction UX.
- The engine has `AddEdge` and `route_all_edges` already (ADR-0044). We just
  need the UI surface and the command dispatch.
- `orthogonal` is the right default because raw `straight` edges cut through
  other shapes visually.

## Consequences

- **Positive**: The editor becomes a real diagramming tool, not a shape layout.
- **Positive**: Edge creation has a single, predictable interaction.
- **Negative**: Two-click is harder to discover than drag-connect. Mitigated
  by tool highlight and cursor change.
- **Negative**: Self-loops complicate the routing. Mitigated by leaving
  self-loops as `Line` element with a fallback routing.

## References

- ADR-0013: Keep Layout and Routing Outside diagram-core
- ADR-0044: Routing Architecture — Data vs Algorithm
- ADR-0051: Connect/Disconnect Commands
