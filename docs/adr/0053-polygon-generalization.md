# ADR-0053: Polygon Generalization

**Date:** 2026-06-20
**Status:** Accepted
**Context:** Plan de paridad funcional con draw.io (Fase 1)

## Decision

The engine supports **free-form polygons** as a single new shape kind,
backed by the existing `PathElement` in the scene:

### Data shape

```rust
pub struct PolygonShape {
    pub id: VertexId,
    pub points: Vec<Point>,    // 3..n vertices
    pub style: ResolvedStyle,
}
```

### Style hint

`shape=polygon` selects the polygon renderer.

### SVG output

```xml
<polygon points="x1,y1 x2,y2 … xn,yn" fill="…" stroke="…"/>
```

### Constraints

- Minimum 3 points
- Maximum 64 points (avoids pathological cases)
- Self-intersecting polygons are allowed (no winding rule)
- Bounds derived from min/max of points (used by viewBox fit logic)

## Rationale

- draw.io's `mxGeometry` with no shape but a path string resolves to a polygon.
- The scene already has `PathElement` with `points: Vec<Point>`. We reuse it
  via a new `PolygonElement` variant that is simpler (no `d` path, just points).
- Avoids inventing a separate polyline vs polygon distinction for v1.

## Consequences

- **Positive**: 11th shape kind in the catalog, covers a common case.
- **Positive**: Minimal new code; reuses the existing `PathElement` machinery.
- **Positive**: The polygon fits naturally into the `viewBox` calculation
  via `element_bounds()`.
- **Negative**: Polylines (open paths) are not supported. Deferred to v2.
- **Negative**: Curved sides require cubic beziers. Deferred to v2.

## References

- ADR-0052: Shape Catalog
- `crates/diagram-scene/src/element.rs` (existing `PathElement`)
- `crates/diagram-render-svg/src/element.rs` (existing `path_to_svg`)
